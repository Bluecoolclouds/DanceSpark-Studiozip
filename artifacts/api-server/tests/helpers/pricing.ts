import type { GenerationPrice } from "../../src/lib/generation-pricing";

/** Explicit server-side price fixture; never enables an unpriced production model. */
export const testPricing: GenerationPrice = {
  model: "higgsfield/genjutsu-light/motion-transfer/v1.0",
  resolution: "480p", sourceSeconds: 5, billableSeconds: 10,
  providerCostUsd: 0.5, providerCostRub: 5, customerPriceRub: 5.75,
  credits: 6, creditValueRub: 1, markupPercent: 15,
  usdRubRate: 10, usdRubSource: "Test fixture", usdRubDate: "2026-11-02",
};
