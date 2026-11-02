import type {
  CustomVideoLightSwapperInput, LightSwapperInput, VideoGenerationSubmission,
} from '@workspace/api-client-react';
import type { Draft, DraftUpdates } from '../context/DanceContext';

const locks = new Set<string>();

/** No timers, effects or automatic POST retries: called only by explicit consent. */
export async function launchLightGeneration(options: {
  ownerId: string;
  draft: Draft;
  active: () => boolean;
  prepare: () => Promise<LightSwapperInput | CustomVideoLightSwapperInput>;
  persist: (updates: DraftUpdates) => Promise<boolean>;
  submit: (input: LightSwapperInput | CustomVideoLightSwapperInput) => Promise<VideoGenerationSubmission>;
}) {
  const { draft, ownerId, active, prepare, persist, submit } = options;
  const key = `${ownerId}:${draft.id}`;
  if (locks.has(key) || draft.lightSubmissionStarted || draft.generationRequestId || !active()) return;
  locks.add(key);
  let sent = false;
  try {
    if (!await persist({ generationStatus: 'uploading', generationError: undefined })) {
      throw new Error('Не удалось сохранить черновик. Запуск отменён — восстанови хранилище.');
    }
    const input = await prepare();
    if (!active()) return;
    // The durable marker must exist BEFORE a potentially billable request.
    if (!await persist({ generationStatus: 'submitting', lightSubmissionStarted: true })) {
      throw new Error('Статус не сохранён. Платный запрос не отправлен.');
    }
    if (!active()) return;
    sent = true;
    const result = await submit(input);
    if (active()) await persist({ generationRequestId: result.requestId, generationStatus: result.status, generationError: undefined });
  } catch (error) {
    if (active()) {
      // Only this explicit pre-reservation response proves no provider POST was
      // made. A timeout, missing acknowledgement or any other code stays locked.
      const safePriceRejection = sent && error != null && typeof error === 'object'
        && 'status' in error && error.status === 409 && 'data' in error
        && error.data != null && typeof error.data === 'object'
        && 'code' in error.data && error.data.code === 'price_changed';
      await persist({
        generationStatus: sent && !safePriceRejection ? 'unknown' : 'failed',
        ...(safePriceRejection ? { lightSubmissionStarted: false, generationRequestId: undefined } : {}),
        // Never reset a persisted submission marker on an uncertain response.
        generationError: safePriceRejection
          ? 'Цена изменилась. Запрос не отправлен и кредиты не списаны. Проверь обновлённую цену и подтверди запуск заново.'
          : sent
          ? `${lightRejectionReason(error)}Проверяем тот же запрос без повторной отправки. Не создавай новый черновик для повтора; при необходимости проверь Higgsfield Console.`
          : error instanceof Error ? error.message : 'Не удалось подготовить фото. Платный запрос не отправлен.',
      });
    }
  } finally { locks.delete(key); }
}

export function lightRejectionReason(error: unknown): string {
  const code = error && typeof error === 'object' && 'data' in error &&
    error.data && typeof error.data === 'object' && 'code' in error.data ? error.data.code : undefined;
  const messages: Record<string, string> = {
    subscription_required: 'Нужна действующая оплаченная подписка.',
    insufficient_credits: 'Не хватает дневных кредитов, а доступная квота подписки исчерпана.',
    pricing_not_configured: 'Цена модели или курс не настроены. Запуск заблокирован.',
    price_changed: 'Цена изменилась после подтверждения. Запуск не отправлен; сначала проверь новую цену.',
    credit_reservation_unavailable: 'Не удалось подтвердить резерв кредитов. Запуск не отправлен.',
    account_blocked: 'Генерация недоступна для этого аккаунта.',
    generation_paused: 'Генерация временно приостановлена.',
    daily_limit_reached: 'Дневной лимит подписки исчерпан.',
    concurrency_limit_reached: 'Сейчас создаётся слишком много видео.',
    daily_budget_reached: 'Дневной бюджет генерации исчерпан.',
    budget_not_configured: 'Администратор ещё не настроил бюджет.',
    light_pricing_not_configured: 'Не настроены оценка расходов или длительность оригинала.',
    invalid_template: 'Танец больше не опубликован или недоступен.',
    original_unavailable: 'Оригинал видео недоступен.',
    invalid_source_video: 'Видео не подходит модели: минимум 4 секунды; для обычной замены объекта — минимум 409 600 пикселей в кадре.',
    input_too_large: 'Общий размер фото превышает 12 МБ.',
    idempotency_conflict: 'Этот черновик уже отправлялся с другими настройками.',
  };
  return `${typeof code === 'string' && messages[code] ? messages[code] : 'Ответ о запуске не получен.'} `;
}

/** A local/custom video must never silently become the catalogue original. */
export function lightDraftBlocker(draft: Draft): string | null {
  if (!draft.model || !draft.resolution) return 'В старом черновике не хватает настроек. Создай новый.';
  const catalogueOriginal = !!draft.templateSnapshot?.videoUri &&
    draft.templateSnapshot.videoUri === draft.sourceVideoUri;
  if (!catalogueOriginal && !draft.lightSourceVideoId) {
    return 'Сначала проверь и загрузи своё видео. Это бесплатно и не запускает генерацию.';
  }
  if (!draft.referenceImageUris?.length) return 'Добавь фотографии в новом черновике.';
  return null;
}

export function validatePhotoPayload(photos: string[]) {
  if (!photos.length || photos.length > 8) throw new Error('Нужно от 1 до 8 фото.');
  let size = 0;
  for (const photo of photos) {
    const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
    if (!match) throw new Error('Выбери фото в формате JPG, PNG или WebP.');
    size += match[1].length * 3 / 4 - (match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0);
  }
  if (size > 12 * 1024 * 1024) throw new Error('Общий размер фотографий должен быть не больше 12 МБ.');
}
