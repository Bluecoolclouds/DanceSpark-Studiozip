import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigButton, Bouncy, DemoBadge, EmptyState, tone } from '@/components/ui';
import { F } from '@/constants/fonts';
import { getTemplate } from '@/constants/templates';
import { useDance } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';
import { CostPreview, RefGrid, SourcePreview, fmtSec, getModel } from '@/components/generation-form';
import { MAX_OUTPUT_SECONDS } from '@/constants/generation';
import { deleteVideoFromLibrary, saveVideoToLibrary, shareVideo, VideoLibraryPermissionError } from '@/lib/draft-videos';
import { photoToDataUrl, readableVideoError } from '@/lib/video-generation';
import {
  useCreateVideoGeneration,
  useGetVideoGeneration,
  type VideoGenerationInput,
} from '@workspace/api-client-react';

import { useAuth } from '@clerk/expo';

export default function DraftScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { drafts, removeDraft, updateDraft, ready } = useDance();
  const [busy, setBusy] = useState<'save' | 'share' | 'delete' | 'generate' | null>(null);
  const createGeneration = useCreateVideoGeneration();
  const { isSignedIn } = useAuth();
  const d = drafts.find((x) => x.id === id);
  const t = d ? getTemplate(d.templateId) : undefined;
  const m = getModel(d?.model);
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom;
  const statusQuery = useGetVideoGeneration(d?.generationRequestId ?? '', {
    query: {
      enabled: Boolean(isSignedIn && d?.generationRequestId) && !d?.videoUri,
      refetchInterval: d?.generationStatus === 'queued' || d?.generationStatus === 'processing' ? 4000 : false,
    },
  });

  const back = () => (router.canGoBack() ? router.back() : router.replace('/studio'));

  useEffect(() => {
    if (!d?.generationRequestId || !statusQuery.data) return;
    const { status, videoUrl, error } = statusQuery.data;
    updateDraft(d.id, {
      generationStatus: status,
      generationError: error ?? undefined,
      ...(videoUrl ? { videoUri: videoUrl } : {}),
    });
  }, [d?.id, d?.generationRequestId, statusQuery.data, updateDraft]);

  useEffect(() => {
    if (!busy && d?.generationStatus === 'submitting' && !d.generationRequestId) {
      updateDraft(d.id, {
        generationStatus: 'failed',
        generationError: 'Запуск генерации прервался. Попробуй отправить фото ещё раз.',
      });
    }
  }, [busy, d?.id, d?.generationRequestId, d?.generationStatus, updateDraft]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.background }} />;
  if (!d || !t) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: top + 40 }}>
        <EmptyState icon="bookmark" title="Черновик не найден" text="Возможно, он был удалён." action="К моей сцене" onAction={() => router.replace('/studio')} />
      </View>
    );
  }

  const del = () => {
    const go = () => { removeDraft(d.id); router.replace('/studio'); };
    if (Platform.OS === 'web') return go();
    Alert.alert('Удалить черновик?', d.savedVideoAssetId
      ? 'Черновик будет удалён. Сохранённая копия в медиатеке останется.'
      : 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: go },
    ]);
  };

  const reportVideoError = (title: string, error: unknown) => {
    if (error instanceof VideoLibraryPermissionError) {
      Alert.alert(
        'Нет доступа к медиатеке',
        error.canAskAgain
          ? 'Разреши доступ к видео в медиатеке, чтобы продолжить.'
          : 'Разрешение отключено в настройках устройства.',
        error.canAskAgain
          ? [{ text: 'Понятно' }]
          : [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Открыть настройки', onPress: () => Linking.openSettings().catch(() => {}) },
            ],
      );
      return;
    }
    Alert.alert(title, error instanceof Error ? error.message : 'Попробуй ещё раз.');
  };

  const saveToLibrary = async () => {
    if (!d.videoUri || busy) return;
    setBusy('save');
    try {
      const assetId = await saveVideoToLibrary(d.videoUri, d.id);
      updateDraft(d.id, { savedVideoAssetId: assetId });
      Alert.alert('Сохранено', 'Танец теперь в медиатеке устройства.');
    } catch (error) {
      reportVideoError('Не удалось сохранить видео', error);
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!d.videoUri || busy) return;
    setBusy('share');
    try {
      await shareVideo(d.videoUri, d.id);
    } catch (error) {
      reportVideoError('Не удалось отправить видео', error);
    } finally {
      setBusy(null);
    }
  };

  const deleteSavedVideo = () => {
    if (!d.savedVideoAssetId || busy) return;
    const remove = async () => {
      setBusy('delete');
      try {
        await deleteVideoFromLibrary(d.savedVideoAssetId!);
        updateDraft(d.id, { savedVideoAssetId: undefined });
      } catch (error) {
        reportVideoError('Не удалось удалить видео из медиатеки', error);
      } finally {
        setBusy(null);
      }
    };
    Alert.alert('Удалить сохранённое видео?', 'Копия будет удалена из медиатеки устройства. Черновик останется.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: remove },
    ]);
  };

  const generateVideo = async () => {
    if (busy || m) return;
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }
    if (d.generationRequestId) {
      // Recheck the accepted job rather than silently charging for another one.
      await statusQuery.refetch();
      return;
    }
    setBusy('generate');
    updateDraft(d.id, {
      generationStatus: 'submitting',
      generationRequestId: undefined,
      generationError: undefined,
    });
    try {
      const imageDataUrl = await photoToDataUrl(d.photoUri);
      const result = await createGeneration.mutateAsync({
        data: {
          clientRequestId: d.id,
          imageDataUrl,
          styleId: d.templateId as VideoGenerationInput['styleId'],
          duration: d.duration as VideoGenerationInput['duration'],
        },
      });
      updateDraft(d.id, {
        generationStatus: 'queued',
        generationRequestId: result.requestId,
        generationError: undefined,
      });
    } catch (error) {
      updateDraft(d.id, {
        generationStatus: 'failed',
        generationError: readableVideoError(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const isGenerating = d.generationStatus === 'submitting' ||
    d.generationStatus === 'queued' ||
    d.generationStatus === 'processing';
  const badgeLabel = d.videoUri
    ? 'ГОТОВОЕ ВИДЕО'
    : d.generationStatus === 'submitting'
      ? 'ОТПРАВЛЯЕМ ФОТО'
      : d.generationStatus === 'queued'
        ? 'В ОЧЕРЕДИ'
        : d.generationStatus === 'processing'
          ? 'СОЗДАЁТСЯ'
          : d.generationStatus === 'failed'
            ? 'ОШИБКА ГЕНЕРАЦИИ'
            : 'ЧЕРНОВИК · БЕЗ ВИДЕО';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingTop: top + 8, paddingBottom: bottom + 30, paddingHorizontal: 20 }}>
      <View style={styles.bar}>
        <Bouncy onPress={back} style={[styles.round, { backgroundColor: c.card, borderColor: c.border }]}>
          <Feather name="arrow-left" size={20} color={c.foreground} />
        </Bouncy>
        <DemoBadge label={badgeLabel} />
      </View>

      <Text style={[styles.title, { color: c.foreground }]}>{d.videoUri ? <>Танец{'\n'}<Text style={{ color: c.primary }}>готов</Text></> : isGenerating ? <>Танец{'\n'}<Text style={{ color: c.primary }}>создаётся</Text></> : <>Черновик{'\n'}<Text style={{ color: c.primary }}>готов к сцене</Text></>}</Text>

      {d.videoUri ? (
        <GeneratedVideo uri={d.videoUri} />
      ) : m ? (
        <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.muted }]}>
          <Feather name="film" size={22} color={c.mutedForeground} />
          <Text style={[styles.emptyText, { color: c.mutedForeground }]}>Результата пока нет. Генерация ещё не запускалась.</Text>
        </View>
      ) : (
        <View style={styles.collage}>
          <View style={[styles.photo, { borderColor: c.border, backgroundColor: c.muted, transform: [{ rotate: '-4deg' }] }]}>
            <Image source={{ uri: d.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={[styles.lbl, { backgroundColor: c.card, borderColor: c.border }]}><Text style={[styles.lblText, { color: c.foreground }]}>ТЫ</Text></View>
          </View>
          <View style={[styles.plus, { backgroundColor: c.accent, borderColor: c.border }]}>
            <Feather name="plus" size={22} color={c.foreground} />
          </View>
          <View style={[styles.photo, { borderColor: c.border, backgroundColor: tone(c, t.color), transform: [{ rotate: '4deg' }] }]}>
            <Image source={t.image} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={[styles.lbl, { backgroundColor: tone(c, t.color), borderColor: c.border }]}><Text style={[styles.lblText, { color: c.foreground }]}>{t.dancer}</Text></View>
          </View>
        </View>
      )}

      <View style={[styles.summary, { backgroundColor: c.card, borderColor: c.border }]}>
        {m && <Row k="Режим" v={m.title} />}
        {m && d.resolution && <Row k="Качество" v={d.resolution} />}
        <Row k={m ? 'Идея' : 'Танец'} v={t.title} />
        {!m && <Row k="Стиль" v={t.tagline} />}
        {!m && <Row k="Темп" v={`${t.bpm} BPM`} />}
        <Row k={m ? 'Ожидаемый результат' : 'Длительность'} v={m ? fmtSec(d.duration) : `${d.duration} сек`} />
        <Row k="Создан" v={new Date(d.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} last />
      </View>

      {m && (
        <View style={{ gap: 8, marginTop: 16 }}>
          <Text style={[styles.h, { color: c.foreground }]}>Исходное видео</Text>
          {d.sourceVideoUri ? <SourcePreview uri={d.sourceVideoUri} height={260} /> : <Text style={[styles.emptyText, { color: c.mutedForeground }]}>Не сохранено.</Text>}
          {d.sourceVideoDurationSeconds != null && (
            <Text style={[styles.small, { color: c.mutedForeground }]}>
              {fmtSec(d.sourceVideoDurationSeconds)}{d.sourceVideoDurationSeconds > MAX_OUTPUT_SECONDS ? ` · будут использованы первые ${MAX_OUTPUT_SECONDS} сек` : ''} · звук сохраняется
            </Text>
          )}
          <Text style={[styles.h, { color: c.foreground }]}>{m.referenceLabel} · {d.referenceImageUris?.length ?? 0}</Text>
          <RefGrid uris={d.referenceImageUris ?? [d.photoUri]} />
          <Text style={[styles.h, { color: c.foreground }]}>Подсказка</Text>
          <Text style={[styles.small, { color: d.prompt ? c.foreground : c.mutedForeground }]}>{d.prompt || 'Без подсказки'}</Text>
          {d.resolution && <CostPreview resolution={d.resolution} seconds={d.sourceVideoDurationSeconds} />}
          <Text style={[styles.small, { color: c.mutedForeground }]}>Модель: {m.endpointId}</Text>
        </View>
      )}

      {!d.videoUri && m && (
        <View style={[styles.note, { backgroundColor: c.secondary, borderColor: c.border }]}>
          <Feather name="info" size={18} color={c.foreground} />
          <Text style={[styles.noteText, { color: c.foreground }]}>Сохранены настройки Light Swapper. Перенос движений и замена в видео пока не подключены; генерация PixVerse не подменяет выбранную модель.</Text>
        </View>
      )}
      {!d.videoUri && !m && (
        <View style={[styles.note, { backgroundColor: d.generationStatus === 'failed' ? c.sun : c.secondary, borderColor: c.border }]}>
          {isGenerating ? (
            <ActivityIndicator size="small" color={c.foreground} />
          ) : (
            <Feather name={d.generationStatus === 'failed' ? 'alert-circle' : 'info'} size={18} color={c.foreground} />
          )}
          <Text style={[styles.noteText, { color: c.foreground }]}>
            {d.generationStatus === 'submitting'
              ? 'Загружаем фото и отправляем его в очередь генерации.'
              : d.generationStatus === 'queued'
                ? `Запрос в очереди${statusQuery.data?.queuePosition ? ` · перед ним ${statusQuery.data.queuePosition}` : ''}. Видео появится здесь автоматически.`
                : d.generationStatus === 'processing'
                  ? 'Провайдер создаёт видео. Это может занять несколько минут — экран можно закрыть.'
                  : d.generationStatus === 'failed'
                    ? d.generationError ?? 'Не удалось создать видео. Попробуй ещё раз.'
                    : 'Фото будет отправлено в Higgsfield (PixVerse V6). Генерация расходует баланс Higgsfield.'}
          </Text>
        </View>
      )}

      {!d.videoUri && statusQuery.isError && (
        <View style={[styles.note, { backgroundColor: c.sun, borderColor: c.border }]}>
          <Feather name="wifi-off" size={18} color={c.foreground} />
          <Text style={[styles.noteText, { color: c.foreground }]}>{readableVideoError(statusQuery.error)}</Text>
          <Bouncy onPress={() => statusQuery.refetch()} style={styles.refreshStatus}>
            <Feather name="refresh-cw" size={18} color={c.foreground} />
          </Bouncy>
        </View>
      )}

      <View style={{ gap: 12, marginTop: 20 }}>
        {!d.videoUri && !isGenerating && !m && (
          <BigButton
            label={busy === 'generate' ? 'Отправляем фото…' : d.generationRequestId ? 'Проверить запрос' : d.generationStatus === 'failed' ? 'Повторить отправку' : 'Создать танцевальное видео'}
            icon={busy === 'generate' ? 'loader' : d.generationStatus === 'failed' ? 'refresh-cw' : 'play'}
            color="primary"
            onPress={generateVideo}
            disabled={!!busy}
            testID="generate-video"
          />
        )}
        {d.videoUri && (
          <>
            {d.savedVideoAssetId ? (
              <BigButton label={busy === 'delete' ? 'Удаляем…' : 'Удалить из медиатеки'} icon="trash-2" color="sun" onPress={deleteSavedVideo} disabled={!!busy} testID="delete-saved-video" />
            ) : (
              <BigButton label={busy === 'save' ? 'Сохраняем…' : 'Сохранить в медиатеку'} icon="download" color="accent" onPress={saveToLibrary} disabled={!!busy} testID="save-video" />
            )}
            <BigButton label={busy === 'share' ? 'Готовим видео…' : 'Поделиться танцем'} icon="share-2" color="violet" onPress={share} disabled={!!busy} testID="share-video" />
          </>
        )}
        <BigButton label="Открыть танец" icon="music" color="violet" onPress={() => router.push(`/template/${t.id}`)} />
        <BigButton label="Новый черновик" icon="plus" color="accent" onPress={() => router.push('/create')} />
        <BigButton label="Удалить" icon="trash-2" color="sun" onPress={del} small />
      </View>
    </ScrollView>
  );
}

