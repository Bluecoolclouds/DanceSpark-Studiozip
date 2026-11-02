import express, { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import {
  CreateVideoGenerationBody,
  CreateVideoGenerationResponse,
  CreateCustomVideoLightSwapperGenerationBody,
  UploadLightSwapperSourceVideoResponse,
  GetVideoGenerationParams,
  GetVideoGenerationResponse,
  GetLightSwapperQuoteQueryParams,
  GetLightSwapperQuoteResponse,
} from "@workspace/api-zod";
import { VideoProviderError, VideoProviderNotConfiguredError } from "../lib/video-generation";
import { createOwnedGeneration, getOwnedGeneration, findOwnedLightSwapperGeneration, VideoNotFoundError } from "../lib/generation-access";
import { GenerationPolicyError } from "../lib/generation-governance";
import { requireAccount, getAccountId } from "../middlewares/admin-auth";
import { protectAdminMutation } from "../middlewares/admin-auth";
import { createOwnedLightSwapper } from "../lib/light-swapper";
import { createOwnedCustomVideoLightSwapper } from "../lib/light-swapper";
import { quoteOwnedLightSwapper } from "../lib/light-swapper";
import { CreateLightSwapperGenerationBody } from "@workspace/api-zod";
import { saveOwnedCustomVideo } from "../lib/custom-video-storage";
import {
  CustomVideoValidationError, inspectCustomVideo, MAX_CUSTOM_VIDEO_BYTES, MAX_CUSTOM_VIDEO_SECONDS,
} from "../lib/custom-video-validation";

const router: IRouter = Router();
let customVideoUploading: symbol | undefined;

router.get("/light-swapper/quote", requireAccount, async (req, res): Promise<void> => {
  const ownerId = getAccountId(res);
  if (!ownerId) { res.status(401).json({ error: "Войди в аккаунт." }); return; }
  const parsed = GetLightSwapperQuoteQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Проверь модель, качество и выбранный источник." }); return; }
  try {
    const quote = await quoteOwnedLightSwapper({ ownerId, ...parsed.data });
    res.setHeader("Cache-Control", "no-store");
    res.json(GetLightSwapperQuoteResponse.parse(quote));
  } catch (error) {
    if (error instanceof GenerationPolicyError) {
      const status = error.status;
      res.status(status).json({ error: error.code === "pricing_not_configured"
        ? "Цена этой модели или курс не настроены. Запуск заблокирован."
        : "Не удалось проверить цену. Проверь исходное видео и попробуй ещё раз.", code: error.code });
      return;
    }
    req.log.error({ category: "light_quote_failed" }, "Light Swapper quote failed");
    res.status(503).json({ error: "Не удалось рассчитать стоимость. Запуск пока недоступен." });
  }
});

router.get("/light-swapper/generations/by-client/:clientRequestId", requireAccount, async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const ownerId = getAccountId(res);
  if (!ownerId) { res.status(401).json({ error: "Войди в аккаунт." }); return; }
  const clientId = req.params.clientRequestId;
  if (typeof clientId !== "string" || !/^[A-Za-z0-9_-]{8,150}$/.test(clientId)) {
    res.status(400).json({ error: "Некорректный номер черновика." }); return;
  }
  try {
    const status = await findOwnedLightSwapperGeneration(ownerId, clientId);
    res.json(status ? GetVideoGenerationResponse.parse(status) : null);
  } catch {
    req.log.warn({ category: "light_recovery_failed" }, "Light Swapper recovery unavailable");
    res.status(502).json({ error: "Не удалось проверить статус. Платный запрос повторно не отправлен." });
  }
});

