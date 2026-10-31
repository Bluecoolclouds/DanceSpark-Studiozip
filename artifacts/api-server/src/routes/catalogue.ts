import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, danceCatalogue } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateCatalogueTemplateBody, UpdateCatalogueTemplateBody, ListCatalogueQueryParams, ListCatalogueResponse, GetCatalogueTemplateResponse } from "@workspace/api-zod";
import { cataloguePage, catalogueTemplate, validCatalogueId } from "../lib/catalogue";
import { findCatalogue, readCatalogue, seedCatalogue } from "../lib/catalogue-data";
import { verifyCatalogueMedia } from "../lib/template-storage";
import { requireAccount, requireAdmin, protectAdminMutation } from "../middlewares/admin-auth";

const router: IRouter = Router();
router.get("/catalogue", async (req, res) => {
  const query = ListCatalogueQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Некорректные параметры каталога" }); return; }
  const records = await readCatalogue();
  try { res.json(ListCatalogueResponse.parse(cataloguePage(records, query.data))); }
  catch { res.status(400).json({ error: "Некорректный курсор каталога" }); }
});
router.get("/catalogue/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!validCatalogueId(id)) { res.sendStatus(404); return; }
  const template = (await readCatalogue()).find(t => t.id === id);
  if (!template) { res.status(404).json({ error: "Танец не опубликован" }); return; }
  res.json(GetCatalogueTemplateResponse.parse(template));
});
router.use("/admin/catalogue", requireAccount, requireAdmin, protectAdminMutation);
router.get("/admin/catalogue", async (_req, res) => {
  res.json((await readCatalogue(true)).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)));
});
router.post("/admin/catalogue", async (req, res) => {
  const body = CreateCatalogueTemplateBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Проверьте поля танца" }); return; }
  await seedCatalogue();
  const id = `dance-${randomUUID()}`;
  const metadata = { ...body.data, published: false, _importMediaChecked: true };
  await db.insert(danceCatalogue).values({ id, metadata, published: false, sortOrder: metadata.sortOrder });
  res.status(201).json(catalogueTemplate(id, metadata));
});
router.put("/admin/catalogue/:id", async (req, res) => {
  const id = String(req.params.id);
  const body = UpdateCatalogueTemplateBody.safeParse(req.body);
  if (!body.success || !validCatalogueId(id)) { res.status(400).json({ error: "Проверьте поля танца" }); return; }
  if (!await findCatalogue(id)) { res.sendStatus(404); return; }
  const metadata = body.data;
  if (metadata.published) {
    if (metadata.sourceDurationSeconds == null || metadata.durations.some(d => d > metadata.sourceDurationSeconds!)) {
      res.status(400).json({ error: "Укажите длительность исходного видео; варианты длительности не должны превышать её" }); return;
    }
    try {
      await verifyCatalogueMedia(id, metadata);
    } catch {
      res.status(409).json({ error: "Публикация невозможна: загрузите исходное видео, постер и все указанные дополнительные файлы; проверьте доступ к R2" }); return;
    }
  }
  await db.update(danceCatalogue).set({
    metadata: { ...metadata, _importMediaChecked: true, _ownerUnpublished: !metadata.published },
    published: metadata.published, sortOrder: metadata.sortOrder,
  }).where(eq(danceCatalogue.id, id));
  res.json(catalogueTemplate(id, metadata));
});
export default router;
