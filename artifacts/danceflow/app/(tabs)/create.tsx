import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SwapWorkspace } from '@/components/swap-workspace';
import { BigButton, Bouncy, EmptyState } from '@/components/ui';
import { F } from '@/constants/fonts';
import { getTemplate, type DanceTemplate } from '@/constants/templates';
import { photoStyleId } from '@/constants/photo-styles';
import { useCatalogueTemplate } from '@/hooks/useCatalogue';
import { useDance } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';
import { useCreateVideoGeneration, VideoGenerationInputStyleId, type VideoGenerationInput } from '@workspace/api-client-react';
import { photoToDataUrl, readableVideoError } from '@/lib/video-generation';
import { useAuth } from '@clerk/expo';

/** PixVerse styles are the API's own style ids, resolved via the public getTemplate. */
const PIXVERSE_STYLES = (Object.values(VideoGenerationInputStyleId) as VideoGenerationInput['styleId'][])
  .map((id) => ({ id, t: getTemplate(id) }))
  .filter((x): x is { id: VideoGenerationInput['styleId']; t: DanceTemplate } => !!x.t);
const API_DURATIONS = [5, 10, 15] as const;

export default function Create() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ template?: string }>();
  const [mode, setMode] = useState<'swap' | 'photo'>('swap');
  const top = Platform.OS === 'web' ? 67 : insets.top;
  // Only an explicit ?template= link preselects a trend; otherwise Create starts empty.
  const linkedQuery = useCatalogueTemplate(params.template);
  const linked = params.template ? linkedQuery.template ?? null : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingTop: top + 12, paddingBottom: 130 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.wrap, { maxWidth: width >= 900 ? 720 : 640 }]}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: c.foreground }]}>Новый <Text style={{ color: c.primary }}>танец</Text></Text>
        </View>
        <View accessibilityRole="tablist" style={[styles.tabs, { borderColor: c.border, backgroundColor: c.card }]}>
          {([['swap', 'Light Swapper', 'layers'], ['photo', 'Фото в танец · PixVerse', 'image']] as const).map(([k, label, icon]) => {
            const on = mode === k;
            return (
              <Bouncy key={k} testID={`mode-${k}`} accessibilityLabel={`${label}${on ? ', выбрано' : ''}`} onPress={() => setMode(k)} scaleTo={0.97}
                style={[styles.tab, on && { backgroundColor: c.accent }]}>
                <Feather name={icon} size={14} color={c.foreground} />
                <Text numberOfLines={1} style={[styles.tabText, { color: c.foreground }]}>{label}</Text>
              </Bouncy>
            );
          })}
        </View>
        <View style={mode === 'swap' ? undefined : { display: 'none' }}>
          {params.template && !linked ? (
            <EmptyState icon="info" title={linkedQuery.isPending ? 'Загружаем танец…' : 'Танец недоступен'}
              text="Для нового черновика нужен опубликованный танец. Сохранённые черновики остаются в студии."
              action="Повторить" onAction={() => void linkedQuery.refetch()} />
          ) : <SwapWorkspace key={linked?.id ?? 'empty'} initialTrend={linked} allowTrendPicker defaultModel="motion-transfer" />}
        </View>
        <View style={mode === 'photo' ? undefined : { display: 'none' }}>
          <PhotoDance />
        </View>
      </View>
    </ScrollView>
  );
}

