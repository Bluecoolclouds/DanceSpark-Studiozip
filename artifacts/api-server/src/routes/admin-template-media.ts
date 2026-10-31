import express, { Router, type IRouter } from "express";
import { requireAccount, requireAdmin, protectAdminMutation } from "../middlewares/admin-auth";
import {
  allowedTemplateFile, saveTemplate, templateMime, templateLimit, validTemplateBytes,
  TemplateStorageConfigurationError,
} from "../lib/template-storage";
import { pool } from "@workspace/db";
import { audit } from "../lib/admin-data";

const router: IRouter = Router();
// Bound buffered upload memory across all administrators. Authentication precedes parsing.
let uploading: symbol | undefined;
router.put("/admin/dance-templates/:id/:asset",
  requireAccount, requireAdmin, protectAdminMutation,
  (req, res, next) => {
    const id = String(req.params.id), asset = String(req.params.asset);
    if (!allowedTemplateFile(id, asset)) { res.sendStatus(404); return; }
    if (req.get("content-type") !== templateMime(asset) || req.get("content-encoding")) {
      res.status(415).json({ error: "Нужен исходный файл с правильным Content-Type, без сжатия" }); return;
    }
    if (uploading) { res.status(429).set("Retry-After", "5").json({ error: "Дождитесь завершения загрузки" }); return; }
    const slot = Symbol("catalogue-upload");
    uploading = slot;
    const release = () => { if (uploading === slot) uploading = undefined; };
    let working = false;
    // Do not release the slot on a disconnected response while a PUT is still running.
    res.locals.mediaUploadDone = () => { working = false; release(); };
    res.once("close", () => { if (!working) release(); });
    express.raw({ type: () => true, limit: templateLimit(asset), inflate: false })(req, res, (error) => {
      if (error) {
        release();
        res.status((error as { status?: number }).status === 413 ? 413 : 400)
          .json({ error: "Файл слишком большой или загрузка прервана" }); return;
      }
      if (res.destroyed) { release(); return; }
      working = true;
      next();
    });
  },
  async (req, res) => {
    const id = String(req.params.id), asset = String(req.params.asset);
    try {
      if (!Buffer.isBuffer(req.body) || !validTemplateBytes(asset, req.body)) {
        res.status(400).json({ error: "Пустой файл или содержимое не соответствует формату" }); return;
      }
      const result = await saveTemplate(id, asset, req.body);
      // Audit contains only allowlisted identifiers, never SDK errors or credentials.
      const client = await pool.connect();
      try {
        await audit(client, res.locals.account.id, "catalogue.media.put", `${id}/${asset}`, `bytes=${req.body.length}`);
      } finally { client.release(); }
      res.json({ id, asset, size: req.body.length, etag: result.ETag });
    } catch (error) {
      req.log.error({ templateId: id, asset }, "Catalogue media upload failed");
      res.status(503).json(error instanceof TemplateStorageConfigurationError
        ? { code: "r2_not_configured", error: "Хранилище R2 не настроено" }
        : { error: "Не удалось подтвердить сохранение файла. Проверьте его перед повтором" });
    } finally { res.locals.mediaUploadDone(); }
  },
);
export default router;
