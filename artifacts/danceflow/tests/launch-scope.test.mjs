import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PIXVERSE_GENERATION_ENABLED, PIXVERSE_UNAVAILABLE_MESSAGE } from '../constants/launch-scope.ts';

test('the owner-approved Swapper-only launch scope explicitly disables unpriced PixVerse creation', () => {
  assert.equal(PIXVERSE_GENERATION_ENABLED, false);
  assert.match(PIXVERSE_UNAVAILABLE_MESSAGE, /подтверждённый тариф не настроен/);
  assert.match(PIXVERSE_UNAVAILABLE_MESSAGE, /Ранее созданные результаты остаются доступны/);
  const create = readFileSync(new URL('../app/(tabs)/create.tsx', import.meta.url), 'utf8');
  assert.match(create, /if \(!PIXVERSE_GENERATION_ENABLED\) return/);
  const draft = readFileSync(new URL('../app/draft/[id].tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(draft, /useCreateVideoGeneration|createGeneration\.mutateAsync/);
  assert.match(draft, /Запуск PixVerse недоступен/);
  assert.match(draft, /disabled=\{!!busy \|\| !d\.generationRequestId\}/);
  assert.match(draft, /useGetVideoGeneration/, 'existing job status remains accessible');
});
