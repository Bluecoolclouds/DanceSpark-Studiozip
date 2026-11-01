import "./helpers/setup.mjs";
import assert from "node:assert/strict";
import { test, mock, afterEach } from "node:test";
import { createHash, randomUUID } from "node:crypto";
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
import { CATALOGUE_FRESH_WINDOW_MS, catalogueBadge, trendingCatalogueIds } from "../src/lib/catalogue-badges";

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
test("computed badges enforce the seven-day window, trending top three, and new-first priority", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  assert.equal(catalogueBadge(true, new Date(now.getTime() - CATALOGUE_FRESH_WINDOW_MS), true, now), "new");
  assert.equal(catalogueBadge(true, new Date(now.getTime() - CATALOGUE_FRESH_WINDOW_MS - 1), true, now), "trending");
  assert.equal(catalogueBadge(true, null, false, now), null);
  assert.equal(catalogueBadge(false, now, true, now), null);
  assert.deepEqual(trendingCatalogueIds([
    { catalogueId: "delta", uniqueOpens: 4 },
    { catalogueId: "charlie", uniqueOpens: 9 },
    { catalogueId: "bravo", uniqueOpens: 12 },
    { catalogueId: "alpha", uniqueOpens: 9 },
    { catalogueId: "empty", uniqueOpens: 0 },
  ]), ["bravo", "alpha", "charlie"]);
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
  assert.equal(cataloguePage(items, { section: "featured" }).total, 0);
  const badges = items.map((t, i) => ({ ...t, badge: i === 1 ? "new" as const : i === 2 ? "trending" as const : null }));
  assert.deepEqual(cataloguePage(badges, { section: "featured" }).items.map(t => t.id), ["trend-02"]);
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
test("reimport never invents a publication date for an existing published card", async () => {
  process.env.CLOUDFLARE_R2_ACCOUNT_ID = "a".repeat(32);
  process.env.CLOUDFLARE_R2_BUCKET_NAME = "catalogue-test";
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "synthetic";
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "synthetic";
  mock.method(S3Client.prototype, "send", async () => ({ ETag: '"file"', ContentLength: 100 }));
  await seedCatalogue();
  await pool.query(`UPDATE dance_catalogue
    SET published=true, published_at=null, metadata=metadata - '_importMediaChecked'
    WHERE id='trend-01'`);

  await importCatalogue();

  const { rows: [legacy] } = await pool.query("SELECT published, published_at FROM dance_catalogue WHERE id='trend-01'");
  assert.equal(legacy.published, true);
  assert.equal(legacy.published_at, null);
  assert.equal((await readCatalogue()).find(item => item.id === "trend-01")?.badge, null);
});
test("restored seed media is returned by the public catalogue without restoring owner-unpublished cards", async () => {
  process.env.CLOUDFLARE_R2_ACCOUNT_ID = "a".repeat(32);
  process.env.CLOUDFLARE_R2_BUCKET_NAME = "catalogue-test";
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID = "synthetic";
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY = "synthetic";
  mock.method(S3Client.prototype, "send", async () => ({ ETag: '"file"', ContentLength: 100 }));
  await pool.query("DELETE FROM dance_catalogue WHERE id IN ('trend-01','trend-02','trend-03')");
  await importCatalogue();
  assert.deepEqual((await readCatalogue()).map(t => t.id).sort(), [
    "trend-01", "trend-02", "trend-03", "trend-04", "trend-05", "trend-06",
  ]);
  await serve(ownerApp(), async root => {
    const response = await fetch(`${root}/catalogue?limit=50`);
    assert.equal(response.status, 200);
    const page = await response.json();
    assert.equal(page.total, 6);
    assert.equal(page.items.length, 6);
    assert.ok(page.items.every((item: any) => item.imageUri && item.videoUri));
  });
  await pool.query(`UPDATE dance_catalogue
    SET published=false, metadata=metadata || '{"_ownerUnpublished":true}'::jsonb
    WHERE id='trend-02'`);
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
    let detail = await (await fetch(`${root}/catalogue/${created.id}`)).json();
    assert.equal(detail.title, "Серверный танец");
    assert.equal(detail.badge, "new");
    assert.ok(detail.publishedAt);
    const visitorToken = "77777777-7777-4777-8777-777777777777";
    for (let i = 0; i < 2; i++) {
      const open = await fetch(`${root}/catalogue/${created.id}/open`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorToken }),
      });
      assert.equal(open.status, 204);
    }
    const opens = await pool.query("SELECT visitor_hash FROM dance_catalogue_opens WHERE catalogue_id=$1", [created.id]);
    assert.equal(opens.rowCount, 1);
    assert.equal(opens.rows[0].visitor_hash, createHash("sha256").update(visitorToken).digest("hex"));
    assert.notEqual(opens.rows[0].visitor_hash, visitorToken);
    await pool.query("UPDATE dance_catalogue SET published_at=now()-interval '8 days' WHERE id=$1", [created.id]);
    detail = await (await fetch(`${root}/catalogue/${created.id}`)).json();
    assert.equal(detail.badge, "trending");
    for (const [id, visitorCount] of [["trend-01", 3], ["trend-03", 2], ["trend-04", 2], ["trend-05", 1]] as const) {
      for (let i = 0; i < visitorCount; i++) {
        const open = await fetch(`${root}/catalogue/${id}/open`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visitorToken: randomUUID() }),
        });
        assert.equal(open.status, 204);
      }
    }
    await pool.query(`UPDATE dance_catalogue SET published_at=now()-interval '8 days'
      WHERE id IN ('trend-01','trend-03','trend-04','trend-05')`);
    const ranked = await (await fetch(`${root}/catalogue?limit=50`)).json();
    assert.deepEqual(ranked.items.filter((item: any) => item.badge === "trending").map((item: any) => item.id).sort(),
      ["trend-01", "trend-03", "trend-04"]);
    assert.equal(ranked.items.find((item: any) => item.id === "trend-05").badge, null);
    assert.equal(ranked.items.find((item: any) => item.id === created.id).badge, null);
    assert.equal((await fetch(`${root}/catalogue/${created.id}/open`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorToken: "not-a-uuid" }),
    })).status, 400);
    assert.equal((await send({ ...input, sourceDurationSeconds: null, published: true })).status, 400);
    assert.equal((await send({ ...input, published: false })).status, 200);
    assert.equal((await fetch(`${root}/catalogue/${created.id}`)).status, 404);
    assert.equal((await fetch(`${root}/catalogue/${created.id}/open`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorToken }),
    })).status, 404);
    const unpublished = await pool.query("SELECT published_at FROM dance_catalogue WHERE id=$1", [created.id]);
    assert.equal(unpublished.rows[0].published_at, null);
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