/** Separate, real PixVerse photo-to-video flow (paid, auth-gated, idempotent via draft id). */
function PhotoDance() {
  const c = useColors();
  const { addDraft, updateDraft, draftStorageIssue } = useDance();
  const createGeneration = useCreateVideoGeneration();
  const { isSignedIn } = useAuth();
  const [photo, setPhoto] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<VideoGenerationInput['styleId'] | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const style = PIXVERSE_STYLES.find((x) => x.id === styleId)?.t;
  const dur = style && duration && style.durations.includes(duration) ? duration : style?.durations[0] ?? null;

  const pickPhoto = async (camera: boolean) => {
    setError(null);
    try {
      const useCamera = camera && Platform.OS !== 'web';
      const perm = useCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const msg = `Нет доступа к ${useCamera ? 'камере' : 'галерее'}. Разреши его в ${Platform.OS === 'web' ? 'браузере' : 'настройках'}.`;
        setError(msg);
        if (Platform.OS !== 'web') Alert.alert('Нет доступа', msg, [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Настройки', onPress: () => Linking.openSettings().catch(() => {}) },
        ]);
        return;
      }
      const r = useCamera
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [3, 4], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!r.canceled && r.assets[0]) setPhoto(r.assets[0].uri);
    } catch (e) {
      setError(e instanceof Error ? `Не получилось: ${e.message}` : 'Не получилось открыть галерею.');
    }
  };

  const blocker = !photo ? 'Сначала выбери фото' : !styleId || !dur ? 'Выбери стиль' : null;

  const generate = async () => {
    if (blocker || generating || !photo || !styleId || !dur) return;
    if (!isSignedIn) { router.push('/sign-in'); return; }
    setGenerating(true); setError(null);
    const draft = addDraft({ templateId: styleId, templateSnapshot: style, photoUri: photo, duration: dur, generationStatus: 'submitting' });
    try {
      const imageDataUrl = await photoToDataUrl(photo);
      const result = await createGeneration.mutateAsync({
        data: { clientRequestId: draft.id, imageDataUrl, styleId: photoStyleId(styleId), duration: dur as VideoGenerationInput['duration'] },
      });
      updateDraft(draft.id, { generationStatus: 'queued', generationRequestId: result.requestId });
      setPhoto(null);
    } catch (e) {
      const message = readableVideoError(e);
      updateDraft(draft.id, { generationStatus: 'failed', generationError: message });
      setError(message);
    } finally {
      setGenerating(false);
      router.push(`/draft/${draft.id}`);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={[styles.panel, { backgroundColor: c.card, borderColor: c.glassEdge }]}>
        <Text style={[styles.label, { color: c.foreground }]}>Фото</Text>
        <View style={styles.photoRow}>
          {photo && <View style={styles.photoWrap}>
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
          </View>}
          {photo && <Bouncy testID="remove-photo" accessibilityLabel="Убрать фото" onPress={() => setPhoto(null)} style={[styles.sq, { borderColor: c.border, backgroundColor: c.muted }]}>
            <Feather name="x" size={16} color={c.foreground} />
          </Bouncy>}
          <Bouncy testID="pick-photo-library" onPress={() => pickPhoto(false)} style={[styles.pick, { borderColor: c.border, backgroundColor: c.muted }]}>
            <Feather name="image" size={17} color={c.foreground} /><Text style={[styles.pickText, { color: c.foreground }]}>Галерея</Text>
          </Bouncy>
          <Bouncy testID="pick-photo-camera" onPress={() => pickPhoto(true)} style={[styles.pick, { borderColor: c.border, backgroundColor: c.muted }]}>
            <Feather name="camera" size={17} color={c.foreground} /><Text style={[styles.pickText, { color: c.foreground }]}>Камера</Text>
          </Bouncy>
        </View>

        <Text style={[styles.label, { color: c.foreground }]}>Стиль PixVerse</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {PIXVERSE_STYLES.map(({ id, t }) => {
            const on = id === styleId;
            return (
              <Bouncy key={id} testID={`style-${id}`} accessibilityLabel={`${t.title}${on ? ', выбран' : ''}`} onPress={() => setStyleId(id)}
                style={[styles.tpl, { backgroundColor: c[t.color], borderColor: on ? c.primary : c.border }]}>
                <Image source={t.image} style={{ flex: 1 }} contentFit="cover" />
                <Text numberOfLines={1} style={[styles.tplText, { color: c.foreground, backgroundColor: on ? c.accent : c.card }]}>{t.title}</Text>
              </Bouncy>
            );
          })}
        </ScrollView>

        <Text style={[styles.label, { color: c.foreground }]}>Длительность</Text>
        <View style={styles.photoRow}>
          {API_DURATIONS.map((d) => {
            const ok = !!style?.durations.includes(d);
            return (
              <Bouncy key={d} testID={`duration-${d}`} disabled={!ok} onPress={() => setDuration(d)}
                style={[styles.dur, { borderColor: c.border, backgroundColor: dur === d ? c.sun : c.muted }]}>
                <Text style={[styles.pickText, { color: c.foreground }]}>{d} сек</Text>
              </Bouncy>
            );
          })}
        </View>
        {!!style && <Text style={[styles.hint, { color: c.mutedForeground }]}>Недоступные длительности не поддерживаются этим стилем.</Text>}
      </View>

      {draftStorageIssue && <Text style={[styles.warn, { color: c.destructive }]}>Хранилище черновиков сейчас недоступно — статус может не сохраниться после перезапуска.</Text>}
      {error && <Text accessibilityRole="alert" style={[styles.warn, { color: c.destructive }]}>{error}</Text>}
      <BigButton testID="generate-video" label={generating ? 'Отправляем фото…' : blocker ?? (isSignedIn ? 'Создать видео' : 'Войти и создать видео')}
        icon={generating ? 'loader' : isSignedIn ? 'play' : 'log-in'} disabled={!!blocker || generating} onPress={generate} />
      <View style={[styles.note, { borderColor: c.border }]}>
        <Feather name="credit-card" size={14} color={c.mutedForeground} />
        <Text style={[styles.hint, { color: c.mutedForeground, flex: 1 }]}>Платное действие: фото уйдёт в Higgsfield (PixVerse V6), нужна оплаченная подписка. Движения из видео здесь не переносятся.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignSelf: 'center', paddingHorizontal: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: F.display, fontSize: 28, letterSpacing: -0.8 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3, gap: 3 },
  tab: { flex: 1, minHeight: 42, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  tabText: { fontFamily: F.bodyHeavy, fontSize: 12, flexShrink: 1 },
  panel: { borderWidth: 1, borderRadius: 22, padding: 12, gap: 10 },
  label: { fontFamily: F.bodyHeavy, fontSize: 14 },
  photoRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  photoWrap: { width: 56, height: 72, borderRadius: 10, overflow: 'hidden' },
  sq: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pick: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pickText: { fontFamily: F.display, fontSize: 14 },
  dur: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tpl: { width: 96, height: 136, borderRadius: 12, borderWidth: 2, overflow: 'hidden' },
  tplText: { fontFamily: F.bodyHeavy, fontSize: 11, paddingHorizontal: 6, paddingVertical: 5 },
  hint: { fontFamily: F.body, fontSize: 12, lineHeight: 16 },
  warn: { fontFamily: F.bodyBold, fontSize: 12 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 10 },
});
