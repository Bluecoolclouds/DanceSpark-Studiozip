import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { test, mock, afterEach } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { S3Client } from "@aws-sdk/client-s3";
import { cataloguePage, catalogueTemplate, recommendedIds } from "../src/lib/catalogue";
import { initialCatalogue, seedCatalogue, importCatalogue, readCatalogue } from "../src/lib/catalogue-data";
import router from "../src/routes/catalogue";
import mediaRouter from "../src/routes/dance-template-media";
import { isolatedDatabase } from "./helpers/database";
import type { CatalogueInput } from "@workspace/api-zod";
import { CreateVideoGenerationBody } from "@workspace/api-zod";
import { PHOTO_STYLE_IDS, photoStyleId } from "../../danceflow/constants/photo-styles";
import app from "../src/app";
import { logger } from "../src/lib/logger";

const pool = isolatedDatabase();
const input: CatalogueInput = { ...initialCatalogue[0].metadata } as CatalogueInput;
const records = initialCatalogue.map(row => catalogueTemplate(row.id, { ...row.metadata, published: true } as CatalogueInput));

test("photo creation still submits supported PixVerse styles, never server catalogue IDs", () => {
  const photoRequest = { clientRequestId: "photo-test", imageDataUrl: `data:image/jpeg;base64,${"a".repeat(100)}`, duration: 5 };
  for (const id of PHOTO_STYLE_IDS) {
    assert.equal(CreateVideoGenerationBody.safeParse({ ...photoRequest, styleId: photoStyleId(id) }).success, true);
  }
  assert.equal(CreateVideoGenerationBody.safeParse({ ...photoRequest, styleId: "trend-01" }).success, false);
  assert.equal(CreateVideoGenerationBody.safeParse({ ...photoRequest, styleId: "dance-server-only" }).success, false);
});
test("editorial recommendations have exact unchanged order across pages, independent of user state", () => {
  const shuffled = records.map(t => ({ ...t })).reverse();
  const first = cataloguePage(shuffled, { section: "recommended", limit: 2 });
  assert.deepEqual(first.items.map(t => t.id), ["trend-06", "trend-03"]);
  const last = cataloguePage(shuffled, { section: "recommended", limit: 2, cursor: first.nextCursor! });
  assert.deepEqual([...first.items, ...last.items].map(t => t.id), recommendedIds);
  assert.equal(last.nextCursor, null);
  assert.equal(last.hasNextPage, false);
  // Extra account-derived fields cannot affect editorial selection.
  assert.deepEqual(cataloguePage(shuffled, { section: "recommended", favorites: ["trend-01"], history: ["trend-02"] } as any).items.map(t => t.id), recommendedIds);
  shuffled.find(t => t.id === "trend-03")!.published = false;
  assert.deepEqual(cataloguePage(shuffled, { section: "recommended" }).items.map(t => t.id), ["trend-06", "trend-01"]);
});
test("stable keyset pages, tied order, final page and stale cursor after removal", () => {
  const items = records.map(t => ({ ...t, sortOrder: 0 }));
  const first = cataloguePage(items, { limit: 4 });
  assert.equal(first.total, 6);
  assert.equal(first.hasNextPage, true);
  const second = cataloguePage(items, { limit: 4, cursor: first.nextCursor! });
  assert.deepEqual([...first.items, ...second.items].map(t => t.id), records.map(t => t.id));
  assert.equal(second.hasNextPage, false);
  const removed = cataloguePage(items.filter(t => t.id !== "trend-04"), { cursor: first.nextCursor! });
  assert.deepEqual(removed.items.map(t => t.id), ["trend-05", "trend-06"]);
  const empty = cataloguePage(items.slice(0, 2), { cursor: first.nextCursor! });
  assert.deepEqual(empty, { items: [], total: 2, hasNextPage: false, nextCursor: null });
  assert.throws(() => cataloguePage(items, { cursor: "invalid" }), /курсор/);
  assert.throws(() => cataloguePage(items, { cursor: first.nextCursor!, search: "other" }), /курсор/);
});
test("search and category and BPM filters cover the whole catalogue before pagination", () => {
  const items = records.map((t, i) => ({ ...t, category: i % 2 ? "street" as const : "kpop" as const,
    title: `Dance ${i}`, bpm: i === 0 ? null : 100 + i * 5, moves: i === 4 ? ["Лунная волна"] : [] }));
  assert.deepEqual(cataloguePage(items, { search: "волна", category: "kpop", speed: "hype", limit: 1 }).items.map(t => t.id), ["trend-05"]);
  assert.equal(cataloguePage(items, { search: "волна", category: "street", speed: "hype" }).total, 0);
  assert.deepEqual(cataloguePage(items, { search: "  СТРИТ  ", speed: "chill" }).items.map(t => t.id), ["trend-02"]);
  assert.deepEqual(cataloguePage(items, { speed: "hype" }).items.map(t => t.id), ["trend-03", "trend-04", "trend-05", "trend-06"]);
  assert.deepEqual(cataloguePage([], {}), { items: [], total: 0, hasNextPage: false, nextCursor: null });
  assert.equal(cataloguePage(items.map(t => ({ ...t, published: false })), {}).total, 0);
  assert.equal(cataloguePage(items.map(t => ({ ...t, isNew: false })), { section: "featured" }).total, 0);
});
async function serve(application: express.Express, work: (root: string) => Promise<void>) {
  const server = application.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try { await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
function ownerApp() {
  const application = express();
  application.use(express.json(), (req, _res, next) => { req.log = logger; next(); });
  // Keep production authentication separate; exercise actual post-auth route handlers.
  for (const layer of (router as any).stack) {
    if (!layer.route) continue;
    const path = layer.route.path;
    const method = Object.keys(layer.route.methods)[0] as "get" | "post" | "put";
    application[method](path, ...layer.route.stack.map((entry: any) => entry.handle));
  }
  application.use(mediaRouter);
  return application;
}
afterEach(() => mock.restoreAll());
test("imported metadata with unavailable originals stays private, including old unchecked published seeds", async () => {
  await seedCatalogue();
  assert.equal((await readCatalogue()).length, 0);
  assert.equal((await readCatalogue(true)).length, 6);
  await pool.query(`UPDATE dance_catalogue SET published=true, metadata=metadata - '_importMediaChecked' WHERE id='trend-01'`);
  await importCatalogue();
  assert.equal((await readCatalogue()).length, 0);
});
test("existing metadata import is idempotent and never restores an unpublished record", async () => {
  process.env.CLOUDFLARE_R2_ACCOUNT_ID = "a".repeat(32);
  process.env.CLOUDFLARE_R2_BUCKET_NAME = "catalogue-test";
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "synthetic";
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "synthetic";
  mock.method(S3Client.prototype, "send", async () => ({ ETag: '"file"', ContentLength: 100 }));
  await pool.query("DELETE FROM dance_catalogue WHERE id IN ('trend-01','trend-02','trend-03')");
  await importCatalogue();
  assert.deepEqual((await readCatalogue()).map(t => t.id).sort(), ["trend-01", "trend-02", "trend-03"]);
  await pool.query("UPDATE dance_catalogue SET published=false WHERE id='trend-02'");
  await importCatalogue();
  assert.equal((await readCatalogue()).some(t => t.id === "trend-02"), false);
  assert.equal((await readCatalogue(true)).length, 6);
});
test("create, edit, reject missing originals, publish and unpublish dynamic id; only API media links", async () => {
  await serve(ownerApp(), async root => {
    let response = await fetch(`${root}/admin/catalogue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.match(created.id, /^dance-/);
    assert.equal(created.published, false);
    assert.equal(created.imageUri, `/api/dance-templates/${created.id}/poster.jpg`);
    const send = (data: unknown) => fetch(`${root}/admin/catalogue/${created.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    process.env.CLOUDFLARE_R2_ACCOUNT_ID = "a".repeat(32);
    process.env.CLOUDFLARE_R2_BUCKET_NAME = "catalogue-test";
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "synthetic";
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "synthetic";
    const storage = mock.method(S3Client.prototype, "send", async () => { throw new Error("missing"); });
    assert.equal((await send({ ...input, published: true })).status, 409);
    assert.equal((await fetch(`${root}/catalogue/${created.id}`)).status, 404);
    storage.mock.restore();
    mock.method(S3Client.prototype, "send", async () => ({ ETag: '"file"', ContentLength: 100 }));
    response = await send({ ...input, title: "Серверный танец", published: true });
    assert.equal(response.status, 200);
    const detail = await (await fetch(`${root}/catalogue/${created.id}`)).json();
    assert.equal(detail.title, "Серверный танец");
    assert.equal((await send({ ...input, sourceDurationSeconds: null, published: true })).status, 400);
    assert.equal((await send({ ...input, published: false })).status, 200);
    assert.equal((await fetch(`${root}/catalogue/${created.id}`)).status, 404);
    assert.equal((await fetch(`${root}/dance-templates/${created.id}/video.mp4`)).status, 404);
    assert.equal((await send({ ...input, title: "" })).status, 400);
    assert.equal((await fetch(`${root}/catalogue?limit=0`)).status, 400);
    assert.equal((await fetch(`${root}/catalogue?cursor=garbage`)).status, 400);
    const page = await (await fetch(`${root}/catalogue?limit=1`)).json();
    assert.equal(page.items.length, 1); assert.equal(page.hasNextPage, true);
    assert.equal((await (await fetch(`${root}/catalogue?search=not-a-dance`)).json()).hasNextPage, false);
  });
});
test("catalogue mutations and listing require a verified owner", async () => {
  await serve(app, async root => {
    for (const [path, method] of [["/admin/catalogue", "GET"], ["/admin/catalogue", "POST"], ["/admin/catalogue/trend-01", "PUT"], ["/admin/dance-templates/trend-01/poster.jpg", "PUT"]]) {
      assert.equal((await fetch(`${root}/api${path}`, { method })).status, 401);
    }
  });
});
