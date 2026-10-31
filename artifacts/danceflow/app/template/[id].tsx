import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CostPreview, QualityPicker, RefCounter, RefGrid, SourcePreview, fmtSec, getModel } from '@/components/generation-form';
import { BigButton, Bouncy, EmptyState, FavButton, tone } from '@/components/ui';
import { F } from '@/constants/fonts';
import { GENERATION_MODELS, GenerationModel, GenerationResolution, MAX_OUTPUT_SECONDS, MAX_REFERENCE_IMAGES } from '@/constants/generation';
import { categoryLabel, getTemplate } from '@/constants/templates';
import { useDance } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';

const MAX_PROMPT = 10000;
interface SourceVideo { uri: string; seconds: number | null }

export default function TemplatePlayground() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TemplatePlaygroundForm key={id} id={id} />;
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
  };

  const blocker = !source ? 'Добавь видео'
    : source.seconds == null || !(source.seconds > 0) ? 'Длительность видео неизвестна'
    : refs.length === 0 ? 'Добавь хотя бы одно фото' : null;

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

  const panel = [styles.panel, { backgroundColor: c.card, borderColor: c.border }];

  const input = (
    <View style={[panel, { gap: 14 }]}>
      <View style={styles.panelHead}>
        <Text style={[styles.panelTitle, { color: c.foreground }]}>Ввод</Text>
        <Bouncy testID="reset-form" onPress={reset} style={[styles.ghost, { borderColor: c.border }]}>
          <Feather name="rotate-ccw" size={14} color={c.foreground} />
          <Text style={[styles.ghostText, { color: c.foreground }]}>Сбросить</Text>
        </Bouncy>
      </View>

      <View accessibilityRole="radiogroup" style={[styles.seg, { backgroundColor: c.muted, borderColor: c.border }]}>
        {GENERATION_MODELS.map((x) => {
          const on = x.id === model;
          return (
            <Bouncy key={x.id} testID={`model-${x.id}`} accessibilityLabel={`${x.id === 'object-swap' ? 'Object Swap' : 'Motion Transfer'}${on ? ', выбрано' : ''}`} onPress={() => setModel(x.id)} scaleTo={0.97}
              style={[styles.segItem, on && { backgroundColor: x.id === 'object-swap' ? c.accent : c.secondary, borderColor: c.border }]}>
              <Text style={[styles.segText, { color: c.foreground }]}>{x.id === 'object-swap' ? 'Object Swap' : 'Motion Transfer'}</Text>
            </Bouncy>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: c.mutedForeground, marginTop: -6 }]}>{m.subtitle}</Text>

      <Field label="Видео-референс" right={<Text style={[styles.count, { color: c.mutedForeground }]}>{source ? 1 : 0} / 1</Text>}>
        {source ? (
          <View style={{ gap: 8 }}>
            <SourcePreview key={source.uri} uri={source.uri} height={wide ? 280 : 240} />
            <View style={styles.row}>
              <Text style={[styles.meta, { color: c.foreground }]} numberOfLines={1}>
                {isOriginal ? `Танец «${t.title}» · ` : 'Твоё видео · '}
                {source.seconds == null ? 'длительность неизвестна' : fmtSec(source.seconds)}
              </Text>
              {!isOriginal && original && <Sq id="restore-video" icon="corner-up-left" label="Вернуть видео танца" onPress={() => { setSource(original); setError(null); }} />}
              <Sq id="replace-video" icon="refresh-cw" label="Заменить видео" onPress={pickVideo} />
              <Sq id="remove-video" icon="x" label="Убрать видео" onPress={() => setSource(null)} />
            </View>
            {source.seconds == null && <Text style={[styles.warn, { color: c.destructive }]}>Галерея не сообщила длину ролика — выбери другое видео.</Text>}
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Bouncy testID="pick-video" onPress={pickVideo} style={[styles.drop, { borderColor: c.border, backgroundColor: c.secondary }]}>
              <Feather name="film" size={22} color={c.foreground} />
              <Text style={[styles.dropTitle, { color: c.foreground }]}>Добавить видео</Text>
              <Text style={[styles.hint, { color: c.foreground }]}>Только одно</Text>
            </Bouncy>
            {original && <Bouncy testID="restore-video" onPress={() => setSource(original)} style={[styles.ghost, { borderColor: c.border, alignSelf: 'flex-start' }]}>
              <Feather name="corner-up-left" size={14} color={c.foreground} />
              <Text style={[styles.ghostText, { color: c.foreground }]}>Вернуть видео «{t.title}»</Text>
            </Bouncy>}
            {!original && <Text style={[styles.hint, { color: c.mutedForeground }]}>У этого танца нет исходного ролика — загрузи своё видео.</Text>}
          </View>
        )}
      </Field>

      <Field label={model === 'object-swap' ? 'Персонажи, товары, одежда' : 'Кто будет танцевать'} right={<RefCounter n={refs.length} />}>
        <View style={{ gap: 8 }}>
          {refs.length > 0 && <RefGrid uris={refs} onRemove={(i) => setRefs((p) => p.filter((_, j) => j !== i))} />}
          <View style={styles.row}>
            <Bouncy testID="pick-library" disabled={refs.length >= MAX_REFERENCE_IMAGES} onPress={pickImages}
              style={[styles.pick, { borderColor: c.border, backgroundColor: c.background, opacity: refs.length >= MAX_REFERENCE_IMAGES ? 0.5 : 1 }]}>
              <Feather name="image" size={18} color={c.foreground} />
              <Text style={[styles.pickText, { color: c.foreground }]}>Галерея</Text>
            </Bouncy>
            {Platform.OS !== 'web' && <Bouncy testID="pick-camera" disabled={refs.length >= MAX_REFERENCE_IMAGES} onPress={pickCamera}
              style={[styles.pick, { borderColor: c.border, backgroundColor: c.background, opacity: refs.length >= MAX_REFERENCE_IMAGES ? 0.5 : 1 }]}>
              <Feather name="camera" size={18} color={c.foreground} />
              <Text style={[styles.pickText, { color: c.foreground }]}>Камера</Text>
            </Bouncy>}
          </View>
          <Text style={[styles.hint, { color: c.mutedForeground }]}>До {MAX_REFERENCE_IMAGES} фото. Первое станет обложкой черновика.</Text>
        </View>
      </Field>

      <Field label="Подсказка" right={<Text style={[styles.count, { color: c.mutedForeground }]}>{prompt.length} / {MAX_PROMPT}</Text>}>
        <TextInput
          testID="prompt-input" value={prompt} onChangeText={setPrompt} maxLength={MAX_PROMPT} multiline
          placeholder={model === 'object-swap' ? 'Опиши новую сцену: «заменить куртку на красную»' : 'Необязательно: «танцует на крыше на закате»'}
          placeholderTextColor={c.mutedForeground}
          style={[styles.input, { borderColor: c.border, backgroundColor: c.background, color: c.foreground }]}
        />
      </Field>

      <Field label="Качество">
        <QualityPicker value={resolution} onChange={setResolution} />
      </Field>
      <CostPreview resolution={resolution} seconds={source?.seconds} />
      <Text style={[styles.hint, { color: c.mutedForeground }]}>
        Модель берёт первые {MAX_OUTPUT_SECONDS} сек исходного видео и оставляет его оригинальный звук.
      </Text>
    </View>
  );

  const result = (
    <View style={[panel, { gap: 12 }]}>
      <Text style={[styles.panelTitle, { color: c.foreground }]}>Результат</Text>
      <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.muted }]}>
        <View style={[styles.emptyIcon, { backgroundColor: c.violet, borderColor: c.border }]}>
          <Feather name="film" size={20} color={c.primaryForeground} />
        </View>
        <Text style={[styles.emptyTitle, { color: c.foreground }]}>Здесь пока пусто</Text>
        <Text style={[styles.hint, { color: c.mutedForeground, textAlign: 'center', maxWidth: 280 }]}>
          Обработка Genjutsu Light ещё не подключена. Настройки сохранятся как черновик на этом устройстве — без запуска и списаний.
        </Text>
      </View>
      {draftStorageIssue && <Text style={[styles.warn, { color: c.destructive }]}>Хранилище черновиков сейчас недоступно — черновик может не сохраниться после перезапуска.</Text>}
      {error && (
        <View accessibilityRole="alert" style={[styles.err, { borderColor: c.border, backgroundColor: c.destructive }]}>
          <Feather name="alert-triangle" size={16} color={c.destructiveForeground} />
          <Text style={[styles.errText, { color: c.destructiveForeground }]}>{error}</Text>
          <Bouncy accessibilityLabel="Закрыть" onPress={() => setError(null)}><Feather name="x" size={16} color={c.destructiveForeground} /></Bouncy>
        </View>
      )}
      <BigButton testID="save-draft" label={blocker ?? (saving ? 'Сохраняем…' : 'Сохранить черновик')} icon="bookmark" disabled={!!blocker || saving} onPress={save} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.wrap, { maxWidth: wide ? 1120 : 640 }]}>
          <View style={styles.topBar}>
            <Bouncy testID="back" accessibilityLabel="Назад" onPress={() => router.back()} style={[styles.round, { backgroundColor: c.card, borderColor: c.border }]}>
              <Feather name="arrow-left" size={20} color={c.foreground} />
            </Bouncy>
            <FavButton id={t.id} size={44} />
          </View>

          <View style={styles.header}>
            <Image source={t.image} style={[styles.thumb, { borderColor: c.border, backgroundColor: tone(c, t.color) }]} contentFit="cover" />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.row}>
                <View style={[styles.tag, { backgroundColor: c.accent, borderColor: c.border }]}><Text style={[styles.tagText, { color: c.foreground }]}>Genjutsu Light</Text></View>
                <View style={[styles.tag, { backgroundColor: tone(c, t.color), borderColor: c.border }]}><Text style={[styles.tagText, { color: c.foreground }]}>{categoryLabel(t.category)}</Text></View>
              </View>
              <Text style={[styles.title, { color: c.foreground }]} numberOfLines={2}>{t.title}</Text>
              <Text style={[styles.sub, { color: c.mutedForeground }]} numberOfLines={2}>{t.tagline}</Text>
            </View>
          </View>

          <View style={[wide ? styles.cols : { gap: 14 }]}>
            <View style={wide ? { flex: 1.1 } : undefined}>{input}</View>
            <View style={wide ? { flex: 0.9 } : undefined}>{result}</View>
          </View>
        </View>
      </ScrollView>
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
    <Bouncy testID={id} accessibilityLabel={label} onPress={onPress} style={[styles.sq, { backgroundColor: c.background, borderColor: c.border }]}>
      <Feather name={icon} size={16} color={c.foreground} />
    </Bouncy>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  thumb: { width: 76, height: 96, borderRadius: 8, borderWidth: 1, transform: [{ rotate: '-3deg' }] },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontFamily: F.bodyHeavy, fontSize: 11 },
  title: { fontFamily: F.display, fontSize: 28, letterSpacing: -0.8, lineHeight: 32 },
  sub: { fontFamily: F.body, fontSize: 14, lineHeight: 19 },
  cols: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  panel: { borderWidth: 1, borderRadius: 10, padding: 14 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  panelTitle: { fontFamily: F.display, fontSize: 20 },
  label: { fontFamily: F.bodyHeavy, fontSize: 14, flex: 1 },
  count: { fontFamily: F.bodyHeavy, fontSize: 12 },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36 },
  ghostText: { fontFamily: F.bodyBold, fontSize: 13 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 42, borderRadius: 6, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: F.display, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta: { flex: 1, fontFamily: F.bodyHeavy, fontSize: 13 },
  sq: { width: 40, height: 40, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  drop: { height: 130, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  dropTitle: { fontFamily: F.display, fontSize: 16 },
  pick: { flex: 1, minHeight: 48, borderRadius: 6, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pickText: { fontFamily: F.display, fontSize: 14 },
  input: { minHeight: 96, maxHeight: 200, borderWidth: 1, borderRadius: 6, padding: 10, fontFamily: F.bodyBold, fontSize: 14, textAlignVertical: 'top' },
  hint: { fontFamily: F.body, fontSize: 12, lineHeight: 16 },
  warn: { fontFamily: F.bodyBold, fontSize: 12 },
  empty: { minHeight: 240, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  emptyIcon: { width: 44, height: 44, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '6deg' }] },
  emptyTitle: { fontFamily: F.display, fontSize: 17 },
  err: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 6, padding: 10 },
  errText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13 },
});
