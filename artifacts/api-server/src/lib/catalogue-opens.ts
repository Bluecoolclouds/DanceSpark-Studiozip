import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gte, lt } from "drizzle-orm";
import { db, danceCatalogue, danceCatalogueOpens } from "@workspace/db";
import { trendingCatalogueIds } from "./catalogue-badges";

const TREND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const VISITOR_RETENTION_MS = TREND_WINDOW_MS;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

let lastCleanupAt = 0;
let cleanupInFlight: Promise<void> | undefined;

async function pruneExpiredVisitors(now: Date): Promise<void> {
  if (now.getTime() - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  if (cleanupInFlight) return cleanupInFlight;

  cleanupInFlight = db.delete(danceCatalogueOpens)
    .where(lt(danceCatalogueOpens.lastOpenedAt, new Date(now.getTime() - VISITOR_RETENTION_MS)))
    .then(() => { lastCleanupAt = now.getTime(); })
    .finally(() => { cleanupInFlight = undefined; });
  await cleanupInFlight;
}

function hashVisitorToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function recordCatalogueOpen(catalogueId: string, visitorToken: string, now = new Date()): Promise<void> {
  await pruneExpiredVisitors(now);
  await db.insert(danceCatalogueOpens).values({
    catalogueId,
    visitorHash: hashVisitorToken(visitorToken),
    lastOpenedAt: now,
  }).onConflictDoUpdate({
    target: [danceCatalogueOpens.catalogueId, danceCatalogueOpens.visitorHash],
    set: { lastOpenedAt: now },
  });
}

export async function getTrendingCatalogueIds(now = new Date()): Promise<string[]> {
  await pruneExpiredVisitors(now);
  const rows = await db.select({
    catalogueId: danceCatalogueOpens.catalogueId,
    uniqueOpens: count(),
  }).from(danceCatalogueOpens)
    .innerJoin(danceCatalogue, eq(danceCatalogue.id, danceCatalogueOpens.catalogueId))
    .where(and(
      eq(danceCatalogue.published, true),
      gte(danceCatalogueOpens.lastOpenedAt, new Date(now.getTime() - TREND_WINDOW_MS)),
    ))
    .groupBy(danceCatalogueOpens.catalogueId)
    .orderBy(desc(count()), asc(danceCatalogueOpens.catalogueId))
    .limit(3);
  return trendingCatalogueIds(rows);
}