router.post("/light-swapper/generations", requireAccount, protectAdminMutation, async (req, res): Promise<void> => {
  const ownerId = getAccountId(res);
  if (!ownerId) { res.status(401).json({ error: "Войди в аккаунт." }); return; }
  const parsed = CreateLightSwapperGenerationBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Проверь модель, оригинал видео, фотографии и настройки." }); return; }
  try {
    const result = await createOwnedLightSwapper(ownerId, parsed.data);
    res.status(202).json(CreateVideoGenerationResponse.parse({ requestId: result.requestId, status: "queued" }));
  } catch (error) {
    if (error instanceof GenerationPolicyError) {
      res.status(error.status).json({ error: error.code === "pricing_not_configured"
        ? "Цена этой модели не настроена. Запуск заблокирован."
        : error.code === "insufficient_credits"
          ? "Не хватает дневных кредитов и доступной квоты подписки."
          : error.code === "invalid_source_video"
            ? "Видео не подходит выбранной модели: минимум 4 секунды; для обычной замены объекта — от 409 600 пикселей в кадре."
        : "Создание видео недоступно. Проверь подписку, лимиты, настройки и исходные материалы.", code: error.code });
      return;
    }
    if (error instanceof VideoProviderNotConfiguredError || error instanceof VideoProviderError) {
      res.status(error instanceof VideoProviderNotConfiguredError ? 503 : 502).json({ error: error.message });
      return;
    }
    // Never log raw errors: SDK exceptions may include signed URLs or credentials.
    req.log.error({ category: "light_submission_failed" }, "Light Swapper submission failed");
    res.status(502).json({ error: "Запуск не подтверждён. Проверь статус этого задания; не создавай повторный платный запрос." });
  }
});

router.post("/light-swapper/source-videos", requireAccount, protectAdminMutation, (req, res, next) => {
  if (req.get("content-type") !== "application/octet-stream" || req.get("content-encoding")) {
    res.status(415).json({ error: "Загрузи видео MP4 без сжатия." }); return;
  }
  if (customVideoUploading) { res.status(429).set("Retry-After", "5").json({ error: "Дождись завершения загрузки видео." }); return; }
  const slot = Symbol("custom-video-upload");
  customVideoUploading = slot;
  const release = () => { if (customVideoUploading === slot) customVideoUploading = undefined; };
  let working = false;
  res.locals.customVideoUploadDone = () => { working = false; release(); };
  req.once("aborted", release);
  res.once("close", () => { if (!working) release(); });
  express.raw({ type: () => true, limit: MAX_CUSTOM_VIDEO_BYTES, inflate: false })(req, res, error => {
    if (error) {
      release();
      const tooLarge = (error as { status?: number }).status === 413;
      res.status(tooLarge ? 413 : 400).json({ error: tooLarge
        ? "Видео должно быть не больше 100 МБ."
        : "Загрузка видео прервана." });
      return;
    }
    if (res.destroyed) { release(); return; }
    working = true;
    next();
  });
}, async (req, res): Promise<void> => {
  try {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Не удалось прочитать видео." }); return;
    }
    const durationSeconds = await inspectCustomVideo(req.body);
    const sourceVideoId = randomUUID();
    await saveOwnedCustomVideo(getAccountId(res), sourceVideoId, req.body);
    res.status(201).json(UploadLightSwapperSourceVideoResponse.parse({
      sourceVideoId, durationSeconds, sizeBytes: req.body.length,
    }));
  } catch (error) {
    if (error instanceof CustomVideoValidationError) {
      res.status(error.code === "source_validation_unavailable" ? 503 : 400).json({
        code: error.code,
        error: error.code === "source_validation_unavailable"
          ? "Проверка видео временно недоступна."
          : `Выбери корректное видео MP4 длительностью не более ${MAX_CUSTOM_VIDEO_SECONDS} секунд.`,
      });
      return;
    }
    // Storage errors can include private signed URLs; log only a safe category.
    req.log.error({ category: "custom_video_storage_failed" }, "Custom source video upload failed");
    res.status(503).json({ error: "Не удалось сохранить собственное видео. Попробуй позже." });
  } finally {
    res.locals.customVideoUploadDone?.();
  }
});

