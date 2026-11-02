/** Legacy file names have a timestamp and random suffix after the exact owner. */
export function isOwnedDraftMediaName(name: string, ownerId: string): boolean {
  if (!ownerId || ownerId === 'guest') return false;
  const escaped = encodeURIComponent(ownerId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}-\\d{13,}-[a-z0-9]+\\.(?:mp4|jpg|jpeg|png|webp)$`).test(name);
}
