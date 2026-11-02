import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeApiOrigin } from '../lib/api-origin.ts';
import { isOwnedDraftMediaName } from '../lib/draft-media-scope.ts';

test('release never silently falls back to a development domain', () => {
  assert.throws(() => nativeApiOrigin({ development: false, developmentDomain: 'preview.replit.dev' }), /EXPO_PUBLIC_API_ORIGIN/);
  for (const origin of ['http://danceflow.example', 'https://preview.replit.dev', 'https://localhost', 'https://127.0.0.1',
    'https://user:password@danceflow.example', 'https://danceflow.example/api', 'https://danceflow.example/?token=x']) {
    assert.throws(() => nativeApiOrigin({ development: false, productionOrigin: origin }));
  }
  assert.equal(nativeApiOrigin({ development: false, productionOrigin: 'https://api.danceflow.example/' }), 'https://api.danceflow.example');
  assert.equal(nativeApiOrigin({ development: true, developmentDomain: 'preview.replit.dev' }), 'https://preview.replit.dev');
});

test('local cleanup never includes guest media, another owner, or a path traversal', () => {
  const suffix = '-1793580016970-abc123.mp4';
  assert.equal(isOwnedDraftMediaName(`user_a${suffix}`, 'user_a'), true);
  assert.equal(isOwnedDraftMediaName(`user_a-b${suffix}`, 'user_a'), false);
  assert.equal(isOwnedDraftMediaName(`user_b${suffix}`, 'user_a'), false);
  assert.equal(isOwnedDraftMediaName(`guest${suffix}`, 'guest'), false);
  assert.equal(isOwnedDraftMediaName(`../user_a${suffix}`, 'user_a'), false);
  assert.equal(isOwnedDraftMediaName(`danceflow-result.mp4`, 'user_a'), false);
  assert.equal(isOwnedDraftMediaName(`user.a${suffix}`, 'user.a'), true);
  assert.equal(isOwnedDraftMediaName(`userXa${suffix}`, 'user.a'), false);
});
