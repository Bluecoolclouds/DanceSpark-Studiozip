/** Selected by the product owner. Never silently substitute the non-Light endpoints. */
export const GENERATION_MODELS = [
  {
    id: 'motion-transfer',
    endpointId: 'higgsfield/genjutsu-light/motion-transfer/v1.0',
    title: 'Перенести танец',
    subtitle: 'Движения из видео — персонажу с твоего фото.',
    referenceLabel: 'Кто будет танцевать',
  },
  {
    id: 'object-swap',
    endpointId: 'higgsfield/genjutsu-light/object-swap/v1.0',
    title: 'Заменить в видео',
    subtitle: 'Замени персонажа, одежду или предмет по фото.',
    referenceLabel: 'На кого или что заменить',
  },
] as const;

export type GenerationModel = typeof GENERATION_MODELS[number]['id'];
export type GenerationResolution = '480p' | '720p' | '1080p';
export const GENERATION_QUALITIES: readonly GenerationResolution[] = ['480p', '720p', '1080p'];
export const BASE_USD_PER_SECOND: Record<GenerationResolution, number> = {
  '480p': 0.05,
  '720p': 0.10,
  '1080p': 0.20,
};
export const MAX_OUTPUT_SECONDS = 15;
export const MAX_REFERENCE_IMAGES = 8;
export const MODEL_PRICING_SOURCE = 'https://open.higgsfield.ai/models/higgsfield/genjutsu-light/motion-transfer/v1.0/playground';

export interface GenerationDraftSettings {
  model?: GenerationModel;
  resolution?: GenerationResolution;
  sourceVideoUri?: string;
  sourceVideoDurationSeconds?: number;
  referenceImageUris?: string[];
  prompt?: string;
}

export interface GenerationEstimate {
  inputSeconds: number;
  expectedOutputSeconds: number;
  roundedOutputSeconds: number;
  billableSeconds: number;
  usdPerSecond: number;
  estimatedUsd: number;
}

/**
 * Preview only, never a billing authorization or trusted server price.
 * Until Higgsfield preprocessing reports the prepared input's duration, use
 * the full selected video's measured duration conservatively. Only expected
 * output is capped at 15s. Only output duration is rounded up to whole seconds.
 */
export function estimateGenerationCost(
  resolution: GenerationResolution, inputSeconds: number | null | undefined,
): GenerationEstimate | null {
  if (inputSeconds == null || !Number.isFinite(inputSeconds) || inputSeconds <= 0) return null;
  if (!(resolution in BASE_USD_PER_SECOND)) return null;
  const expectedOutputSeconds = Math.min(inputSeconds, MAX_OUTPUT_SECONDS);
  const roundedOutputSeconds = Math.ceil(expectedOutputSeconds);
  const billableSeconds = Number((inputSeconds + roundedOutputSeconds).toFixed(6));
  const usdPerSecond = BASE_USD_PER_SECOND[resolution];
  return {
    inputSeconds, expectedOutputSeconds, roundedOutputSeconds, billableSeconds,
    usdPerSecond, estimatedUsd: Number((billableSeconds * usdPerSecond).toFixed(6)),
  };
}
