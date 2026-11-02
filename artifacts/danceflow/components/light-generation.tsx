import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useDanceAuth } from '@/lib/dance-auth';
import {
  useCreateCustomVideoLightSwapperGeneration, useCreateLightSwapperGeneration,
  useFindLightSwapperGeneration, useUploadLightSwapperSourceVideo,
  useGetLightSwapperQuote, useGetAccountCredits,
} from '@workspace/api-client-react';
import { BigButton } from '@/components/ui';
import { getModel } from '@/components/generation-form';
import { F } from '@/constants/fonts';
import { useDance, type Draft } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';
import { launchLightGeneration, lightDraftBlocker, validatePhotoPayload } from '@/lib/light-generation';
import { draftVideoUploadBlob } from '@/lib/draft-media';
import { photoToDataUrl, readableVideoError } from '@/lib/video-generation';

/** Mounted for both supported Swapper families. Legacy PixVerse is read-only. */
export function LightGeneration({ draft: d }: { draft: Draft }) {
  const c = useColors();
  const { isSignedIn, userId } = useDanceAuth();
  const { ownerId, persistDraft, updateDraft, draftStorageIssue } = useDance();
  const queryClient = useQueryClient();
  const active = useRef(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const mutation = useCreateLightSwapperGeneration({ mutation: { retry: false } });
  const customMutation = useCreateCustomVideoLightSwapperGeneration({ mutation: { retry: false } });
  const sourceUpload = useUploadLightSwapperSourceVideo({ mutation: { retry: false } });
  const model = getModel(d.model, d.modelFamily)!;
  const familyLabel = d.modelFamily === 'standard' ? 'Свапер' : 'Лёгкий Свапер';
  const blocker = lightDraftBlocker(d);
  const attempted = !!(d.lightSubmissionStarted || d.generationRequestId ||
    ['submitting', 'unknown', 'queued', 'processing', 'completed'].includes(d.generationStatus ?? ''));
  const catalogueSource = !!d.templateSnapshot?.videoUri &&
    d.templateSnapshot.videoUri === d.sourceVideoUri;
  const customSourceNeedsUpload = !catalogueSource && !d.lightSourceVideoId;
  const quoteParams = d.resolution && !blocker && !customSourceNeedsUpload
    ? {
        model: model.endpointId,
        resolution: d.resolution,
        ...(catalogueSource ? { templateId: d.templateId } : { sourceVideoId: d.lightSourceVideoId! }),
      }
    : undefined;
  const quote = useGetLightSwapperQuote(
    quoteParams ?? { model: model.endpointId, resolution: d.resolution ?? '720p' },
    {
      query: {
        queryKey: ['light-swapper-quote', ownerId, quoteParams],
        enabled: !!isSignedIn && !!quoteParams && !attempted,
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  );
  const credits = useGetAccountCredits({
    query: {
      queryKey: ['account-credits', userId],
      enabled: !!isSignedIn && !attempted,
      retry: false,
      staleTime: 0,
      gcTime: 0,
    },
  });
  const status = useFindLightSwapperGeneration(d.id, {
    query: {
      enabled: !!isSignedIn && attempted && !d.videoUri && !busy,
      retry: false,
      refetchInterval: d.generationStatus === 'failed' || d.generationStatus === 'completed' ? false : 5000,
    },
  });
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    const result = status.data;
    if (!result || !active.current) return;
    updateDraft(d.id, {
      generationRequestId: result.requestId,
      generationStatus: result.status,
      generationError: result.error ?? undefined,
      ...(result.videoUrl ? { videoUri: result.videoUrl } : {}),
    });
  }, [status.data, d.id, updateDraft]);

  const launch = async () => {
    if (busy || !confirm || blocker || attempted || !isSignedIn || !quote.data || quote.isError) return;
    setConfirm(false);
    setBusy(true);
    try {
      await launchLightGeneration({
      ownerId, draft: d, active: () => active.current,
      persist: updates => persistDraft(d.id, updates),
      prepare: async () => {
        const photos: string[] = [];
        for (const uri of d.referenceImageUris ?? []) {
          if (!active.current) throw new Error('Подготовка отменена.');
          photos.push(await photoToDataUrl(uri));
        }
        validatePhotoPayload(photos);
        const common = {
          clientRequestId: d.id, model: model.endpointId, photos,
          prompt: d.prompt ?? '', resolution: d.resolution!,
        };
        return catalogueSource
          ? { ...common, templateId: d.templateId }
          : { ...common, sourceVideoId: d.lightSourceVideoId! };
      },
      submit: data => 'sourceVideoId' in data
        ? customMutation.mutateAsync({ data: { ...data, maxCredits: quote.data!.credits } })
        : mutation.mutateAsync({ data: { ...data, maxCredits: quote.data!.credits } }),
      });
    } finally {
      if (userId) void queryClient.invalidateQueries({ queryKey: ['account-credits', userId] });
      void queryClient.invalidateQueries({ queryKey: ['light-swapper-quote', ownerId] });
      if (active.current) setBusy(false);
    }
  };

  const uploadSourceVideo = async () => {
    if (sourceBusy || !d.sourceVideoUri || !isSignedIn || !active.current) return;
    setSourceBusy(true);
    setSourceError(null);
    try {
      const video = await draftVideoUploadBlob(d.sourceVideoUri);
      if (!active.current) return;
      const result = await sourceUpload.mutateAsync({ data: video });
      if (!active.current) return;
      const saved = await persistDraft(d.id, {
        lightSourceVideoId: result.sourceVideoId,
        sourceVideoDurationSeconds: result.durationSeconds,
        duration: Math.min(result.durationSeconds, d.modelFamily === 'standard' ? 30 : 15),
      });
      if (!saved) throw new Error('Не удалось сохранить результат проверки. Восстанови сохранение черновика.');
    } catch (error) {
      if (active.current) setSourceError(readableVideoError(error));
    } finally {
      if (active.current) setSourceBusy(false);
    }
  };

  if (d.videoUri) return null;
  const message = busy && d.generationStatus === 'uploading'
    ? 'Подготавливаем выбранные фото по порядку. Платный запрос ещё не отправлен.'
    : busy ? 'Отправляем материалы. Не запускай повторно.'
    : d.generationStatus === 'queued' ? 'Загрузка материалов на сервере или очередь. Экран можно закрыть — статус восстановится при открытии.'
    : d.generationStatus === 'processing' ? `${familyLabel} создаёт видео. Экран можно закрыть.`
    : d.generationStatus === 'completed' ? 'Обработка завершена, но ссылка на видео пока недоступна. Проверь статус позже.'
    : d.generationError ?? (attempted ? 'Проверяем ранее отправленный запрос. Повторного платного запуска не будет.' : 'Черновик сохранён. Генерация не запускалась.');
  return <View style={{ gap: 12, marginTop: 18 }}>
    <View style={{ backgroundColor: c.secondary, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 }}>
      {(busy || (attempted && d.generationStatus !== 'failed')) && <ActivityIndicator color={c.foreground} />}
      <Text accessibilityLiveRegion="polite" style={{ color: c.foreground, fontFamily: F.bodyBold }}>{message}</Text>
      {attempted && !status.isPending && status.data === null && <Text style={{ color: c.foreground }}>
        Задание пока не найдено. Это не подтверждает отсутствие списания. Только проверяем статус; для новой попытки сначала проверь Higgsfield Console.
      </Text>}
      {status.isError && <Text accessibilityRole="alert" style={{ color: c.destructive }}>{readableVideoError(status.error)}</Text>}
    </View>
    {attempted ? <BigButton testID="light-check-status" label="Проверить тот же запрос" icon="refresh-cw"
      onPress={() => void status.refetch()} disabled={busy || status.isFetching} /> : <>
      {blocker && <Text style={{ color: c.mutedForeground }}>{blocker}</Text>}
      {draftStorageIssue && <Text style={{ color: c.destructive }}>Сначала восстанови сохранение черновиков. Без него платный запуск заблокирован.</Text>}
      {customSourceNeedsUpload && <>
        {sourceError && <Text accessibilityRole="alert" style={{ color: c.destructive }}>{sourceError}</Text>}
        <BigButton testID="light-validate-own-video"
          label={sourceBusy ? 'Проверяем и загружаем видео…' : 'Проверить своё видео'}
          icon={sourceBusy ? undefined : 'upload'}
          disabled={!isSignedIn || !!draftStorageIssue || sourceBusy || busy}
          onPress={() => void uploadSourceVideo()} />
        <Text style={{ color: c.mutedForeground }}>
          Видео будет проверено на сервере и сохранено приватно для твоего аккаунта. Это бесплатно и не запускает генерацию.
        </Text>
      </>}
      {!customSourceNeedsUpload && !catalogueSource && d.lightSourceVideoId &&
        <Text style={{ color: c.mutedForeground }}>
          Собственное видео проверено: {d.sourceVideoDurationSeconds?.toFixed(1)} сек. Перед запуском будет отдельное подтверждение.
        </Text>}
      {isSignedIn && !customSourceNeedsUpload && (
        <View testID="light-generation-price" style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 5 }}>
          {quote.isFetching && <Text style={{ color: c.mutedForeground }}>Проверяем актуальную цену по видео…</Text>}
          {quote.isError && <Text accessibilityRole="alert" style={{ color: c.destructive }}>Не удалось рассчитать цену. Запуск заблокирован, пока сервер не подтвердит тариф.</Text>}
          {quote.data && <Text style={{ color: c.foreground, fontFamily: F.bodyBold }}>
            Цена запуска: {quote.data.credits.toLocaleString('ru-RU')} кредитов · доступно {credits.data?.availableCredits.toLocaleString('ru-RU') ?? '…'}
          </Text>}
          {quote.data && <Text style={{ color: c.mutedForeground, fontFamily: F.body, fontSize: 12, lineHeight: 17 }}>
            Один кредит = 1 ₽. Расчёт по {quote.data.billableSeconds.toLocaleString('ru-RU')} оплачиваемым секундам и наценке 15%.
            {credits.data ? ` Дневной баланс сбросится ${new Date(credits.data.resetAt).toLocaleString('ru-RU')}.` : ''}
          </Text>}
          {quote.data && credits.data && credits.data.availableCredits < quote.data.credits &&
            <Text style={{ color: c.mutedForeground, fontFamily: F.body, fontSize: 12, lineHeight: 17 }}>
              Кредитов не хватает. Если доступна подписочная квота, будет использована только она; двойного списания не будет.
            </Text>}
        </View>
      )}
      {!attempted && d.generationError && <Text accessibilityRole="alert" style={{ color: c.destructive, fontFamily: F.body }}>{d.generationError}</Text>}
      {!confirm && <BigButton testID="light-review-launch" label={isSignedIn ? `Запустить: ${familyLabel}…` : 'Войти для запуска'}
        icon="play" disabled={!!blocker || !!draftStorageIssue || busy || (isSignedIn && (!quote.data || quote.isFetching || quote.isError))}
        onPress={() => isSignedIn ? setConfirm(true) : router.push('/sign-in')} />}
      {confirm && <View testID="light-paid-confirmation" style={{ backgroundColor: c.card, padding: 16, borderWidth: 1, borderColor: c.border, borderRadius: 16, gap: 12 }}>
        <Text style={{ color: c.foreground, fontFamily: F.display }}>Подтвердить запуск</Text>
        <Text style={{ color: c.foreground }}>Модель: {familyLabel} · {model.title}{'\n'}{model.endpointId}{'\n'}
          Качество: {d.resolution} · Фото: {d.referenceImageUris?.length}{'\n'}
          Видео: {catalogueSource ? `${d.templateSnapshot?.title} · оригинал каталога` : `Своё видео · ${d.sourceVideoDurationSeconds?.toFixed(1)} сек, проверено сервером`}</Text>
        <Text style={{ color: c.foreground }}>
          Точная цена по тарифу Higgsfield: {quote.data?.credits.toLocaleString('ru-RU') ?? '—'} кредитов.
          {credits.data ? ` Доступно ${credits.data.availableCredits.toLocaleString('ru-RU')}.` : ''}
          {' '}При достаточном балансе расходуются кредиты, подписочная квота остаётся нетронутой. Если кредитов не хватит, система проверит отдельный доступ по подписке.
        </Text>
        <Text style={{ color: c.foreground }}>Видео, выбранные фото и промпт будут переданы Higgsfield. Закрытие экрана не отменяет задание.</Text>
        <BigButton testID="light-confirm-paid" label="Подтверждаю запуск" icon="play" onPress={() => void launch()} disabled={busy || !quote.data || quote.isFetching || quote.isError || !!blocker} />
        <BigButton testID="light-cancel-paid" label="Только оставить черновик" icon="bookmark" color="accent" onPress={() => setConfirm(false)} />
      </View>}
    </>}
  </View>;
}
