import type { CatalogueTemplate } from '@workspace/api-client-react';
import type { DanceTemplate } from '../constants/templates';

export function fromCatalogue(t: CatalogueTemplate): DanceTemplate {
  const absolute = (uri: string) => uri.startsWith('/') ? `https://${process.env.EXPO_PUBLIC_DOMAIN}${uri}` : uri;
  return {
    ...t, energy: t.energy as DanceTemplate['energy'],
    sourceDurationSeconds: t.sourceDurationSeconds ?? undefined,
    image: { uri: absolute(t.imageUri) }, videoUri: absolute(t.videoUri),
    videoPoster: t.videoPosterUri ? { uri: absolute(t.videoPosterUri) } : undefined,
    referenceImageUris: t.referenceImageUris.map(absolute),
    exampleResultUri: t.exampleResultUri ? absolute(t.exampleResultUri) : undefined,
  };
}

export function mergeCataloguePages(pages: { items: CatalogueTemplate[] }[]) {
  const seen = new Set<string>();
  return pages.flatMap(p => p.items).filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  }).map(fromCatalogue);
}