function GeneratedVideo({ uri }: { uri: string }) {
  const c = useColors();
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = true;
  });
  return (
    <View style={[styles.videoFrame, { borderColor: c.border, backgroundColor: c.muted }]}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />
    </View>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 1.5, borderColor: c.input }]}>
      <Text style={[styles.k, { color: c.mutedForeground }]}>{k}</Text>
      <Text style={[styles.v, { color: c.foreground }]} numberOfLines={2}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { height: 120, borderWidth: 1, borderStyle: 'dashed', borderRadius: 6, alignItems: 'center', justifyContent: 'center', gap: 6, marginVertical: 16, padding: 12 },
  emptyText: { fontFamily: F.bodyBold, fontSize: 13, textAlign: 'center' },
  h: { fontFamily: F.display, fontSize: 16, marginTop: 6 },
  small: { fontFamily: F.bodyBold, fontSize: 12, lineHeight: 17 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.display, fontSize: 30, lineHeight: 34, letterSpacing: -1 },
  collage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 28 },
  videoFrame: { width: '100%', aspectRatio: 9 / 16, maxHeight: 520, borderWidth: 1, borderRadius: 24, overflow: 'hidden', marginTop: 22 },
  photo: { width: 140, height: 190, borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  plus: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginHorizontal: -12, zIndex: 2 },
  lbl: { position: 'absolute', bottom: 8, left: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  lblText: { fontFamily: F.bodyHeavy, fontSize: 10 },
  summary: { borderWidth: 1, borderRadius: 24, paddingHorizontal: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 13 },
  k: { fontFamily: F.bodyBold, fontSize: 14 },
  v: { fontFamily: F.bodyHeavy, fontSize: 14, flex: 1, textAlign: 'right' },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 20, borderWidth: 1, marginTop: 16 },
  noteText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13, lineHeight: 19 },
  refreshStatus: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
