// These IDs belong to the existing PixVerse photo-generation contract, not the
// owner-managed video catalogue. Never submit a catalogue UUID as a style ID.
export const PHOTO_STYLE_IDS = [
  'bubblegum-rush', 'lime-voltage', 'hexa-star', 'confetti-cannon',
  'grid-runner', 'velvet-orbit', 'seoul-sparkle',
] as const;
export type PhotoStyleId = typeof PHOTO_STYLE_IDS[number];
export function photoStyleId(id: string): PhotoStyleId {
  if (!(PHOTO_STYLE_IDS as readonly string[]).includes(id)) throw new Error('Выбери стиль для режима «Фото → танец»');
  return id as PhotoStyleId;
}
