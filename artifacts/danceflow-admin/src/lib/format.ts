import { formatInTimeZoneLite } from './tz';

const num = new Intl.NumberFormat('ru-RU');
const rub = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const fmtNum = (n: number) => num.format(n);
export const fmtRub = (n: number | null | undefined) =>
  n === null || n === undefined ? 'неизвестно' : `≈ ${rub.format(n)} ₽`;
export const fmtUtc = (iso: string | null | undefined) =>
  iso ? formatInTimeZoneLite(iso) : '—';

export function apiStatus(err: unknown): number | null {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status;
    return typeof s === 'number' ? s : null;
  }
  return null;
}

export function apiMessage(err: unknown, conflictMessage = 'Данные изменились на сервере.'): string {
  const status = apiStatus(err);
  if (status === 401) return 'Сессия истекла. Войдите снова.';
  if (status === 403) return 'Нет прав администратора.';
  if (status === 409) return conflictMessage;
  if (status === 400 || status === 422) return 'Сервер отклонил значения. Проверьте поля.';
  if (status && status >= 500) return `Сервер ответил ошибкой ${status}.`;
  return 'Не удалось связаться с сервером.';
}

export const STATUS_LABEL: Record<string, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  succeeded: 'Готово',
  failed: 'Ошибка',
};

export const PLAN_LABEL: Record<string, string> = {
  none: 'Без плана',
  warmup: 'Разминка',
  dancefloor: 'Танцпол',
  stage: 'Сцена',
};

export const POLL = 30_000;
