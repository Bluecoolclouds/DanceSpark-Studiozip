import { db, danceCatalogue } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { CreateCatalogueTemplateBody as InputSchema, type CatalogueInput } from "@workspace/api-zod";
import { catalogueTemplate } from "./catalogue";
import { catalogueBadge } from "./catalogue-badges";
import { getTrendingCatalogueIds } from "./catalogue-opens";
import { verifyCatalogueMedia } from "./template-storage";

const prompt = "Музыкальная студия с однотонной оранжевой стеной и желтым полом. Слева стоит человек с фото-референса 1, справа — человек с фото-референса 2, оба в повседневной одежде. Между ними с потолка на проводе свисает один студийный микрофон. Герои по очереди читают рэп, кивают в такт и жестикулируют, время от времени поворачиваются друг к другу. Лица строго как на референсах, не менять черты. Static camera, medium shot, soft even studio light, 35mm, natural skin texture. Без второго микрофона, без логотипов и текста.";
export const initialCatalogue = [13.000522, 15.092971, 41.988005, 20.064, 21.566667, 11.055011].map((seconds, index) => {
  const id = `trend-0${index + 1}`;
  const metadata: CatalogueInput = {
    title: `Тренд 0${index + 1}`, dancer: "", category: "trend", tagline: "Реальное видео с движениями",
    description: `Исходный ролик: ${Math.round(seconds)} сек, со звуком. Посмотри видео и выбери его для переноса движений на персонажа с твоего фото.`,
    bpm: null, energy: null, durations: [Math.min(Math.floor(seconds), 15)], moves: [],
    color: (["primary", "secondary", "violet", "accent", "primary", "secondary"] as const)[index],
    sourceDurationSeconds: seconds, published: false, sortOrder: index,
    referenceCount: index === 5 ? 2 : 0, hasVideoPoster: index === 5, hasExample: index === 5,
    prompt: index === 5 ? prompt : "",
  };
  return { id, metadata: { ...metadata }, published: false, sortOrder: index };
});
let seeded: Promise<unknown> | undefined;
export async function seedCatalogue() {
  seeded ??= importCatalogue().catch(error => { seeded = undefined; throw error; });
  await seeded;
}
export async function importCatalogue() {
  // Import metadata only. A missing original never becomes a published card.
  const inserted = await db.insert(danceCatalogue).values(initialCatalogue).onConflictDoNothing().returning({ id: danceCatalogue.id });
  const newIds = new Set(inserted.map(row => row.id));
  const rows = await db.select().from(danceCatalogue).where(inArray(danceCatalogue.id, initialCatalogue.map(row => row.id)));
  await Promise.all(rows.map(async row => {
    const seed = initialCatalogue.find(item => item.id === row.id);
    const ownerUnpublished = row.metadata._ownerUnpublished === true;
    let unchangedSeed = false;
    if (seed && !ownerUnpublished) {
      try {
        unchangedSeed = JSON.stringify(InputSchema.parse({
          ...row.metadata, published: false, sortOrder: seed.sortOrder,
        })) === JSON.stringify(InputSchema.parse({
          ...seed.metadata, published: false, sortOrder: seed.sortOrder,
        }));
      } catch { /* Invalid or owner-edited metadata is not an automatic seed. */ }
    }
    if (ownerUnpublished || (row.metadata._importMediaChecked === true && !unchangedSeed)) return;
    let published = false;
    if (unchangedSeed || row.published || newIds.has(row.id)) {
      try { await verifyCatalogueMedia(row.id, InputSchema.parse(row.metadata)); published = true; }
      catch { /* Metadata stays as an owner-editable draft until original uploads exist. */ }
    }
    // A concurrent owner edit or publication must win over the import migration.
    const publishedAt = published ? (row.published ? row.publishedAt : new Date()) : null;
    const metadata = { ...row.metadata };
    delete metadata.isNew;
    await db.update(danceCatalogue).set({ metadata: { ...metadata, _importMediaChecked: true }, published, publishedAt })
      .where(and(eq(danceCatalogue.id, row.id), eq(danceCatalogue.metadata, row.metadata),
        eq(danceCatalogue.published, row.published), row.publishedAt == null
          ? isNull(danceCatalogue.publishedAt)
          : eq(danceCatalogue.publishedAt, row.publishedAt)));
  }));
}
export async function readCatalogue(includeDrafts = false) {
  await seedCatalogue();
  const records = await db.select().from(danceCatalogue).where(includeDrafts ? undefined : eq(danceCatalogue.published, true));
  const trendingIds = new Set(await getTrendingCatalogueIds());
  const now = new Date();
  return records.map(row => {
    const data = InputSchema.parse({ ...row.metadata, published: row.published, sortOrder: row.sortOrder });
    const badge = catalogueBadge(row.published, row.publishedAt, trendingIds.has(row.id), now);
    return catalogueTemplate(row.id, data, row.publishedAt, badge);
  });
}
export async function findCatalogue(id: string) {
  await seedCatalogue();
  const [record] = await db.select().from(danceCatalogue).where(eq(danceCatalogue.id, id));
  return record;
}
