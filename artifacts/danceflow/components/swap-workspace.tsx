import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CostPreview, QualityPicker, RefGrid, SourcePreview, fmtSec, getModel } from '@/components/generation-form';
import { Bouncy } from '@/components/ui';
import { F } from '@/constants/fonts';
import { GENERATION_MODELS, GenerationModel, GenerationResolution, MAX_OUTPUT_SECONDS, MAX_REFERENCE_IMAGES } from '@/constants/generation';
import { type DanceTemplate } from '@/constants/templates';
import { useCatalogue } from '@/hooks/useCatalogue';
import { useDance } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';
import { CUSTOM_VIDEO_ID } from '@/lib/draft-meta';

export const MAX_PROMPT = 10000;
interface SourceVideo { uri: string; seconds: number | null }
type Section = 'video' | 'images' | 'prompt';

const trendSource = (t?: DanceTemplate | null): SourceVideo | null =>
  t?.videoUri && t.sourceDurationSeconds != null ? { uri: t.videoUri, seconds: t.sourceDurationSeconds } : null;

/**
 * Shared Light Swapper input form for /create and /template/:id.
 * Draft-only: saving never starts a generation or charges anything.
 */
export function SwapWorkspace({ initialTrend, allowTrendPicker, defaultModel = 'object-swap', wide }: {
  initialTrend: DanceTemplate | null; allowTrendPicker?: boolean; defaultModel?: GenerationModel; wide?: boolean;
}) {
  const catalogue = useCatalogue({ limit: 12 });
  const c = useColors();
  const { addDraft, draftStorageIssue } = useDance();
  const [trend, setTrend] = useState<DanceTemplate | null>(initialTrend);
  const original = trendSource(trend);
  const [model, setModel] = useState<GenerationModel>(defaultModel);
  const [source, setSource] = useState<SourceVideo | null>(() => trendSource(initialTrend));
  const [refs, setRefs] = useState<string[]>(() => initialTrend?.referenceImageUris ?? []);
  const [prompt, setPrompt] = useState<string>(() => initialTrend?.prompt ?? '');
  const [resolution, setResolution] = useState<GenerationResolution>('720p');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [expanded, setExpanded] = useState<Section | null>(() => initialTrend?.prompt ? 'prompt' : initialTrend ? null : 'video');
  const m = getModel(model)!;
  const isOriginal = !!original && source?.uri === original.uri;

  const denied = (what: string) => {
    const msg = `Нет доступа к ${what}. Разреши его в ${Platform.OS === 'web' ? 'браузере' : 'настройках'}.`;
    setError(msg);
    if (Platform.OS === 'web') return;
    Alert.alert('Нет доступа', msg, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Настройки', onPress: () => Linking.openSettings().catch(() => {}) },
    ]);
  };
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? `Не получилось: ${e.message}` : 'Не получилось открыть галерею.'); }
  };
  const pickVideo = () => run(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return denied('галерее');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    const a = !r.canceled ? r.assets[0] : undefined;
    if (!a) return;
    // Web returns seconds; native pickers return milliseconds.
    const d = a.duration;
    setSource({ uri: a.uri, seconds: d != null && Number.isFinite(d) && d > 0 ? d / (Platform.OS === 'web' ? 1 : 1000) : null });
    setChoosing(false);
  });
  const full = () => { setError(`Уже ${MAX_REFERENCE_IMAGES} фото — удали одно, чтобы добавить новое.`); };
  const addRefs = (uris: string[]) => setRefs((prev) => {
    const room = Math.max(MAX_REFERENCE_IMAGES - prev.length, 0);
    if (uris.length > room) setError(`Можно не больше ${MAX_REFERENCE_IMAGES} фото. Добавлено ${room} из ${uris.length}.`);
    return [...prev, ...uris.slice(0, room)];
  });
  const pickImages = () => run(async () => {
    if (refs.length >= MAX_REFERENCE_IMAGES) return full();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return denied('галерее');
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_REFERENCE_IMAGES - refs.length, quality: 0.8,
    });
    if (!r.canceled) addRefs(r.assets.map((a) => a.uri));
  });
  const pickCamera = () => run(async () => {
    if (Platform.OS === 'web') return pickImages();
    if (refs.length >= MAX_REFERENCE_IMAGES) return full();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return denied('камере');
    const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [3, 4], quality: 0.8 });
    if (!r.canceled && r.assets[0]) addRefs([r.assets[0].uri]);
  });

  const selectTrend = (t: DanceTemplate) => {
    setTrend(t);
    setSource(trendSource(t));
    // Prefill only what the user has not filled in yet.
    if (refs.length === 0 && t.referenceImageUris?.length) setRefs(t.referenceImageUris);
    if (!prompt.trim() && t.prompt) setPrompt(t.prompt);
    setChoosing(false); setError(null);
  };
  const clearTrend = () => {
    if (isOriginal) setSource(null);
    setTrend(null);
  };

  const reset = () => {
    const t = allowTrendPicker ? null : initialTrend;
    setTrend(t); setModel(defaultModel); setSource(trendSource(t)); setRefs(t?.referenceImageUris ?? []);
    setPrompt(t?.prompt ?? ''); setResolution('720p'); setError(null); setChoosing(false);
    setExpanded(t?.prompt ? 'prompt' : t ? null : 'video');
  };

  const blocker = !source ? 'Добавь видео'
    : source.seconds == null || !(source.seconds > 0) ? 'Выбери другое видео'
    : refs.length === 0 ? 'Добавь фото' : null;

  const save = () => {
    if (blocker || saving || !source || source.seconds == null) return;
    setSaving(true);
    try {
      const d = addDraft({
        // Own-source drafts never inherit a catalogue trend.
        templateId: trend?.id ?? CUSTOM_VIDEO_ID, templateSnapshot: trend ?? undefined, photoUri: refs[0], duration: Math.min(source.seconds, MAX_OUTPUT_SECONDS),
        model, resolution, sourceVideoUri: source.uri, sourceVideoDurationSeconds: source.seconds,
        referenceImageUris: refs, prompt: prompt.trim() || undefined,
      });
      router.push(`/draft/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? `Черновик не сохранён: ${e.message}` : 'Черновик не сохранён. Попробуй ещё раз.');
    } finally { setSaving(false); }
  };

  const toggle = (key: Section) => setExpanded((v) => v === key ? null : key);
  const chooseImageSource = () => {
    if (refs.length >= MAX_REFERENCE_IMAGES) return full();
    if (Platform.OS === 'web') { void pickImages(); return; }
    Alert.alert('Добавить фото', undefined, [
      { text: 'Галерея', onPress: () => { void pickImages(); } },
      { text: 'Камера', onPress: () => { void pickCamera(); } },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };
  const openImages = () => {
    if (expanded === 'images') return setExpanded(null);
    setExpanded('images');
    if (refs.length === 0) chooseImageSource();
  };

  const row = (key: Section, icon: React.ComponentProps<typeof Feather>['name'], title: string, subtitle: string, media?: React.ReactNode, onPress?: () => void) => {
    const active = expanded === key;
    return (
      <Bouncy testID={`input-row-${key}`} accessibilityLabel={`${title}. ${subtitle}${active ? ', свернуть' : ', открыть'}`} scaleTo={0.98}
        onPress={onPress ?? (() => toggle(key))} style={[s.row, key === 'prompt' && { minHeight: 52 }, { backgroundColor: c.muted, borderColor: active ? c.primary : c.border }]}>
        {media ?? <View style={[s.rowIcon, { backgroundColor: c.card }]}><Feather name={icon} size={18} color={c.foreground} /></View>}
        <View style={s.rowCopy}>
          <Text style={[s.rowTitle, { color: c.foreground }]}>{title}</Text>
          <Text numberOfLines={1} style={[s.rowSub, { color: c.mutedForeground }]}>{subtitle}</Text>
        </View>
        <Feather name={active ? 'chevron-up' : 'chevron-right'} size={19} color={c.mutedForeground} />
      </Bouncy>
    );
  };

  const videoLabel = model === 'motion-transfer' ? 'Видео с движениями для переноса' : 'Видео, где заменить объект';
  const videoSub = source
    ? `${isOriginal && trend ? `Тренд «${trend.title}»` : 'Твоё видео'} · ${source.seconds == null ? 'длина неизвестна' : fmtSec(source.seconds)}`
    : allowTrendPicker ? 'Своё видео или тренд из каталога' : 'До 1 видео';
  const thumb = source && isOriginal && trend ? (
    <View style={s.thumb}>
      <Image source={trend.videoPoster ?? trend.image} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[s.play, { backgroundColor: c.scrim }]}><Feather name="play" size={13} color={c.primaryForeground} /></View>
    </View>
  ) : undefined;

  return (
    <View style={{ gap: 10 }}>
      <View accessibilityRole="radiogroup" style={[s.seg, { backgroundColor: c.muted, borderColor: c.border }]}>
        {GENERATION_MODELS.map((x) => {
          const on = x.id === model;
          const label = x.id === 'object-swap' ? 'Замена объекта' : 'Перенос движения';
          return <Bouncy key={x.id} testID={`model-${x.id}`} accessibilityLabel={`${label}${on ? ', выбрано' : ''}`} onPress={() => setModel(x.id)} scaleTo={0.97}
            style={[s.segItem, on && { backgroundColor: x.id === 'object-swap' ? c.primary : c.violet }]}>
            <Text style={[s.segText, { color: on ? c.primaryForeground : c.foreground }]}>{label}</Text>
          </Bouncy>;
        })}
      </View>
      <Text style={[s.hint, { color: c.mutedForeground, marginTop: -4 }]}>{m.subtitle}</Text>

      <View style={[s.panel, { backgroundColor: c.card, borderColor: c.glassEdge }]}>
        <View style={s.head}>
          <Text style={[s.panelTitle, { color: c.foreground }]}>Ввод</Text>
          <Bouncy testID="reset-form" accessibilityLabel="Сбросить настройки" onPress={reset} style={s.resetIcon}>
            <Feather name="rotate-ccw" size={15} color={c.mutedForeground} />
          </Bouncy>
        </View>

        {row('video', 'video', videoLabel, videoSub, thumb)}
        {expanded === 'video' && <View style={[s.expanded, { backgroundColor: c.card, borderColor: c.border }]}>
          {source ? <View style={{ gap: 8 }}>
            <SourcePreview key={source.uri} uri={source.uri} height={wide ? 220 : 190} />
            <View style={s.line}>
              <Text style={[s.meta, { color: c.foreground }]} numberOfLines={2}>{isOriginal && trend ? `Тренд «${trend.title}» · ` : 'Твоё видео · '}{source.seconds == null ? 'длительность неизвестна' : `${fmtSec(source.seconds)} · в работу ${fmtSec(Math.min(source.seconds, MAX_OUTPUT_SECONDS))}`}</Text>
              {!isOriginal && original && <Sq id="restore-video" icon="corner-up-left" label="Вернуть видео тренда" onPress={() => { setSource(original); setError(null); }} />}
              <Sq id="replace-video" icon="refresh-cw" label="Заменить видео" onPress={pickVideo} />
              <Sq id="remove-video" icon="x" label="Убрать видео" onPress={() => setSource(null)} />
            </View>
            {source.seconds == null && <Text style={[s.warn, { color: c.destructive }]}>Галерея не сообщила длину ролика — выбери другое видео.</Text>}
          </View> : <View style={s.pickRow}>
            <Bouncy testID="pick-video" onPress={pickVideo} style={[s.pick, { borderColor: c.border, backgroundColor: c.muted }]}>
              <Feather name="upload" size={17} color={c.foreground} /><Text style={[s.pickText, { color: c.foreground }]}>Своё видео</Text>
            </Bouncy>
            {original && <Bouncy testID="restore-video" onPress={() => setSource(original)} style={[s.pick, { borderColor: c.border, backgroundColor: c.muted }]}>
              <Feather name="corner-up-left" size={17} color={c.foreground} /><Text style={[s.pickText, { color: c.foreground }]} numberOfLines={1}>Видео тренда</Text>
            </Bouncy>}
            {allowTrendPicker && !original && <Bouncy testID="choose-trend" onPress={() => setChoosing((v) => !v)} style={[s.pick, { borderColor: c.border, backgroundColor: choosing ? c.sun : c.muted }]}>
              <Feather name="grid" size={17} color={c.foreground} /><Text style={[s.pickText, { color: c.foreground }]}>Из трендов</Text>
            </Bouncy>}
          </View>}
          {allowTrendPicker && trend && <View style={s.line}>
            <Text style={[s.hint, { color: c.mutedForeground, flex: 1 }]}>Тренд: {trend.title}</Text>
            <Bouncy testID="change-trend" onPress={() => setChoosing((v) => !v)} style={[s.ghost, { borderColor: c.border }]}>
              <Text style={[s.ghostText, { color: c.foreground }]}>Другой</Text>
            </Bouncy>
            <Bouncy testID="clear-trend" onPress={clearTrend} style={[s.ghost, { borderColor: c.border }]}>
              <Text style={[s.ghostText, { color: c.foreground }]}>Без тренда</Text>
            </Bouncy>
          </View>}
          {allowTrendPicker && choosing && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {catalogue.items.map((x) => {
                const on = x.id === trend?.id;
                return (
                  <Bouncy key={x.id} testID={`trend-${x.id}`} accessibilityLabel={`Тренд ${x.title}${on ? ', выбран' : ''}`} onPress={() => selectTrend(x)}
                    style={[s.tpl, { backgroundColor: c.muted, borderColor: on ? c.primary : c.border }]}>
                    <Image source={x.videoPoster ?? x.image} style={{ flex: 1 }} contentFit="cover" />
                    <Text numberOfLines={1} style={[s.tplText, { color: c.foreground }]}>{x.title}</Text>
                  </Bouncy>
                );
              })}
              {catalogue.hasNextPage && <Bouncy disabled={catalogue.isFetching} onPress={() => void catalogue.fetchNextPage({ cancelRefetch: false })} style={[s.ghost, { borderColor: c.border }]}>
                <Text style={[s.ghostText, { color: c.foreground }]}>{catalogue.isFetching ? 'Загружаем…' : 'Ещё танцы'}</Text>
              </Bouncy>}
              {catalogue.isError && <Bouncy onPress={() => void catalogue.refetch()}><Text style={[s.hint, { color: c.destructive }]}>Не удалось загрузить танцы. Повторить</Text></Bouncy>}
              {!catalogue.isPending && !catalogue.items.length && !catalogue.isError && <Text style={[s.hint, { color: c.mutedForeground }]}>Пока нет опубликованных танцев. Можно выбрать своё видео.</Text>}
            </ScrollView>
          )}
          <Text style={[s.hint, { color: c.mutedForeground }]}>Берутся первые {MAX_OUTPUT_SECONDS} сек, звук сохраняется.</Text>
        </View>}

        {row('images', 'image', m.referenceLabel, refs.length ? `${refs.length} из ${MAX_REFERENCE_IMAGES} добавлено` : `До ${MAX_REFERENCE_IMAGES} изображений`,
          refs.length > 0 ? (
            <View style={s.refThumbs}>
              {refs.slice(0, 2).map((uri, i) => <Image key={`${uri}-${i}`} source={{ uri }} style={{ flex: 1, height: '100%' }} contentFit="cover" />)}
            </View>
          ) : undefined, openImages)}
        {expanded === 'images' && <View style={[s.expanded, { backgroundColor: c.card, borderColor: c.border }]}>
          {refs.length > 0 && <RefGrid uris={refs} onRemove={(i) => setRefs((p) => p.filter((_, j) => j !== i))} />}
          <View style={s.pickRow}>
            <Bouncy testID="pick-library" disabled={refs.length >= MAX_REFERENCE_IMAGES} onPress={pickImages} style={[s.pick, { borderColor: c.border, backgroundColor: c.muted }]}>
              <Feather name="image" size={17} color={c.foreground} /><Text style={[s.pickText, { color: c.foreground }]}>Галерея</Text>
            </Bouncy>
            <Bouncy testID="pick-camera" disabled={refs.length >= MAX_REFERENCE_IMAGES} onPress={pickCamera} style={[s.pick, { borderColor: c.border, backgroundColor: c.muted }]}>
              <Feather name="camera" size={17} color={c.foreground} /><Text style={[s.pickText, { color: c.foreground }]}>Камера</Text>
            </Bouncy>
          </View>
          <Text style={[s.hint, { color: c.mutedForeground }]}>До {MAX_REFERENCE_IMAGES} фото. Первое станет обложкой черновика.</Text>
        </View>}

        {row('prompt', 'edit-3', 'Промпт', prompt.trim() ? prompt.trim() : 'Необязательно: опиши сцену')}
        {expanded === 'prompt' && <View style={[s.expanded, { backgroundColor: c.card, borderColor: c.border, gap: 6 }]}>
          <TextInput testID="prompt-input" value={prompt} onChangeText={setPrompt} maxLength={MAX_PROMPT} multiline
            placeholder={model === 'object-swap' ? 'Например: «заменить куртку на красную»' : 'Например: «танцует на крыше на закате»'}
            placeholderTextColor={c.mutedForeground} style={[s.input, { borderColor: c.border, backgroundColor: c.muted, color: c.foreground }]} />
          <Text style={[s.count, { color: c.mutedForeground }]}>{prompt.length} / {MAX_PROMPT}</Text>
        </View>}

        <View style={{ gap: 6 }}>
          <Text style={[s.label, { color: c.foreground }]}>Качество</Text>
          <QualityPicker value={resolution} onChange={setResolution} />
        </View>
      </View>

      {draftStorageIssue && <Text style={[s.warn, { color: c.destructive }]}>Хранилище черновиков сейчас недоступно — черновик может не сохраниться после перезапуска.</Text>}
      {error && (
        <View accessibilityRole="alert" style={[s.err, { borderColor: c.border, backgroundColor: c.destructive }]}>
          <Feather name="alert-triangle" size={16} color={c.destructiveForeground} />
          <Text style={[s.errText, { color: c.destructiveForeground }]}>{error}</Text>
          <Bouncy accessibilityLabel="Закрыть" onPress={() => setError(null)}><Feather name="x" size={16} color={c.destructiveForeground} /></Bouncy>
        </View>
      )}
      <Bouncy testID="save-draft" accessibilityLabel={blocker ?? 'Сохранить черновик'} disabled={!!blocker || saving} onPress={save} scaleTo={0.97}
        style={[s.go, { opacity: blocker || saving ? 0.55 : 1 }]}>
        <LinearGradient colors={[c.primary, c.sun]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <Feather name={blocker ? 'lock' : 'bookmark'} size={20} color={c.primaryForeground} />
        <Text style={[s.goText, { color: c.primaryForeground }]} numberOfLines={1}>{blocker ?? (saving ? 'Сохраняем…' : 'Сохранить черновик')}</Text>
      </Bouncy>
      <View style={[s.note, { borderColor: c.border }]}>
        <Feather name="shield" size={14} color={c.mutedForeground} />
        <Text style={[s.hint, { color: c.mutedForeground, flex: 1 }]}>Только черновик на этом устройстве: генерация Light Swapper не запускается, ничего не списывается.</Text>
      </View>
      <CostPreview resolution={resolution} seconds={source?.seconds} />
    </View>
  );
}

function Sq({ id, icon, label, onPress }: { id: string; icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Bouncy testID={id} accessibilityLabel={label} onPress={onPress} style={[s.sq, { backgroundColor: c.muted, borderColor: c.border }]}>
      <Feather name={icon} size={16} color={c.foreground} />
    </Bouncy>
  );
}

const s = StyleSheet.create({
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 46, paddingHorizontal: 6, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: F.display, fontSize: 12, lineHeight: 15, textAlign: 'center' },
  panel: { borderWidth: 1, borderRadius: 22, padding: 10, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { fontFamily: F.display, fontSize: 18, paddingLeft: 4 },
  resetIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  row: { minHeight: 64, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 8 },
  rowIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: F.bodyHeavy, fontSize: 13, lineHeight: 17 },
  rowSub: { fontFamily: F.body, fontSize: 11, lineHeight: 14 },
  thumb: { width: 64, height: 64, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  play: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  refThumbs: { width: 64, height: 52, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', gap: 2 },
  expanded: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta: { flex: 1, fontFamily: F.bodyHeavy, fontSize: 13 },
  sq: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pickRow: { flexDirection: 'row', gap: 6 },
  pick: { flex: 1, minHeight: 50, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  pickText: { fontFamily: F.display, fontSize: 14, flexShrink: 1 },
  ghost: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  ghostText: { fontFamily: F.bodyBold, fontSize: 12 },
  tpl: { width: 96, height: 136, borderRadius: 12, borderWidth: 2, overflow: 'hidden' },
  tplText: { fontFamily: F.bodyHeavy, fontSize: 11, paddingHorizontal: 6, paddingVertical: 5 },
  input: { minHeight: 96, maxHeight: 200, borderWidth: 1, borderRadius: 16, padding: 12, fontFamily: F.bodyBold, fontSize: 14, textAlignVertical: 'top' },
  count: { fontFamily: F.bodyHeavy, fontSize: 12, textAlign: 'right' },
  label: { fontFamily: F.bodyHeavy, fontSize: 14, paddingLeft: 4 },
  hint: { fontFamily: F.body, fontSize: 12, lineHeight: 16 },
  warn: { fontFamily: F.bodyBold, fontSize: 12 },
  err: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 10 },
  errText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13 },
  go: { minHeight: 58, borderRadius: 29, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  goText: { fontFamily: F.display, fontSize: 18, flexShrink: 1 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 10 },
});
