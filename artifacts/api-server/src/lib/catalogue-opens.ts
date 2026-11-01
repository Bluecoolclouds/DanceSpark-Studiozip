import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gte, lt } from "drizzle-orm";
import { db, danceCatalogue, danceCatalogueOpens } from "@workspace/db";
import { trendingCatalogueIds } from "./catalogue-badges";

const TREND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const VISITOR_RETENTION_MS = TREND_WINDOW_MS;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const SOURCE_RETENTION_MS = TREND_WINDOW_MS;
const SOURCE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_SOURCE_RECORDS = 100_000;

let lastCleanupAt = 0;
let cleanupInFlight: Promise<void> | undefined;
let lastSourceCleanupAt = 0;
const sourceHashKey = randomBytes(32);
const sourceVisitors = new Map<string, { visitorHash: string; expiresAt: number }>();

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

function hashSource(sourceAddress: string): string {
  return createHmac("sha256", sourceHashKey).update(sourceAddress).digest("hex");
}

function pruneSourceVisitors(now: number, force = false): void {
  if (!force && now - lastSourceCleanupAt < SOURCE_CLEANUP_INTERVAL_MS) return;
  for (const [key, record] of sourceVisitors) {
    if (record.expiresAt <= now) sourceVisitors.delete(key);
  }
  lastSourceCleanupAt = now;
}

export async function recordCatalogueOpen(
  catalogueId: string,
  visitorToken: string,
  sourceAddress: string | undefined,
  now = new Date(),
): Promise<void> {
  await pruneExpiredVisitors(now);
  const visitorHash = hashVisitorToken(visitorToken);
  const existing = await db.select({ visitorHash: danceCatalogueOpens.visitorHash })
    .from(danceCatalogueOpens)
    .where(and(
      eq(danceCatalogueOpens.catalogueId, catalogueId),
      eq(danceCatalogueOpens.visitorHash, visitorHash),
    ))
    .limit(1);

  // Reopens of the same anonymous token remain valid and never consume another
  // source slot, even when the visitor's network address has changed.
  if (existing.length) {
    await db.insert(danceCatalogueOpens).values({
      catalogueId, visitorHash, lastOpenedAt: now,
    }).onConflictDoUpdate({
      target: [danceCatalogueOpens.catalogueId, danceCatalogueOpens.visitorHash],
      set: { lastOpenedAt: now },
    });
    return;
  }

  if (!sourceAddress) return;
  const timestamp = now.getTime();
  pruneSourceVisitors(timestamp);
  const sourceKey = `${hashSource(sourceAddress)}:${catalogueId}`;
  const prior = sourceVisitors.get(sourceKey);

  // At most one distinct visitor token from a network source can affect a
  // card's ranking during the seven-day window. Only the keyed digest is kept
  // in process memory; the source address is never written to the database.
  if (prior && prior.expiresAt > timestamp && prior.visitorHash !== visitorHash) return;
  if (!prior && sourceVisitors.size >= MAX_SOURCE_RECORDS) {
    pruneSourceVisitors(timestamp, true);
    if (sourceVisitors.size >= MAX_SOURCE_RECORDS) return;
  }

  const reservation = { visitorHash, expiresAt: timestamp + SOURCE_RETENTION_MS };
  sourceVisitors.set(sourceKey, reservation);
  try {
    await db.insert(danceCatalogueOpens).values({
      catalogueId,
      visitorHash,
      lastOpenedAt: now,
    }).onConflictDoUpdate({
      target: [danceCatalogueOpens.catalogueId, danceCatalogueOpens.visitorHash],
      set: { lastOpenedAt: now },
    });
  } catch (error) {
    if (sourceVisitors.get(sourceKey) === reservation) sourceVisitors.delete(sourceKey);
    throw error;
  }
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
