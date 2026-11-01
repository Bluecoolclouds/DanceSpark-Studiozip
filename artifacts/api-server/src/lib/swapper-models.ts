/** Official model-specific contracts; baseline prices before account discounts. */
export const SWAPPER_MODELS = [
  "higgsfield/genjutsu-light/motion-transfer/v1.0",
  "higgsfield/genjutsu-light/object-swap/v1.0",
  "higgsfield/genjutsu/motion-transfer/v1.0",
  "higgsfield/genjutsu/object-swap/v1.0",
] as const;

export function isSwapperModel(model: string): boolean {
  return (SWAPPER_MODELS as readonly string[]).includes(model);
}
export function isStandardSwapper(model: string) {
  return isSwapperModel(model) && model.startsWith("higgsfield/genjutsu/");
}
export function swapperSourceRequirements(model: string) {
  return isStandardSwapper(model)
    ? { minimumSeconds: 4, minimumPixels: model.includes("/object-swap/") ? 409_600 : 0 }
    : undefined;
}
export function swapperCostUsd(model: string, seconds: number, resolution: "480p" | "720p" | "1080p") {
  if (!isSwapperModel(model) || !Number.isFinite(seconds) || seconds <= 0 || seconds > 300) return null;
  const standard = isStandardSwapper(model);
  const rate = (standard
    ? { "480p": 0.318, "720p": 0.681, "1080p": 1.632 }
    : { "480p": 0.05, "720p": 0.1, "1080p": 0.2 })[resolution];
  const billable = standard ? Math.ceil(seconds) : seconds + Math.ceil(Math.min(seconds, 15));
  return rate == null ? null : billable * rate;
}
