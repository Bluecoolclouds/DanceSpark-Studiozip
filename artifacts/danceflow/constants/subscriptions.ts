import type { ColorKey } from '@/constants/templates';

export type SubscriptionPlanId = 'monthly_10' | 'monthly_25' | 'monthly_unlimited';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  monthlyPriceRub: number;
  /** null = безлимит */
  dailyLimit: number | null;
  color: ColorKey;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: 'monthly_10', name: 'Разминка', monthlyPriceRub: 500, dailyLimit: 10, color: 'secondary' },
  { id: 'monthly_25', name: 'Танцпол', monthlyPriceRub: 1500, dailyLimit: 25, color: 'accent' },
  { id: 'monthly_unlimited', name: 'Сцена', monthlyPriceRub: 2500, dailyLimit: null, color: 'sun' },
];

/** Платёжный провайдер ещё не подключён. */
export const PAYMENTS_CONNECTED = false;

export const formatRub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`;
export const limitLabel = (p: SubscriptionPlan) =>
  p.dailyLimit === null ? 'Безлимитные генерации' : `${p.dailyLimit} генераций в день`;