router.post("/light-swapper/custom-video-generations", requireAccount, protectAdminMutation, async (req, res): Promise<void> => {
  const ownerId = getAccountId(res);
  if (!ownerId) { res.status(401).json({ error: "Войди в аккаунт." }); return; }
  const parsed = CreateCustomVideoLightSwapperGenerationBody.strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Проверь видео, фотографии и настройки." }); return; }
  try {
    const result = await createOwnedCustomVideoLightSwapper(ownerId, parsed.data);
    res.status(202).json(CreateVideoGenerationResponse.parse({ requestId: result.requestId, status: "queued" }));
  } catch (error) {
    if (error instanceof GenerationPolicyError) {
      const messages: Record<string, string> = {
        account_blocked: "Генерация недоступна для этого аккаунта.",
        subscription_required: "Нужна действующая оплаченная подписка.",
        generation_paused: "Генерация временно приостановлена.",
        daily_limit_reached: "Дневной лимит подписки исчерпан.",
        concurrency_limit_reached: "Сейчас создаётся слишком много видео.",
        daily_budget_reached: "Дневной бюджет генерации исчерпан.",
        budget_not_configured: "Администратор ещё не настроил бюджет.",
        provider_not_configured: "Сервис генерации пока не настроен.",
        light_pricing_not_configured: "Не настроена оценка расходов.",
        invalid_source_video: "Видео не найдено или не подходит модели: минимум 4 секунды; для обычной замены объекта — от 409 600 пикселей в кадре.",
        source_validation_unavailable: "Проверка видео временно недоступна.",
        source_storage_unavailable: "Приватное хранилище видео временно недоступно.",
        input_too_large: "Общий размер фото превышает 12 МБ.",
        idempotency_conflict: "Этот черновик уже отправлялся с другими настройками.",
      };
      res.status(error.status).json({ error: messages[error.code] ?? "Создание видео сейчас недоступно.", code: error.code });
      return;
    }
    if (error instanceof VideoProviderNotConfiguredError || error instanceof VideoProviderError) {
      res.status(error instanceof VideoProviderNotConfiguredError ? 503 : 502).json({ error: error.message });
      return;
    }
    req.log.error({ category: "light_custom_submission_failed" }, "Custom Light Swapper submission failed");
    res.status(502).json({ error: "Запуск не подтверждён. Проверь статус этого задания; не отправляй повторный платный запрос." });
  }
});

router.post("/video-generations", requireAccount, async (req, res): Promise<void> => {
  const ownerId = getAccountId(res);
  if (!ownerId) {
    res.status(401).json({ error: "Войди в аккаунт, чтобы создавать видео." });
    return;
  }
  const parsed = CreateVideoGenerationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Проверь фото и выбранный танец." });
    return;
  }

  try {
    const result = await createOwnedGeneration(ownerId, parsed.data);
    res.status(202).json(
      CreateVideoGenerationResponse.parse({
        requestId: result.requestId,
        status: "queued",
      }),
    );
  } catch (error) {
    if (error instanceof GenerationPolicyError) {
      const messages: Record<string, string> = {
        account_blocked: "Создание видео недоступно для этого аккаунта.",
        subscription_required: "Нужна действующая оплаченная подписка. Открой раздел подписки.",
        generation_paused: "Создание видео временно приостановлено администратором.",
        daily_limit_reached: "Дневной лимит твоей подписки исчерпан. Попробуй завтра.",
        concurrency_limit_reached: "Сейчас создаётся слишком много видео. Попробуй позже.",
        daily_budget_reached: "Дневной бюджет генерации исчерпан. Попробуй завтра.",
        budget_not_configured: "Генерация пока не разрешена: администратор ещё не настроил бюджет.",
        provider_not_configured: "Сервис генерации пока не настроен.",
        idempotency_conflict: "Этот черновик уже отправлялся с другими настройками.",
        invalid_request: "Некорректные параметры запроса.",
      };
      res.status(error.status).json({ error: messages[error.code] ?? "Создание видео сейчас недоступно." });
      return;
    }
    if (error instanceof VideoProviderNotConfiguredError) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof VideoProviderError) {
      res.status(502).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Video generation submission failed");
    res.status(502).json({ error: "Не удалось начать генерацию. Попробуй ещё раз." });
  }
});

router.get("/video-generations/:requestId", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const ownerId = getAccountId(res);
  if (!ownerId) {
    res.status(401).json({ error: "Войди в аккаунт, чтобы смотреть своё видео." });
    return;
  }
  const parsed = GetVideoGenerationParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Некорректный номер генерации." });
    return;
  }

  try {
    const status = await getOwnedGeneration(ownerId, parsed.data.requestId);
    res.json(GetVideoGenerationResponse.parse(status));
  } catch (error) {
    if (error instanceof VideoNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof VideoProviderNotConfiguredError) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof VideoProviderError) {
      res.status(502).json({ error: error.message });
      return;
    }
    req.log.error({ category: "generation_status_failed" }, "Video generation status check failed");
    res.status(502).json({ error: "Не удалось проверить статус. Попробуй ещё раз." });
  }
});

export default router;
