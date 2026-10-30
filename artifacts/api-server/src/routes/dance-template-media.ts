import { Router, type IRouter } from "express";
import { createReadStream } from "node:fs";
import { cachedTemplateFile } from "../lib/template-storage";

const router: IRouter = Router();
const templateIds = new Set(["trend-01", "trend-02", "trend-03", "trend-04", "trend-05"]);

// Only explicitly published catalogue assets are accessible; never arbitrary bucket paths.
router.get("/dance-templates/:id/:asset", async (req, res) => {
  const { id, asset } = req.params;
  if (!templateIds.has(id) || !["video.mp4", "preview.mp4", "preview.webm", "poster.jpg"].includes(asset)) {
    res.sendStatus(404);
    return;
  }
  try {
    const { path, size } = await cachedTemplateFile(id, asset);
    if (res.destroyed) return;
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error("Invalid media size");
    res.set({
      "Content-Type": asset === "preview.webm" ? "video/webm" : asset.endsWith(".mp4") ? "video/mp4" : "image/jpeg",
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
  } catch {
    req.log.error({ templateId: id, asset }, "Template media unavailable");
    if (!res.headersSent) res.status(503).json({ error: "Видео шаблона временно недоступно" });
  }
});

export default router;
