import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { withLogtoAuthentication } from "./middlewares/auth-provider";
import { allowedWebOrigin } from "./lib/web-origins";

const app: Express = express();

// The API runs behind one trusted Replit edge proxy; req.ip resolves the
// visitor address without logging or persisting it.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  if (!origin) {
    callback(null, { origin: false });
    return;
  }
  callback(null, { origin: allowedWebOrigin(req, origin) ? origin : false, credentials: true });
}));
app.use(express.json({ limit: "18mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(withLogtoAuthentication(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
}))));

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // No raw provider error/headers/body: those can contain credentials and signed URLs.
  req.log.error({ category: error instanceof SyntaxError ? "invalid_json" : "request_failed" }, "API request failed");
  if (!res.headersSent) {
    const tooLarge = (error as { type?: string })?.type === "entity.too.large";
    res.status(tooLarge ? 413 : error instanceof SyntaxError ? 400 : 500).json({
      error: tooLarge ? "Файлы слишком большие." : error instanceof SyntaxError ? "Некорректный JSON" : "Ошибка сервера. Повторите запрос позже",
    });
  }
});

export default app;
