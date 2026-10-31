import { Router, type IRouter } from "express";
import { createReadStream } from "node:fs";
import {
  cachedTemplateFile,
  isAllowedTemplateAsset,
  TemplateMediaError,
  uploadTemplateFile,
} from "../lib/template-storage";
import {
  protectAdminMutation,
  requireAccount,
  requireAdmin,
} from "../middlewares/admin-auth";

const router: IRouter = Router();

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

// Only explicitly published catalogue assets are accessible; never arbitrary bucket paths.
router.get("/dance-templates/:id/:asset", async (req, res) => {
  const id = routeParam(req.params.id);
  const asset = routeParam(req.params.asset);
  if (!isAllowedTemplateAsset(id, asset)) {
    res.sendStatus(404);
    return;
  }
  try {
    const { path, size } = await cachedTemplateFile(id, asset);
    if (res.destroyed) return;
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error("Invalid media size");
    res.set({
      "Content-Type": asset.endsWith(".webm") ? "video/webm" : asset.endsWith(".mp4") ? "video/mp4" : "image/jpeg",
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });
    let start = 0;
    let end = size - 1;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) {
        res.set("Content-Range", `bytes */${size}`).sendStatus(416);
        return;
      }
      if (!match[1]) {
        start = Math.max(0, size - Number(match[2]));
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        res.set("Content-Range", `bytes */${size}`).sendStatus(416);
        return;
      }
      res.status(206).set("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    res.set("Content-Length", String(end - start + 1));
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = createReadStream(path, { start, end });
    res.on("close", () => stream.destroy());
    stream.on("error", () => {
      req.log.error({ templateId: id, asset }, "Template media stream failed");
      if (!res.headersSent) res.status(502).json({ error: "Не удалось загрузить шаблон" });
      else res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    req.log.error({ templateId: id, asset }, "Template media unavailable");
    if (!res.headersSent) {
      const statusCode = error instanceof TemplateMediaError ? error.statusCode : 503;
      res.status(statusCode).json({ error: "Видео шаблона временно недоступно" });
    }
  }
});

router.put(
  "/admin/dance-templates/:id/:asset",
  requireAccount,
  requireAdmin,
  protectAdminMutation,
  async (req, res): Promise<void> => {
    const id = routeParam(req.params.id);
    const asset = routeParam(req.params.asset);
    if (!isAllowedTemplateAsset(id, asset)) {
      res.sendStatus(404);
      return;
    }
    const contentLength = Number(req.get("content-length"));
    const contentType = req.get("content-type")?.split(";")[0]?.trim();
    if (!contentType || !Number.isSafeInteger(contentLength)) {
      res.status(411).json({ error: "Укажи размер и тип файла" });
      return;
    }
    try {
      await uploadTemplateFile(id, asset, req, contentLength, contentType);
      res.status(204).end();
    } catch (error) {
      if (error instanceof TemplateMediaError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      req.log.error({ templateId: id, asset }, "Template media upload failed");
      res.status(502).json({ error: "Не удалось сохранить медиа" });
    }
  },
);

export default router;
