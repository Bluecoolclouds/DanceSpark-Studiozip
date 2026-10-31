import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CostPreview, QualityPicker, RefGrid, SourcePreview, fmtSec, getModel } from '@/components/generation-form';
import { Bouncy, EmptyState, FavButton } from '@/components/ui';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import colors from '@/constants/colors';
import { F } from '@/constants/fonts';
import { GENERATION_MODELS, GenerationModel, GenerationResolution, MAX_OUTPUT_SECONDS, MAX_REFERENCE_IMAGES } from '@/constants/generation';
import { categoryLabel, getTemplate } from '@/constants/templates';
import { useDance } from '@/context/DanceContext';
import { ColorScope, useColors } from '@/hooks/useColors';

const N = colors.neon;

const MAX_PROMPT = 10000;
interface SourceVideo { uri: string; seconds: number | null }

export default function TemplatePlayground() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ColorScope.Provider value={N}><TemplatePlaygroundForm key={id} id={id} /></ColorScope.Provider>;
}

function TemplatePlaygroundForm({ id }: { id: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const t = getTemplate(id);
  const { addDraft, draftStorageIssue } = useDance();
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom;
  const wide = width >= 900;

  const original: SourceVideo | null = t?.videoUri && t.sourceDurationSeconds != null
    ? { uri: t.videoUri, seconds: t.sourceDurationSeconds } : null;
  const [model, setModel] = useState<GenerationModel>('object-swap');
  const [source, setSource] = useState<SourceVideo | null>(original);
  const [refs, setRefs] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [resolution, setResolution] = useState<GenerationResolution>('720p');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<'video' | 'images' | 'prompt' | null>(null);

  if (!t) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: top + 40 }}>
        <EmptyState icon="alert-circle" title="Танец не найден" text="Возможно, он ушёл со сцены." action="Назад" onAction={() => router.back()} />
      </View>
    );
  }
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
    // Expo's web picker returns HTMLVideoElement.duration (seconds);
    // native pickers return milliseconds.
    const duration = a.duration;
    setSource({ uri: a.uri, seconds: duration != null && Number.isFinite(duration) && duration > 0
      ? duration / (Platform.OS === 'web' ? 1 : 1000) : null });
  });
  const addRefs = (uris: string[]) => setRefs((prev) => {
    const room = Math.max(MAX_REFERENCE_IMAGES - prev.length, 0);
    if (uris.length > room) setError(`Можно не больше ${MAX_REFERENCE_IMAGES} фото. Добавлено ${room} из ${uris.length}.`);
    return [...prev, ...uris.slice(0, room)];
  });
  const full = () => { setError(`Уже ${MAX_REFERENCE_IMAGES} фото — удали одно, чтобы добавить новое.`); };
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
    if (refs.length >= MAX_REFERENCE_IMAGES) return full();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return denied('камере');
    const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [3, 4], quality: 0.8 });
    if (!r.canceled && r.assets[0]) addRefs([r.assets[0].uri]);
  });

  const reset = () => {
    setModel('object-swap'); setSource(original); setRefs([]); setPrompt(''); setResolution('720p'); setError(null);
    setExpanded(null);
  };

  const blocker = !source ? 'Добавь видео'
    : source.seconds == null || !(source.seconds > 0) ? 'Выбери другое видео'
    : refs.length === 0 ? 'Добавь фото' : null;

  const save = () => {
    if (blocker || saving || !source || source.seconds == null) return;
    setSaving(true);
    try {
      const d = addDraft({
        templateId: t.id, photoUri: refs[0], duration: Math.min(source.seconds, MAX_OUTPUT_SECONDS),
        model, resolution, sourceVideoUri: source.uri, sourceVideoDurationSeconds: source.seconds,
        referenceImageUris: refs, prompt: prompt.trim() || undefined,
      });
      router.push(`/draft/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? `Черновик не сохранён: ${e.message}` : 'Черновик не сохранён. Попробуй ещё раз.');
    } finally { setSaving(false); }
  };

  const panel = [styles.panel, { backgroundColor: c.card, borderColor: c.glassEdge }];

  const toggle = (key: 'video' | 'images' | 'prompt') => setExpanded((value) => value === key ? null : key);
  const compactRow = (key: 'video' | 'images' | 'prompt', icon: React.ComponentProps<typeof Feather>['name'], title: string, subtitle: string, media?: React.ReactNode, onPress?: () => void) => {
    const active = expanded === key;
    return (
      <Bouncy testID={`input-row-${key}`} accessibilityLabel={`${title}. ${subtitle}${active ? ', свернуть' : ', открыть'}`}
        onPress={onPress ?? (() => toggle(key))} style={[styles.compactRow, key === 'prompt' && styles.promptRow, { backgroundColor: c.muted, borderColor: c.border }]}>
        {media ?? <View style={[styles.rowIcon, { backgroundColor: c.card }]}><Feather name={icon} size={18} color={c.foreground} /></View>}
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, { color: c.foreground }]}>{title}</Text>
          <Text numberOfLines={1} style={[styles.rowSubtitle, { color: c.mutedForeground }]}>{subtitle}</Text>
        </View>
        <Feather name={active ? 'chevron-up' : 'chevron-right'} size={19} color={c.mutedForeground} />
      </Bouncy>
    );
  };
  const openImageSection = () => {
    if (expanded === 'images') {
      setExpanded(null);
      return;
    }
    setExpanded('images');
    if (refs.length >= MAX_REFERENCE_IMAGES) return full();
    if (Platform.OS === 'web') {
      void pickImages();
      return;
    }
    Alert.alert('Добавить фото', undefined, [
      { text: 'Галерея', onPress: () => { void pickImages(); } },
      { text: 'Камера', onPress: () => { void pickCamera(); } },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };
  const input = (
    <View style={{ gap: 10 }}>
      <View accessibilityRole="radiogroup" style={[styles.seg, { backgroundColor: c.muted, borderColor: c.border }]}>
        {GENERATION_MODELS.map((x) => {
          const on = x.id === model;
          return <Bouncy key={x.id} testID={`model-${x.id}`} accessibilityLabel={`${x.id === 'object-swap' ? 'Замена объекта' : 'Перенос движения'}${on ? ', выбрано' : ''}`} onPress={() => setModel(x.id)} scaleTo={0.97}
            style={[styles.segItem, on && { backgroundColor: x.id === 'object-swap' ? N.pink : N.violet, borderColor: 'transparent' }]}>
            <Text style={[styles.segText, { color: on ? c.primaryForeground : c.foreground }]}>{x.id === 'object-swap' ? 'Замена объекта' : 'Перенос движения'}</Text>
          </Bouncy>;
        })}
      </View>
      <Text style={[styles.hint, { color: c.mutedForeground, marginTop: -5 }]}>{m.subtitle}</Text>
      <View style={[panel, { padding: 10, gap: 8 }]}>
        <View style={styles.panelHead}>
          <Text style={[styles.panelTitle, { color: c.foreground, fontSize: 18 }]}>Ввод</Text>
          <View style={{ flex: 1 }} />
          <Feather name="info" size={16} color={c.mutedForeground} />
          <Bouncy testID="reset-form" accessibilityLabel="Сбросить настройки" onPress={reset} style={styles.resetIcon}>
            <Feather name="rotate-ccw" size={15} color={c.mutedForeground} />
          </Bouncy>
        </View>
        {compactRow('video', 'video', 'Добавь видео для переноса движений', source
          ? (source.seconds == null ? 'Видео выбрано' : fmtSec(source.seconds))
          : 'До 1 видео', source && isOriginal ? (
            <View style={styles.mediaThumb}>
              <Image source={t.image} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={[styles.mediaPlay, { backgroundColor: c.scrim }]}>
                <Feather name="play" size={13} color={c.primaryForeground} />
              </View>
            </View>
          ) : undefined)}
        {expanded === 'video' && <View style={[styles.expandedContent, { backgroundColor: c.card, borderColor: c.border }]}>
          {source ? <View style={{ gap: 8 }}>
            <SourcePreview key={source.uri} uri={source.uri} height={wide ? 220 : 190} />
            <View style={styles.row}>
              <Text style={[styles.meta, { color: c.foreground }]} numberOfLines={2}>{isOriginal ? `Танец «${t.title}» · ` : 'Твоё видео · '}{source.seconds == null ? 'длительность неизвестна' : fmtSec(source.seconds)}</Text>
              {!isOriginal && original && <Sq id="restore-video" icon="corner-up-left" label="Вернуть видео танца" onPress={() => { setSource(original); setError(null); }} />}
              <Sq id="replace-video" icon="refresh-cw" label="Заменить видео" onPress={pickVideo} />
              <Sq id="remove-video" icon="x" label="Убрать видео" onPress={() => setSource(null)} />
            </View>
            {source.seconds == null && <Text style={[styles.warn, { color: c.destructive }]}>Галерея не сообщила длину ролика — выбери другое видео.</Text>}
          </View> : <View style={{ gap: 8 }}>
            <Bouncy testID="pick-video" onPress={pickVideo} style={[styles.pick, { minHeight: 48, borderColor: c.border, backgroundColor: c.muted }]}>
              <Feather name="upload" size={17} color={c.foreground} /><Text style={[styles.pickText, { color: c.foreground }]}>Выбрать видео</Text>
            </Bouncy>
            {original && <Bouncy testID="restore-video" onPress={() => setSource(original)} style={[styles.ghost, { borderColor: c.border, alignSelf: 'flex-start' }]}>
              <Feather name="corner-up-left" size={14} color={c.foreground} /><Text style={[styles.ghostText, { color: c.foreground }]}>Вернуть видео «{t.title}»</Text>
            </Bouncy>}
            {!original && <Text style={[styles.hint, { color: c.mutedForeground }]}>У этого танца нет исходного ролика — загрузи своё видео.</Text>}
          </View>}
        </View>}
        {compactRow('images', 'image', 'Добавь персонажей, товары или одежду', `${refs.length ? `${refs.length} из ${MAX_REFERENCE_IMAGES} добавлено` : `До ${MAX_REFERENCE_IMAGES} изображений`}`, undefined, openImageSection)}
        {expanded === 'images' && <View style={[styles.expandedContent, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={{ gap: 8 }}>
            {refs.length > 0 && <RefGrid uris={refs} onRemove={(i) => setRefs((p) => p.filter((_, j) => j !== i))} />}
            <Text style={[styles.hint, { color: c.mutedForeground }]}>До {MAX_REFERENCE_IMAGES} фото. Первое станет обложкой черновика.</Text>
          </View>
        </View>}
        {compactRow('prompt', 'star', 'Промпт', prompt.trim() ? prompt.trim() : 'Опиши новую сцену')}
        {expanded === 'prompt' && <View style={[styles.expandedContent, { backgroundColor: c.card, borderColor: c.border, gap: 6 }]}>
          <TextInput testID="prompt-input" value={prompt} onChangeText={setPrompt} maxLength={MAX_PROMPT} multiline
            placeholder={model === 'object-swap' ? 'Опиши новую сцену: «заменить куртку на красную»' : 'Необязательно: «танцует на крыше на закате»'}
            placeholderTextColor={c.mutedForeground} style={[styles.input, { borderColor: c.border, backgroundColor: c.muted, color: c.foreground }]} />
          <Text style={[styles.count, { color: c.mutedForeground, textAlign: 'right' }]}>{prompt.length} / {MAX_PROMPT}</Text>
        </View>}
        <View style={{ gap: 6 }}>
          <Text style={[styles.label, { color: c.foreground }]}>Качество</Text>
          <QualityPicker value={resolution} onChange={setResolution} />
        </View>
      </View>
      {draftStorageIssue && <Text style={[styles.warn, { color: c.destructive }]}>Хранилище черновиков сейчас недоступно — черновик может не сохраниться после перезапуска.</Text>}
      {error && (
        <View accessibilityRole="alert" style={[styles.err, { borderColor: c.border, backgroundColor: c.destructive }]}>
          <Feather name="alert-triangle" size={16} color={c.destructiveForeground} />
          <Text style={[styles.errText, { color: c.destructiveForeground }]}>{error}</Text>
          <Bouncy accessibilityLabel="Закрыть" onPress={() => setError(null)}><Feather name="x" size={16} color={c.destructiveForeground} /></Bouncy>
        </View>
      )}
      <Bouncy testID="save-draft" accessibilityLabel={blocker ?? 'Сохранить черновик'} disabled={!!blocker || saving} onPress={save} scaleTo={0.97}
        style={[styles.go, { opacity: blocker || saving ? 0.55 : 1 }]}>
        <LinearGradient colors={[N.pink, '#FF7A6B', N.yellow]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <Feather name={blocker ? 'lock' : 'bookmark'} size={20} color={c.primaryForeground} />
        <Text style={[styles.goText, { color: c.primaryForeground }]} numberOfLines={1}>{blocker ?? (saving ? 'Сохраняем…' : 'Сохранить черновик')}</Text>
      </Bouncy>
      <CostPreview resolution={resolution} seconds={source?.seconds} />
      <Text style={[styles.hint, { color: c.mutedForeground }]}>{`Модель берёт первые ${MAX_OUTPUT_SECONDS} сек исходного видео и оставляет его оригинальный звук.`}</Text>
    </View>
  );

  const result = (
    <View style={[panel, { gap: 12 }]}>
      <View style={styles.row}><Text style={[styles.panelTitle, { color: c.foreground }]}>Результат</Text><Feather name="star" size={16} color={N.pink} /></View>
      <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.muted }]}>
        <View style={[styles.emptyIcon, { backgroundColor: N.pink, borderColor: 'transparent' }]}>
          <Feather name="film" size={20} color={c.primaryForeground} />
        </View>
        <Text style={[styles.emptyTitle, { color: c.foreground }]}>Здесь пока пусто</Text>
        <Text style={[styles.hint, { color: c.mutedForeground, textAlign: 'center', maxWidth: 280 }]}>
          Обработка Light Swapper ещё не подключена. Настройки сохранятся как черновик на этом устройстве — без запуска и списаний.
        </Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background, overflow: 'hidden', width: '100%', maxWidth: '100%' }}>
      <Stage />
      <KeyboardAwareScrollViewCompat bottomOffset={24} style={{ width: '100%' }} contentContainerStyle={{ overflow: 'hidden', paddingTop: top + 8, paddingBottom: bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.wrap, { maxWidth: wide ? 1120 : 640 }]}>
          <View style={styles.topBar}>
            <Bouncy testID="back" accessibilityLabel="Назад" onPress={() => router.back()} style={[styles.round, { backgroundColor: c.glass, borderColor: c.glassEdge }]}>
              <Feather name="arrow-left" size={20} color={c.foreground} />
            </Bouncy>
            <View pointerEvents="none" accessibilityLabel="Danceflow" style={styles.centerBrand}>
              <Text style={[styles.brand, { color: c.foreground }]}>Dance<Text style={{ color: N.pink }}>flow</Text></Text>
            </View>
            <FavButton id={t.id} size={44} />
          </View>

          <View style={styles.hero}>
            <View style={{ flex: 1, gap: 8, zIndex: 2 }}>
              <View style={styles.row}>
                <View style={[styles.tag, { backgroundColor: N.pink }]}><Text style={styles.tagText}>Light Swapper</Text></View>
                <View style={[styles.tag, { backgroundColor: N.yellow }]}><Text style={[styles.tagText, { color: N.deep }]}>{categoryLabel(t.category)}</Text></View>
              </View>
              <Text style={[styles.sub, { color: c.mutedForeground }]} numberOfLines={2}>{t.tagline}</Text>
            </View>
          </View>

          <View style={[wide ? styles.cols : { gap: 18 }]}>
            <View style={wide ? { flex: 1.1 } : undefined}>{input}</View>
            <View style={wide ? { flex: 0.9 } : undefined}>{result}</View>
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function Stage() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <LinearGradient colors={[N.card, N.background, N.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.slab, { top: -70, left: -150, width: 340, backgroundColor: N.pink, opacity: 0.16 }]} />
      <View style={[styles.slab, { top: 30, right: -170, width: 380, backgroundColor: N.yellow, opacity: 0.25 }]} />
      <View style={[styles.slab, { top: 620, right: -140, width: 280, height: 70, backgroundColor: N.cyan, opacity: 0.12 }]} />
      <View style={[styles.slab, { top: 760, left: -150, width: 300, height: 60, backgroundColor: N.pink, opacity: 0.12 }]} />
      <View style={[styles.slab, { top: 300, left: -200, width: 280, height: 26, backgroundColor: N.violet, opacity: 0.12 }]} />
    </View>
  );
}

function Field({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.panelHead}>
        <Text style={[styles.label, { color: c.foreground }]}>{label}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function Sq({ id, icon, label, onPress }: { id: string; icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Bouncy testID={id} accessibilityLabel={label} onPress={onPress} style={[styles.sq, { backgroundColor: c.muted, borderColor: c.border }]}>
      <Feather name={icon} size={16} color={c.foreground} />
    </Bouncy>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  topBar: { position: 'relative', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  centerBrand: { position: 'absolute', left: 44, right: 44, alignItems: 'center' },
  brand: { fontFamily: F.display, fontSize: 24, letterSpacing: -0.6 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  slab: { position: 'absolute', height: 140, transform: [{ rotate: '-28deg' }] },
  go: { minHeight: 60, borderRadius: 30, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  goText: { fontFamily: F.display, fontSize: 18, flexShrink: 1 },
  dropIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontFamily: F.bodyHeavy, fontSize: 11, color: '#FFFCFF' },
  sub: { fontFamily: F.body, fontSize: 14, lineHeight: 19 },
  cols: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  panel: { borderWidth: 1, borderRadius: 22, padding: 16 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  panelTitle: { fontFamily: F.display, fontSize: 22 },
  compactRow: { minHeight: 68, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 8 },
  promptRow: { minHeight: 50 },
  rowIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mediaThumb: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden', flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  mediaPlay: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: F.bodyHeavy, fontSize: 13, lineHeight: 17, flexShrink: 1 },
  rowSubtitle: { fontFamily: F.body, fontSize: 11, lineHeight: 14 },
  expandedContent: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  resetIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  label: { fontFamily: F.bodyHeavy, fontSize: 14, flex: 1 },
  count: { fontFamily: F.bodyHeavy, fontSize: 12 },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36 },
  ghostText: { fontFamily: F.bodyBold, fontSize: 13 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: F.display, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta: { flex: 1, fontFamily: F.bodyHeavy, fontSize: 13 },
  sq: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  drop: { height: 150, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  dropTitle: { fontFamily: F.display, fontSize: 16 },
  pick: { flex: 1, minHeight: 52, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pickText: { fontFamily: F.display, fontSize: 14 },
  input: { minHeight: 96, maxHeight: 200, borderWidth: 1, borderRadius: 16, padding: 12, fontFamily: F.bodyBold, fontSize: 14, textAlignVertical: 'top' },
  hint: { fontFamily: F.body, fontSize: 12, lineHeight: 16 },
  warn: { fontFamily: F.bodyBold, fontSize: 12 },
  empty: { minHeight: 240, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '6deg' }] },
  emptyTitle: { fontFamily: F.display, fontSize: 17 },
  err: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 10 },
  errText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13 },
});
