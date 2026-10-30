import assert from 'node:assert/strict';
import test from 'node:test';
import { CorruptDraftStorageError, readDrafts, writeDrafts } from '../lib/draft-storage.ts';

const storedDraft = {
  id: 'draft-one',
  templateId: 'salsa',
  photoUri: 'file:///photo.jpg',
  duration: 5,
  createdAt: 123,
};

test('a failed read is surfaced instead of being treated as an empty list', async () => {
  const storage = {
    getItem: async () => { throw new Error('storage unavailable'); },
  };
  await assert.rejects(readDrafts(storage, 'danceflow:drafts:user-a'), /storage unavailable/);
});

test('corrupt draft data is rejected without attempting to overwrite its source', async () => {
  let writes = 0;
  const storage = {
    getItem: async () => '{not json',
    setItem: async () => { writes += 1; },
  };
  await assert.rejects(
    readDrafts(storage, 'danceflow:drafts:user-a'),
    (error) => error instanceof CorruptDraftStorageError && error.key === 'danceflow:drafts:user-a',
  );
  assert.equal(writes, 0);
});

test('invalid draft shapes are treated as corruption', async () => {
  const storage = { getItem: async () => JSON.stringify({ id: 'not-a-list' }) };
  await assert.rejects(readDrafts(storage, 'danceflow:drafts'), CorruptDraftStorageError);
});

test('a failed write is surfaced and remains scoped to the requested account key', async () => {
  const writes = [];
  const storage = {
    setItem: async (key, value) => {
      writes.push({ key, value });
      throw new Error('storage full');
    },
  };
  await assert.rejects(writeDrafts(storage, 'danceflow:drafts:user-a', [storedDraft]), /storage full/);
  assert.deepEqual(writes.map(({ key }) => key), ['danceflow:drafts:user-a']);
});

test('account-scoped values are read and written with their own keys', async () => {
  const values = new Map([
    ['danceflow:drafts:user-a', JSON.stringify([storedDraft])],
    ['danceflow:drafts:user-b', JSON.stringify([])],
  ]);
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
  };

  assert.deepEqual(await readDrafts(storage, 'danceflow:drafts:user-a'), [storedDraft]);
  assert.deepEqual(await readDrafts(storage, 'danceflow:drafts:user-b'), []);
  await writeDrafts(storage, 'danceflow:drafts:user-a', []);
  assert.deepEqual(JSON.parse(values.get('danceflow:drafts:user-b')), []);
  assert.deepEqual(JSON.parse(values.get('danceflow:drafts:user-a')), []);
});
