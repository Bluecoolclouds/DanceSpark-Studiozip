import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/better-auth";
import { requireAccount } from "./middlewares/admin-auth";
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
app.use(cors((req, callback) => {
  const origin = req.headers.origin;
  if (!origin) {
    callback(null, { origin: false });
    return;
  }
  callback(null, { origin: allowedWebOrigin(req, origin) ? origin : false, credentials: true });
}));
// Product session route uses the canonical account, not the auth library's subject.
app.get("/api/auth/session", requireAccount, (_req, res) => {
  const account = res.locals.account;
  res.json({ accountId: account.id, email: account.email, role: account.role });
});
// Express 5 wildcard; Better Auth must read the body before Express consumes it.
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json({ limit: "18mb" }));
app.use(express.urlencoded({ extended: true }));

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
