import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

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
  const allowedHosts = [
    getClerkProxyHost(req),
    process.env.REPLIT_DEV_DOMAIN,
    process.env.REPLIT_EXPO_DEV_DOMAIN,
    process.env.REPLIT_INTERNAL_APP_DOMAIN,
  ].filter(Boolean);
  try {
    const parsed = new URL(origin);
    callback(null, {
      origin: parsed.protocol === "https:" && allowedHosts.includes(parsed.host) ? origin : false,
      credentials: true,
    });
  } catch {
    callback(null, { origin: false });
  }
}));
app.use(express.json({ limit: "18mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
})));

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // No raw provider error/headers/body: those can contain credentials and signed URLs.
  req.log.error({ category: error instanceof SyntaxError ? "invalid_json" : "request_failed" }, "API request failed");
  if (!res.headersSent) {
    res.status(error instanceof SyntaxError ? 400 : 500).json({ error: error instanceof SyntaxError ? "Некорректный JSON" : "Ошибка сервера. Повторите запрос позже" });
  }
});

export default app;
