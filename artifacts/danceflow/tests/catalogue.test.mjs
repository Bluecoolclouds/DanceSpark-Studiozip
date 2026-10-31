import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeCataloguePages, fromCatalogue } from '../lib/catalogue.ts';
import { readDrafts, writeDrafts } from '../lib/draft-storage.ts';
import { PHOTO_STYLE_IDS, photoStyleId } from '../constants/photo-styles.ts';

const template = {
  id: 'dance-server-only', title: 'Новый танец', category: 'trend', color: 'primary',
  bpm: null, energy: null, imageUri: '/api/dance-templates/dance-server-only/poster.jpg',
  videoUri: '/api/dance-templates/dance-server-only/video.mp4', referenceImageUris: [],
  sourceDurationSeconds: 12, durations: [10], moves: [],
};
test('server-only dances and original video links survive page merging without duplicates', () => {
  process.env.EXPO_PUBLIC_DOMAIN = 'dance.example.invalid';
  const items = mergeCataloguePages([{ items: [template] }, { items: [template, { ...template, id: 'next' }] }]);
  assert.deepEqual(items.map(t => t.id), ['dance-server-only', 'next']);
  assert.equal(items[0].videoUri, 'https://dance.example.invalid/api/dance-templates/dance-server-only/video.mp4');
  assert.deepEqual(mergeCataloguePages([]), []);
  assert.deepEqual(mergeCataloguePages([{ items: [] }]), []);
});
test('new drafts keep catalogue metadata snapshot, old drafts require no migration', async () => {
  const old = { id: 'old', templateId: 'bubblegum-rush', photoUri: 'file:///old.jpg', duration: 5, createdAt: 123 };
  const current = { ...old, id: 'new', templateId: template.id, templateSnapshot: fromCatalogue(template) };
  let raw;
  const storage = { setItem: async (_k, value) => { raw = value; }, getItem: async () => raw };
  await writeDrafts(storage, 'drafts', [old, current]);
  const read = await readDrafts(storage, 'drafts');
  assert.deepEqual(read[0], old);
  assert.equal(read[1].templateSnapshot.title, 'Новый танец');
  assert.equal(read[1].templateId, 'dance-server-only');
});
test('photo generation retains all seven compatible styles and rejects catalogue video IDs', () => {
  assert.deepEqual(PHOTO_STYLE_IDS, ['bubblegum-rush', 'lime-voltage', 'hexa-star', 'confetti-cannon', 'grid-runner', 'velvet-orbit', 'seoul-sparkle']);
  for (const id of PHOTO_STYLE_IDS) assert.equal(photoStyleId(id), id);
  assert.throws(() => photoStyleId('trend-01'), /Фото → танец/);
  assert.throws(() => photoStyleId('dance-server-only'), /Фото → танец/);
});
