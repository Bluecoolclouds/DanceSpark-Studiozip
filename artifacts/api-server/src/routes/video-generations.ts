import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import {
  CreateVideoGenerationBody,
  CreateVideoGenerationResponse,
  GetVideoGenerationParams,
  GetVideoGenerationResponse,
} from "@workspace/api-zod";
import { VideoProviderError, VideoProviderNotConfiguredError } from "../lib/video-generation";
import { createOwnedGeneration, getOwnedGeneration, VideoNotFoundError } from "../lib/generation-access";
import { GenerationPolicyError } from "../lib/generation-governance";
import { requireAccount } from "../middlewares/admin-auth";

const router: IRouter = Router();

router.post("/video-generations", requireAccount, async (req, res): Promise<void> => {
  const ownerId = getAuth(req).userId;
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
  const ownerId = getAuth(req).userId;
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
    req.log.error({ err: error }, "Video generation status check failed");
    res.status(502).json({ error: "Не удалось проверить статус. Попробуй ещё раз." });
  }
});

export default router;
