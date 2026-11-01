/** Modes are independent of the explicitly selected model family. */
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
export type GenerationFamily = 'light' | 'standard';
export const GENERATION_FAMILIES = [
  { id: 'light', label: 'Лёгкий Свапер', icon: 'zap' },
  { id: 'standard', label: 'Свапер', icon: 'repeat' },
] as const;
export const outputLimit = (family: GenerationFamily = 'light') => family === 'standard' ? 30 : 15;
export function getGenerationModel(id?: GenerationModel, family: GenerationFamily = 'light') {
  const model = GENERATION_MODELS.find(m => m.id === id);
  if (!model) return undefined;
  return {
    ...model,
    endpointId: `higgsfield/${family === 'standard' ? 'genjutsu' : 'genjutsu-light'}/${model.id}/v1.0` as const,
  };
}
export type GenerationResolution = '480p' | '720p' | '1080p';
export const GENERATION_QUALITIES: readonly GenerationResolution[] = ['480p', '720p', '1080p'];
export const BASE_USD_PER_SECOND: Record<GenerationResolution, number> = {
  '480p': 0.05,
  '720p': 0.10,
  '1080p': 0.20,
};
export const STANDARD_USD_PER_SECOND: Record<GenerationResolution, number> = {
  '480p': 0.318,
  '720p': 0.681,
  '1080p': 1.632,
};
export const MAX_OUTPUT_SECONDS = 15;
export const MAX_REFERENCE_IMAGES = 8;
export const MODEL_PRICING_SOURCE = 'https://open.higgsfield.ai/models/higgsfield/genjutsu-light/motion-transfer/v1.0/playground';

export interface GenerationDraftSettings {
  model?: GenerationModel;
  /** Missing in older drafts means Light; never silently upgrade their cost. */
  modelFamily?: GenerationFamily;
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
 * output is capped at the chosen family's limit. Light bills input + rounded
 * output; standard Genjutsu bills rounded input seconds only.
 */
export function estimateGenerationCost(
  resolution: GenerationResolution, inputSeconds: number | null | undefined,
  family: GenerationFamily = 'light',
): GenerationEstimate | null {
  if (inputSeconds == null || !Number.isFinite(inputSeconds) || inputSeconds <= 0) return null;
  if (!(resolution in BASE_USD_PER_SECOND)) return null;
  const expectedOutputSeconds = Math.min(inputSeconds, outputLimit(family));
  const roundedOutputSeconds = Math.ceil(expectedOutputSeconds);
  const billableSeconds = family === 'standard'
    ? Math.ceil(inputSeconds) : Number((inputSeconds + roundedOutputSeconds).toFixed(6));
  const usdPerSecond = (family === 'standard' ? STANDARD_USD_PER_SECOND : BASE_USD_PER_SECOND)[resolution];
  return {
    inputSeconds, expectedOutputSeconds, roundedOutputSeconds, billableSeconds,
    usdPerSecond, estimatedUsd: Number((billableSeconds * usdPerSecond).toFixed(6)),
  };
}
