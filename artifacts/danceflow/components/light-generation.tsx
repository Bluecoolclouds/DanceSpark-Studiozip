import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@clerk/expo';
import { useCreateLightSwapperGeneration, useFindLightSwapperGeneration } from '@workspace/api-client-react';
import { BigButton } from '@/components/ui';
import { fmtUsd, getModel } from '@/components/generation-form';
import { F } from '@/constants/fonts';
import { estimateGenerationCost } from '@/constants/generation';
import { useDance, type Draft } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';
import { launchLightGeneration, lightDraftBlocker, validatePhotoPayload } from '@/lib/light-generation';
import { photoToDataUrl, readableVideoError } from '@/lib/video-generation';

/** Mounted only for Light drafts. PixVerse keeps its own submission path. */
export function LightGeneration({ draft: d }: { draft: Draft }) {
  const c = useColors();
  const { isSignedIn } = useAuth();
  const { ownerId, persistDraft, updateDraft, draftStorageIssue } = useDance();
  const active = useRef(true);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const mutation = useCreateLightSwapperGeneration({ mutation: { retry: false } });
  const model = getModel(d.model)!;
  const estimate = d.resolution ? estimateGenerationCost(d.resolution, d.sourceVideoDurationSeconds) : null;
  const blocker = lightDraftBlocker(d);
  const attempted = !!(d.lightSubmissionStarted || d.generationRequestId ||
    ['submitting', 'unknown', 'queued', 'processing', 'completed'].includes(d.generationStatus ?? ''));
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
    if (busy || !confirm || blocker || attempted || !isSignedIn) return;
    setConfirm(false);
    setBusy(true);
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
        return {
          clientRequestId: d.id, templateId: d.templateId, model: model.endpointId,
          photos, prompt: d.prompt ?? '', resolution: d.resolution!,
        };
      },
      submit: data => mutation.mutateAsync({ data }),
    });
    if (active.current) setBusy(false);
  };

  if (d.videoUri) return null;
  const message = busy && d.generationStatus === 'uploading'
    ? 'Подготавливаем выбранные фото по порядку. Платный запрос ещё не отправлен.'
    : busy ? 'Отправляем материалы. Не запускай повторно.'
    : d.generationStatus === 'queued' ? 'Загрузка материалов на сервере или очередь. Экран можно закрыть — статус восстановится при открытии.'
    : d.generationStatus === 'processing' ? 'Light Swapper создаёт видео. Экран можно закрыть.'
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
      {!confirm && <BigButton testID="light-review-launch" label={isSignedIn ? 'Запустить Light Swapper…' : 'Войти для запуска'}
        icon="play" disabled={!!blocker || !!draftStorageIssue || busy}
        onPress={() => isSignedIn ? setConfirm(true) : router.push('/sign-in')} />}
      {confirm && <View testID="light-paid-confirmation" style={{ backgroundColor: c.card, padding: 16, borderWidth: 1, borderColor: c.border, borderRadius: 16, gap: 12 }}>
        <Text style={{ color: c.foreground, fontFamily: F.display }}>Подтвердить платный запуск</Text>
        <Text style={{ color: c.foreground }}>Модель: {model.title}{'\n'}{model.endpointId}{'\n'}
          Качество: {d.resolution} · Фото: {d.referenceImageUris?.length}{'\n'}
          Видео: {d.templateSnapshot?.title} · оригинал каталога</Text>
        <Text style={{ color: c.foreground }}>Предварительная себестоимость у Higgsfield: {estimate ? `≈ ${fmtUsd(estimate.estimatedUsd)}` : 'пока неизвестна'}.
          Это оценка, а не гарантированная цена и не доплата к подписке. Фактическая стоимость зависит от обработки поставщиком.</Text>
        <Text style={{ color: c.foreground }}>Видео, выбранные фото и промпт будут переданы Higgsfield. Нужна действующая оплаченная подписка; запуск расходует её лимит и баланс сервиса. Закрытие экрана не отменяет задание.</Text>
        <BigButton testID="light-confirm-paid" label="Подтверждаю платный запуск" icon="play" onPress={() => void launch()} disabled={busy} />
        <BigButton testID="light-cancel-paid" label="Только оставить черновик" icon="bookmark" color="accent" onPress={() => setConfirm(false)} />
      </View>}
    </>}
  </View>;
}
