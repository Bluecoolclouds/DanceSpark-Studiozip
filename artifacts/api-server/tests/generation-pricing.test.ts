import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GENERATION_MODELS, BASE_USD_PER_SECOND, estimateGenerationCost,
} from "../../danceflow/constants/generation";

test("only the two owner-selected Genjutsu Light endpoints are offered", () => {
  assert.deepEqual(GENERATION_MODELS.map((m) => m.endpointId), [
    "higgsfield/genjutsu-light/motion-transfer/v1.0",
    "higgsfield/genjutsu-light/object-swap/v1.0",
  ]);
});

test("15 seconds of input plus 15 seconds of output are both billable", () => {
  assert.equal(estimateGenerationCost("480p", 15)?.estimatedUsd, 1.5);
  assert.equal(estimateGenerationCost("720p", 15)?.estimatedUsd, 3);
  assert.equal(estimateGenerationCost("1080p", 15)?.estimatedUsd, 6);
});

test("only output is rounded up, not input reference duration", () => {
  const estimate = estimateGenerationCost("720p", 10.2);
  assert.equal(estimate?.expectedOutputSeconds, 10.2);
  assert.equal(estimate?.roundedOutputSeconds, 11);
  assert.equal(estimate?.inputSeconds, 10.2);
  assert.equal(estimate?.billableSeconds, 21.2);
  assert.equal(estimate?.estimatedUsd, 2.12);
});

test("Light output is capped at 15; long input is conservatively estimated before preprocessing", () => {
  const estimate = estimateGenerationCost("480p", 32.5);
  assert.equal(estimate?.expectedOutputSeconds, 15);
  assert.equal(estimate?.inputSeconds, 32.5);
  assert.equal(estimate?.billableSeconds, 47.5);
  assert.equal(estimate?.estimatedUsd, 2.375);
});

test("unknown or invalid durations never produce a fabricated zero-cost quote", () => {
  for (const duration of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(estimateGenerationCost("720p", duration), null);
  }
  assert.deepEqual(BASE_USD_PER_SECOND, { "480p": 0.05, "720p": 0.1, "1080p": 0.2 });
});
