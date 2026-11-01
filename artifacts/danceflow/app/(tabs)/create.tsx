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
import { StageBackdrop } from '@/components/stage-backdrop';
import { getTemplate, type DanceTemplate } from '@/constants/templates';
import { photoStyleId } from '@/constants/photo-styles';
import { useCatalogueTemplate } from '@/hooks/useCatalogue';
import { useDance } from '@/context/DanceContext';
import { ColorScope, useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';
import { useCreateVideoGeneration, VideoGenerationInputStyleId, type VideoGenerationInput } from '@workspace/api-client-react';
import { photoToDataUrl, readableVideoError } from '@/lib/video-generation';
import { useDanceAuth } from '@/lib/dance-auth';

/** PixVerse styles are the API's own style ids, resolved via the public getTemplate. */
const PIXVERSE_STYLES = (Object.values(VideoGenerationInputStyleId) as VideoGenerationInput['styleId'][])
  .map((id) => ({ id, t: getTemplate(id) }))
  .filter((x): x is { id: VideoGenerationInput['styleId']; t: DanceTemplate } => !!x.t);
const API_DURATIONS = [5, 10, 15] as const;

// Keep this lighter mix local to Create, without recolouring the other screens.
const createPalette = {
  ...colors.neon,
  card: '#FFFFFF',
  secondary: '#E3F5FC',
  muted: '#F6F5F8',
  input: '#FFFFFF',
  border: 'rgba(71,45,123,0.13)',
};

export default function Create() {
  return <ColorScope.Provider value={createPalette}><CreateScreen /></ColorScope.Provider>;
}

function CreateScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ template?: string }>();
  const top = Platform.OS === 'web' ? 67 : insets.top;
  // Only an explicit ?template= link preselects a trend; otherwise Create starts empty.
  const linkedQuery = useCatalogueTemplate(params.template);
  const linked = params.template ? linkedQuery.template ?? null : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
    <StageBackdrop />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: top + 12, paddingBottom: 130 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.wrap, { maxWidth: width >= 900 ? 720 : 640 }]}>
        <View style={styles.hero}>
          <View pointerEvents="none" style={[styles.glow, { backgroundColor: c.secondary, right: width < 360 ? -20 : 0 }]} />
          <Image source={require('@/assets/images/create-dancer.png')} accessibilityLabel="Танцующий персонаж" contentFit="contain"
            style={[styles.dancer, { width: width < 360 ? 150 : width < 400 ? 172 : 190, height: (width < 360 ? 150 : width < 400 ? 172 : 190) * 1.95, right: 12 }]} />
          <Feather name="star" size={18} color={c.sun} style={[styles.spark, { right: width < 360 ? 118 : 150, top: 58 }]} />
          <Feather name="star" size={12} color={c.violet} style={[styles.spark, { right: 6, top: 96 }]} />
          <Text style={[styles.title, { color: c.foreground, fontSize: width < 360 ? 30 : 36, lineHeight: width < 360 ? 32 : 38 }]}>Создай{'\n'}свой{'\n'}танец!</Text>
          <View style={[styles.swoosh, { backgroundColor: c.sun }]} />
        </View>
        {params.template && !linked ? (
          <EmptyState icon="info" title={linkedQuery.isPending ? 'Загружаем танец…' : 'Танец недоступен'}
            text="Для нового черновика нужен опубликованный танец. Сохранённые черновики остаются в студии."
            action="Повторить" onAction={() => void linkedQuery.refetch()} />
        ) : <SwapWorkspace key={linked?.id ?? 'empty'} initialTrend={linked} allowTrendPicker defaultModel="motion-transfer" variant="create" />}
      </View>
    </ScrollView>
    </View>
  );
}

/** Separate, real PixVerse photo-to-video flow (paid, auth-gated, idempotent via draft id). */
function PhotoDance() {
  const c = useColors();
  const { addDraft, updateDraft, draftStorageIssue } = useDance();
  const createGeneration = useCreateVideoGeneration();
  const { isSignedIn } = useDanceAuth();
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
                <Text numberOfLines={1} style={[styles.tplText, { color: c.foreground, backgroundColor: on ? c.sun : c.card }]}>{t.title}</Text>
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
  hero: { height: 222, overflow: 'hidden', paddingTop: 4, marginHorizontal: -16, paddingHorizontal: 16, marginBottom: -4 },
  glow: { position: 'absolute', top: 40, width: 190, height: 190, borderRadius: 95, opacity: 0.55 },
  dancer: { position: 'absolute', top: 6 },
  spark: { position: 'absolute' },
  swoosh: { width: 96, height: 6, borderRadius: 3, marginTop: 8, transform: [{ rotate: '-3deg' }] },
  title: { fontFamily: F.display, letterSpacing: -1, maxWidth: '58%' },
  panel: { borderWidth: 1, borderRadius: 26, padding: 14, gap: 12 },
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
