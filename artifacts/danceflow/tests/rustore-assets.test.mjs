import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assetProblems, imageDimensions } from '../scripts/check-rustore-assets.mjs';

test('parses actual store screenshot and app icon headers', async () => {
  const photo = imageDimensions(await readFile(new URL('../rustore/screenshots/02-create.jpg', import.meta.url)));
  assert.deepEqual(photo, { width: 402, height: 874, format: 'jpg', opaque: true });
  const icon = imageDimensions(await readFile(new URL('../assets/images/icon.png', import.meta.url)));
  assert.equal(icon.width, 1024);
  assert.equal(icon.height, 1024);
  assert.ok(assetProblems(icon, 100, true).length);
});

test('rejects invalid dimensions, oversized images and transparent icons', () => {
  assert.deepEqual(assetProblems({ width: 512, height: 512, opaque: true }, 100, true), []);
  assert.equal(assetProblems({ width: 512, height: 512, opaque: false }, 100, true).length, 1);
  assert.equal(assetProblems({ width: 2161, height: 3840 }, 100).length, 1);
  assert.equal(assetProblems({ width: 402, height: 874 }, 3 * 1024 * 1024 + 1).length, 1);
  assert.equal(assetProblems({ width: 0, height: 0 }, 100).length, 1);
  assert.throws(() => imageDimensions(Buffer.from('not an image')));
  assert.throws(() => imageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 2])));
});
