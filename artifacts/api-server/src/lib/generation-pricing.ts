import { isStandardSwapper, swapperCostUsd } from "./swapper-models";

export const CREDIT_VALUE_RUB = 1;
export const GENERATION_MARKUP_RATE = 0.15;
export const USD_RUB_RATE_DEFAULT = 80.5573;
export const USD_RUB_SOURCE_DEFAULT = "ЦБ РФ";
export const USD_RUB_DATE_DEFAULT = "2026-11-02";
export const PRICED_SWAPPER_MODELS = [
  {
    id: "higgsfield/genjutsu-light/motion-transfer/v1.0",
    name: "Лёгкий Свапер · перенос движения",
    family: "light" as const,
    pricingSource: "https://open.higgsfield.ai/models/higgsfield/genjutsu-light/motion-transfer/v1.0/playground",
  },
  {
    id: "higgsfield/genjutsu-light/object-swap/v1.0",
    name: "Лёгкий Свапер · замена объекта",
    family: "light" as const,
    pricingSource: "https://open.higgsfield.ai/models/higgsfield/genjutsu-light/object-swap/v1.0/playground",
  },
  {
    id: "higgsfield/genjutsu/motion-transfer/v1.0",
    name: "Свапер · перенос движения",
    family: "standard" as const,
    pricingSource: "https://open.higgsfield.ai/models/higgsfield/genjutsu/motion-transfer/v1.0/playground",
  },
  {
    id: "higgsfield/genjutsu/object-swap/v1.0",
    name: "Свапер · замена объекта",
    family: "standard" as const,
    pricingSource: "https://open.higgsfield.ai/models/higgsfield/genjutsu/object-swap/v1.0/playground",
  },
] as const;

export interface ExchangeRateSnapshot {
  rate: number;
  source: string;
  date: string;
}

export interface GenerationPrice {
  model: string;
  resolution: "480p" | "720p" | "1080p";
  sourceSeconds: number;
  billableSeconds: number;
  providerCostUsd: number;
  providerCostRub: number;
  customerPriceRub: number;
  credits: number;
  creditValueRub: number;
  markupPercent: number;
  usdRubRate: number;
  usdRubSource: string;
  usdRubDate: string;
}

export function quoteSwapperPrice(
  model: string,
  sourceSeconds: number,
  resolution: "480p" | "720p" | "1080p",
  fx: ExchangeRateSnapshot,
): GenerationPrice | null {
  if (!Number.isFinite(fx.rate) || fx.rate <= 0 ||
      !fx.source.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(fx.date)) return null;
  const providerCostUsd = swapperCostUsd(model, sourceSeconds, resolution);
  if (providerCostUsd == null) return null;

  const standard = isStandardSwapper(model);
  const billableSeconds = standard
    ? Math.ceil(sourceSeconds)
    : sourceSeconds + Math.ceil(Math.min(sourceSeconds, 15));
  const providerCostRubExact = providerCostUsd * fx.rate;
  const customerPriceRubExact = providerCostRubExact * (1 + GENERATION_MARKUP_RATE);
  if (![providerCostRubExact, customerPriceRubExact].every(Number.isFinite)) return null;

  // Keep the API budget conservative to the nearest kopeck. Customer credits
  // are whole rubles, so rounding is always upward and never erodes the markup.
  const providerCostRub = Math.ceil(providerCostRubExact * 100 - 1e-8) / 100;
  const customerPriceRub = Math.round(customerPriceRubExact * 100) / 100;
  const credits = Math.ceil(customerPriceRubExact / CREDIT_VALUE_RUB - 1e-9);
  if (!Number.isSafeInteger(credits) || credits < 1) return null;

  return {
    model, resolution, sourceSeconds, billableSeconds,
    providerCostUsd: Number(providerCostUsd.toFixed(6)),
    providerCostRub: Number(providerCostRub.toFixed(2)),
    customerPriceRub: Number(customerPriceRub.toFixed(2)),
    credits, creditValueRub: CREDIT_VALUE_RUB, markupPercent: GENERATION_MARKUP_RATE * 100,
    usdRubRate: fx.rate, usdRubSource: fx.source.trim(), usdRubDate: fx.date,
  };
}
