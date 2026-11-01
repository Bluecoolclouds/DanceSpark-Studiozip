import assert from 'node:assert/strict';
import test from 'node:test';
import { getGenerationModel, estimateGenerationCost, outputLimit } from '../constants/generation.ts';
import { parseDrafts, CorruptDraftStorageError } from '../lib/draft-storage.ts';
import { SWAPPER_MODELS, swapperCostUsd } from '../../api-server/src/lib/swapper-models.ts';

test('both families resolve both modes to exact supported provider endpoints', () => {
  for (const family of ['light', 'standard']) for (const mode of ['motion-transfer', 'object-swap']) {
    const model = getGenerationModel(mode, family);
    assert.equal(model.endpointId, `higgsfield/${family === 'light' ? 'genjutsu-light' : 'genjutsu'}/${mode}/v1.0`);
    assert.ok(SWAPPER_MODELS.includes(model.endpointId));
  }
  assert.equal(getGenerationModel('object-swap').endpointId, 'higgsfield/genjutsu-light/object-swap/v1.0');
  assert.equal(outputLimit(), 15);
  assert.equal(outputLimit('standard'), 30);
});

test('UI estimates and trusted server model tariffs agree without mixing billing formulas', () => {
  for (const family of ['light', 'standard']) for (const resolution of ['480p', '720p', '1080p'])
    for (const seconds of [4, 13.2, 15, 29.6, 31.2, 300]) {
      const model = getGenerationModel('motion-transfer', family);
      const estimate = estimateGenerationCost(resolution, seconds, family);
      assert.ok(Math.abs(estimate.estimatedUsd - swapperCostUsd(model.endpointId, seconds, resolution)) < 0.000001);
      assert.equal(estimate.expectedOutputSeconds, Math.min(seconds, outputLimit(family)));
    }
  assert.equal(estimateGenerationCost('720p', 10).estimatedUsd, 2);
  assert.equal(estimateGenerationCost('720p', 10, 'standard').estimatedUsd, 6.81);
  assert.equal(estimateGenerationCost('720p', 10.1, 'standard').billableSeconds, 11);
  assert.equal(estimateGenerationCost('720p', undefined, 'standard'), null);
  assert.equal(swapperCostUsd('unapproved-model', 10, '720p'), null);
});

test('draft persistence retains family and legacy drafts stay on Light', () => {
  const base = { id: 'family-draft', templateId: 'dance', photoUri: 'photo', duration: 10, createdAt: 1, model: 'object-swap' };
  for (const family of ['light', 'standard', undefined]) {
    const [loaded] = parseDrafts(JSON.stringify([{ ...base, modelFamily: family }]), 'drafts');
    assert.equal(loaded.modelFamily, family);
    assert.equal(getGenerationModel(loaded.model, loaded.modelFamily).endpointId.includes('/genjutsu-light/'), family !== 'standard');
  }
  assert.throws(() => parseDrafts(JSON.stringify([{ ...base, modelFamily: 'unknown' }]), 'drafts'), CorruptDraftStorageError);
});
