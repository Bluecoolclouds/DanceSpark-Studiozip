export const CATALOGUE_FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export type CatalogueBadge = "new" | "trending" | null;

export function trendingCatalogueIds(
  counts: Array<{ catalogueId: string; uniqueOpens: number }>,
  limit = 3,
): string[] {
  return counts
    .filter((row) => row.uniqueOpens > 0)
    .sort((a, b) => b.uniqueOpens - a.uniqueOpens || a.catalogueId.localeCompare(b.catalogueId))
    .slice(0, limit)
    .map((row) => row.catalogueId);
}

export function catalogueBadge(
  published: boolean,
  publishedAt: Date | null,
  isTrending: boolean,
  now = new Date(),
): CatalogueBadge {
  if (published && publishedAt) {
    const age = now.getTime() - publishedAt.getTime();
    if (age >= 0 && age <= CATALOGUE_FRESH_WINDOW_MS) return "new";
  }
  return published && isTrending ? "trending" : null;
}
