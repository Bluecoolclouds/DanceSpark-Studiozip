import { createHash } from "node:crypto";
import type { CatalogueInput, CatalogueTemplate } from "@workspace/api-zod";
import type { CatalogueBadge } from "./catalogue-badges";

// Editorial selection, deliberately independent of favorites and viewing history.
export const recommendedIds = ["trend-06", "trend-03", "trend-01"];
export const validCatalogueId = (id: string) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(id);
export const requiredCatalogueAssets = (data: CatalogueInput) => [
  "poster.jpg", "video.mp4",
  ...(data.hasVideoPoster ? ["reference-poster.jpg"] : []),
  ...(data.hasExample ? ["result.mp4"] : []),
  ...Array.from({ length: data.referenceCount }, (_, i) => `character-0${i + 1}.jpg`),
];
export function catalogueTemplate(
  id: string,
  data: CatalogueInput,
  publishedAt: Date | null = null,
  badge: CatalogueBadge = null,
): CatalogueTemplate {
  const media = (asset: string) => `/api/dance-templates/${id}/${asset}`;
  return { ...data, id, imageUri: media("poster.jpg"), videoUri: media("video.mp4"),
    videoPosterUri: data.hasVideoPoster ? media("reference-poster.jpg") : undefined,
    referenceImageUris: Array.from({ length: data.referenceCount }, (_, i) => media(`character-0${i + 1}.jpg`)),
    publishedAt,
    badge,
    exampleResultUri: data.hasExample ? media("result.mp4") : undefined };
}
export interface CatalogueQuery {
  cursor?: string; limit?: number; search?: string; category?: string; speed?: string; section?: string;
}
const labels: Record<string, string> = { kpop: "K-pop", street: "Стрит", disco: "Диско", trend: "Тренды" };
export function cataloguePage(records: CatalogueTemplate[], query: CatalogueQuery) {
  const search = (query.search ?? "").trim().toLocaleLowerCase();
  const category = query.category ?? "all", speed = query.speed ?? "any", section = query.section ?? "all";
  const fingerprint = createHash("sha256").update(JSON.stringify([search, category, speed, section])).digest("hex").slice(0, 16);
  const order = (t: CatalogueTemplate) => section === "recommended" ? recommendedIds.indexOf(t.id) : t.sortOrder;
  const compare = (a: CatalogueTemplate, b: CatalogueTemplate) => order(a) - order(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const filtered = records.filter(t => t.published &&
    (section !== "recommended" || recommendedIds.includes(t.id)) &&
    (section !== "featured" || t.badge === "new") &&
    (category === "all" || t.category === category) &&
    (speed === "any" || (t.bpm !== null && (speed === "chill" ? t.bpm < 110 : t.bpm >= 110))) &&
    (!search || [t.title, t.dancer, t.category, labels[t.category], t.tagline, t.description, ...t.moves]
      .some(value => value.toLocaleLowerCase().includes(search)))).sort(compare);
  let after: { order: number; id: string } | undefined;
  if (query.cursor) {
    try {
      const value = JSON.parse(Buffer.from(query.cursor, "base64url").toString());
      if (value.fingerprint !== fingerprint || !Number.isSafeInteger(value.order) || !validCatalogueId(value.id)) throw new Error();
      after = value;
    } catch { throw new Error("Некорректный курсор каталога"); }
  }
  const remaining = after ? filtered.filter(t => order(t) > after!.order || (order(t) === after!.order && t.id > after!.id)) : filtered;
  const items = remaining.slice(0, query.limit ?? 12);
  const hasNextPage = remaining.length > items.length;
  const last = items.at(-1);
  const nextCursor = hasNextPage && last
    ? Buffer.from(JSON.stringify({ fingerprint, order: order(last), id: last.id })).toString("base64url") : null;
  return { items, hasNextPage, nextCursor, total: filtered.length };
}
