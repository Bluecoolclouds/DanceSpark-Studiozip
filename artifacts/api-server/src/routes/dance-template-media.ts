import { Router, type IRouter } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { findCatalogue } from "../lib/catalogue-data";
import {
  allowedTemplateFile, templateMetadata, readTemplate, templateMime, templateLimit,
  TemplateStorageConfigurationError, storageStatus,
} from "../lib/template-storage";

const router: IRouter = Router();

// Only explicitly published catalogue assets are accessible; never arbitrary bucket paths.
router.get("/dance-templates/:id/:asset", async (req, res) => {
  const id = String(req.params.id), asset = String(req.params.asset);
  if (!allowedTemplateFile(id, asset)) { res.sendStatus(404); return; }
  const record = await findCatalogue(id);
  if (!record?.published) { res.sendStatus(404); return; }
  const abort = new AbortController();
  const onClose = () => abort.abort();
  res.on("close", onClose);
  try {
    const metadata = await templateMetadata(id, asset);
    if (res.destroyed) return;
    const size = metadata.ContentLength!;
    if (!Number.isSafeInteger(size) || size <= 0 || size > templateLimit(asset) || !metadata.ETag) throw new Error("Invalid media metadata");
    res.set({
      "Content-Type": templateMime(asset),
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      ETag: metadata.ETag,
    });
    if (metadata.LastModified) res.set("Last-Modified", metadata.LastModified.toUTCString());
    if (req.fresh) { res.status(304).end(); return; }
    let start = 0, end = size - 1;
    // A mismatched If-Range must return the complete current object.
    const ifRange = req.get("if-range");
    const useRange = req.headers.range && (!ifRange || ifRange === metadata.ETag ||
      (metadata.LastModified && Date.parse(ifRange) >= Math.floor(metadata.LastModified.getTime() / 1000) * 1000));
    if (useRange) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range!);
      const first = Number(match?.[1]), last = Number(match?.[2]);
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(first) || !Number.isSafeInteger(last) ||
          (!match[1] && last === 0)) {
        res.status(416).set("Content-Range", `bytes */${size}`).end(); return;
      }
      if (!match[1]) start = Math.max(0, size - last);
      else { start = first; end = match[2] ? Math.min(last, end) : end; }
      if (start > end || start >= size) {
        res.status(416).set("Content-Range", `bytes */${size}`).end(); return;
      }
      res.status(206).set("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    res.set("Content-Length", String(end - start + 1));
    if (req.method === "HEAD") { res.end(); return; }
    // IfMatch prevents mixing metadata from one version with bytes from a replacement.
    const { result, dispose } = await readTemplate(id, asset, metadata.ETag,
      useRange ? `bytes=${start}-${end}` : undefined, abort.signal);
    try {
      if (!(result.Body instanceof Readable)) throw new Error("Missing media body");
      await pipeline(result.Body, res);
    } finally { dispose(); }
  } catch (error) {
    if (res.destroyed) return;
    req.log.error({ templateId: id, asset }, "Template media unavailable");
    if (res.headersSent) { res.destroy(); return; }
    res.removeHeader("Content-Length");
    res.removeHeader("Content-Range");
    res.removeHeader("ETag");
    res.removeHeader("Last-Modified");
    res.set("Cache-Control", "no-store");
    const status = storageStatus(error);
    if (status === 404) res.status(404).json({ error: "Файл каталога не найден" });
    else if (error instanceof TemplateStorageConfigurationError) {
      res.status(503).json({ code: "r2_not_configured", error: "Хранилище R2 не настроено" });
    } else res.status(503).json({ error: "Медиа каталога временно недоступно" });
  } finally { res.off("close", onClose); }
});

export default router;
