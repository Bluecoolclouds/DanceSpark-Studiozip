import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CostPreview, ModelPicker, QualityPicker, RefCounter, RefGrid, SourcePreview, fmtSec, getModel } from '@/components/generation-form';
import { BigButton, Bouncy, DemoBadge, tone } from '@/components/ui';
import { F } from '@/constants/fonts';
import { GenerationModel, GenerationResolution, MAX_OUTPUT_SECONDS, MAX_REFERENCE_IMAGES } from '@/constants/generation';
import { TEMPLATES, getTemplate } from '@/constants/templates';
import { useDance } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';
import { useCreateVideoGeneration, type VideoGenerationInput } from '@workspace/api-client-react';
import { photoToDataUrl, readableVideoError } from '@/lib/video-generation';
import { useAuth, useClerk } from '@clerk/expo';

const MAX_PROMPT = 10000;
interface SourceVideo { uri: string; seconds: number | null }

interface SourceVideo { uri: string; seconds: number | null }

interface SourceVideo { uri: string; seconds: number | null }

export default function Create() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ template?: string }>();
  const { addDraft, updateDraft } = useDance();
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [photo, setPhoto] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [model, setModel] = useState<GenerationModel>('motion-transfer');
  const [source, setSource] = useState<SourceVideo | null>(null);
  const [refs, setRefs] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<string>('');
  const [resolution, setResolution] = useState<GenerationResolution>('720p');
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const createGeneration = useCreateVideoGeneration();
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const templateId = picked ?? (getTemplate(params.template) ? params.template! : TEMPLATES[0].id);
  const t = getTemplate(templateId)!;
  const dur = duration && t.durations.includes(duration) ? duration : t.durations[0];
  const m = getModel(model)!;
  const top = Platform.OS === 'web' ? 67 : insets.top;

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
    const ms = a.duration;
    setSource({ uri: a.uri, seconds: ms != null && Number.isFinite(ms) && ms > 0 ? ms / 1000 : null });
  });

  const addRefs = (uris: string[]) => {
    setRefs((prev) => {
      const room = MAX_REFERENCE_IMAGES - prev.length;
      if (uris.length > room) setError(`Можно не больше ${MAX_REFERENCE_IMAGES} фото. Добавлено ${Math.max(room, 0)} из ${uris.length}.`);
      return [...prev, ...uris.slice(0, Math.max(room, 0))];
    });
  };

  const pickImages = () => run(async () => {
    if (refs.length >= MAX_REFERENCE_IMAGES) return setError(`Уже ${MAX_REFERENCE_IMAGES} фото — удали одно, чтобы добавить новое.`);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return denied('галерее');
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_REFERENCE_IMAGES - refs.length, quality: 0.8,
    });
    if (!r.canceled) addRefs(r.assets.map((a) => a.uri));
  });

  const pickCamera = () => run(async () => {
    if (Platform.OS === 'web') return pickImages();
    if (refs.length >= MAX_REFERENCE_IMAGES) return setError(`Уже ${MAX_REFERENCE_IMAGES} фото — удали одно, чтобы добавить новое.`);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return denied('камере');
    const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [3, 4], quality: 0.8 });
    if (!r.canceled && r.assets[0]) addRefs([r.assets[0].uri]);
  });

  const pickPhoto = (camera: boolean) => run(async () => {
    const useCamera = camera && Platform.OS !== 'web';
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return denied(useCamera ? 'камере' : 'галерее');
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [3, 4], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0].uri);
  });

  const blocker = !source ? 'Сначала выбери видео'
    : source.seconds == null ? 'Длительность видео неизвестна'
    : refs.length === 0 ? 'Добавь хотя бы одно фото' : null;

  const generate = async () => {
    if (!photo || generating) return;
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }
    setGenerating(true);
    setGenerationError(null);
    const draft = addDraft({
      templateId: t.id,
      photoUri: photo,
      duration: dur,
      generationStatus: 'submitting',
    });
    try {
      const imageDataUrl = await photoToDataUrl(photo);
      const result = await createGeneration.mutateAsync({
        data: {
          clientRequestId: draft.id,
          imageDataUrl,
          styleId: t.id as VideoGenerationInput['styleId'],
          duration: dur as VideoGenerationInput['duration'],
        },
      });
      updateDraft(draft.id, {
        generationStatus: 'queued',
        generationRequestId: result.requestId,
      });
      setPhoto(null);
      router.push(`/draft/${draft.id}`);
    } catch (error) {
      const message = readableVideoError(error);
      updateDraft(draft.id, { generationStatus: 'failed', generationError: message });
      setGenerationError(message);
      router.push(`/draft/${draft.id}`);
    } finally {
      setGenerating(false);
    }
  };

  const save = () => {
    if (blocker || !source || source.seconds == null) return;
    const d = addDraft({
      templateId: t.id, photoUri: refs[0], duration: Math.min(source.seconds, MAX_OUTPUT_SECONDS),
      model, resolution, sourceVideoUri: source.uri, sourceVideoDurationSeconds: source.seconds,
      referenceImageUris: refs, prompt: prompt.trim() || undefined,
    });
    setSource(null); setRefs([]); setPrompt(''); setError(null);
    router.push(`/draft/${d.id}`);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingTop: top + 14, paddingBottom: 130 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={{ paddingHorizontal: 20, gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
          {(['photo', 'video'] as const).map((value) => (
            <View key={value} style={{ flex: 1 }}>
            <Bouncy testID={`mode-${value}`} disabled={generating} onPress={() => setMode(value)} style={[styles.pick, { flex: 0, backgroundColor: mode === value ? c.accent : c.card, borderColor: c.border }]}>
              <Text style={[styles.pickText, { color: c.foreground, fontSize: 12 }]}>{value === 'photo' ? 'Фото → танец' : 'Видео · черновик'}</Text>
            </Bouncy>
            </View>
          ))}
        </View>
        <DemoBadge />
        <Text style={[styles.title, { color: c.foreground }]}>Собери свой{'\n'}<Text style={{ color: c.primary }}>танец</Text></Text>
        <Text style={[styles.sub, { color: c.mutedForeground }]}>{mode === 'photo'
          ? 'Выбери фото, танец и длительность — затем создай настоящее видео. Этот режим использует PixVerse, без переноса движений из исходного ролика.'
          : 'Видео + фото = черновик Genjutsu Light. Этот режим пока не подключён к генерации — сохраним настройки на устройстве.'}</Text>
        {!isSignedIn && (
          <Bouncy onPress={() => router.push('/sign-in')} style={{ paddingVertical: 8 }}>
            <Text style={{ color: c.primary, fontFamily: F.body, fontSize: 15 }}>Войти для создания видео →</Text>
          </Bouncy>
        )}
        {isSignedIn && (
          <Bouncy onPress={() => signOut()} style={{ paddingVertical: 8 }}>
            <Text style={{ color: c.primary, fontFamily: F.body, fontSize: 15 }}>Выйти из аккаунта</Text>
          </Bouncy>
        )}
      </View>

      {mode === 'photo' && (
        <>
          <Step n="1" title="Твоё фото" color={c.primary} />
          <View style={[styles.pad, { gap: 8 }]}>
            {photo && <Image source={{ uri: photo }} style={{ width: '100%', height: 260, borderRadius: 8 }} contentFit="contain" />}
            <View style={styles.pickRow}>
              <View style={{ flex: 1 }}>
              <Bouncy testID="pick-photo-library" onPress={() => pickPhoto(false)} style={[styles.pick, { flex: 0, backgroundColor: c.card, borderColor: c.border }]}>
                <Feather name="image" size={20} color={c.foreground} /><Text style={[styles.pickText, { color: c.foreground }]}>Галерея</Text>
              </Bouncy>
              </View>
              <View style={{ flex: 1 }}>
              <Bouncy testID="pick-photo-camera" onPress={() => pickPhoto(true)} style={[styles.pick, { flex: 0, backgroundColor: c.accent, borderColor: c.border }]}>
                <Feather name="camera" size={20} color={c.foreground} /><Text style={[styles.pickText, { color: c.foreground }]}>Камера</Text>
              </Bouncy>
              </View>
            </View>
            {photo && <Bouncy onPress={() => setPhoto(null)}><Text style={[styles.hint, { color: c.primary }]}>Убрать фото</Text></Bouncy>}
          </View>
        </>
      )}
      {mode === 'video' && <>
      <Step n="1" title="Что делаем" color={c.primary} />
      <View style={styles.pad}><ModelPicker value={model} onChange={setModel} /></View>

      <Step n="2" title="Исходное видео" color={c.secondary} />
      <View style={[styles.pad, { gap: 6 }]}>
        {source ? (
          <>
            <SourcePreview uri={source.uri} />
            <View style={styles.srcBar}>
              <Text style={[styles.srcMeta, { color: c.foreground }]}>
                {source.seconds == null ? 'Длительность неизвестна' : `${fmtSec(source.seconds)} · в работу ${fmtSec(Math.min(source.seconds, MAX_OUTPUT_SECONDS))}`}
              </Text>
              <Bouncy testID="replace-video" onPress={pickVideo} style={[styles.sq, { backgroundColor: c.card, borderColor: c.border }]}><Feather name="refresh-cw" size={16} color={c.foreground} /></Bouncy>
              <Bouncy testID="remove-video" onPress={() => setSource(null)} style={[styles.sq, { backgroundColor: c.card, borderColor: c.border }]}><Feather name="x" size={16} color={c.foreground} /></Bouncy>
            </View>
            {source.seconds == null && <Text style={[styles.warn, { color: c.destructive }]}>Галерея не сообщила длину ролика. Выбери другое видео, чтобы сохранить черновик.</Text>}
          </>
        ) : (
          <Bouncy testID="pick-video" onPress={pickVideo} style={[styles.pickWide, { backgroundColor: c.secondary, borderColor: c.border }]}>
            <Feather name="film" size={28} color={c.foreground} />
            <Text style={[styles.pickText, { color: c.foreground }]}>Выбрать видео</Text>
          </Bouncy>
        )}
        <Text style={[styles.hint, { color: c.mutedForeground }]}>
          {model === 'motion-transfer' ? 'Видео с танцем — его движения получит персонаж с фото.' : 'Видео, в котором нужно что-то заменить.'} Берутся первые {MAX_OUTPUT_SECONDS} сек, звук сохраняется.
        </Text>
      </View>

      <Step n="3" title={m.referenceLabel} color={c.accent} right={<RefCounter n={refs.length} />} />
      <View style={[styles.pad, { gap: 6 }]}>
        {refs.length > 0 && <RefGrid uris={refs} onRemove={(i) => setRefs((p) => p.filter((_, j) => j !== i))} />}
        <View style={styles.pickRow}>
          <Bouncy testID="pick-library" disabled={refs.length >= MAX_REFERENCE_IMAGES} onPress={pickImages} style={[styles.pick, { backgroundColor: c.card, borderColor: c.border }]}>
            <Feather name="image" size={20} color={c.foreground} />
            <Text style={[styles.pickText, { color: c.foreground }]}>Галерея</Text>
          </Bouncy>
          <Bouncy testID="pick-camera" disabled={refs.length >= MAX_REFERENCE_IMAGES} onPress={pickCamera} style={[styles.pick, { backgroundColor: c.accent, borderColor: c.border }]}>
            <Feather name="camera" size={20} color={c.foreground} />
            <Text style={[styles.pickText, { color: c.foreground }]}>Камера</Text>
          </Bouncy>
        </View>
        <Text style={[styles.hint, { color: c.mutedForeground }]}>
          {model === 'motion-transfer' ? 'Персонаж или сцена, которые будут танцевать. Лучше в полный рост.' : 'Новый персонаж, одежда или предмет для замены.'} До {MAX_REFERENCE_IMAGES} фото.
        </Text>
      </View>

      <Step n="4" title="Подсказка и качество" color={c.sun} />
      <View style={[styles.pad, { gap: 8 }]}>
        <TextInput
          testID="prompt-input" value={prompt} onChangeText={setPrompt} maxLength={MAX_PROMPT} multiline
          placeholder={model === 'motion-transfer' ? 'Необязательно: например, «танцует на крыше на закате»' : 'Необязательно: например, «заменить куртку на красную»'}
          placeholderTextColor={c.mutedForeground}
          style={[styles.input, { borderColor: c.border, backgroundColor: c.card, color: c.foreground }]}
        />
        <Text style={[styles.counter, { color: c.mutedForeground }]}>{prompt.length} / {MAX_PROMPT}</Text>
        <QualityPicker value={resolution} onChange={setResolution} />
        <CostPreview resolution={resolution} seconds={source?.seconds} />
      </View>
      </>}

      <Step n={mode === 'photo' ? '2' : '+'} title={mode === 'photo' ? 'Выбери танец' : 'Идея для вдохновения'} color={c.violet} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10, paddingBottom: 8 }}>
        {TEMPLATES.map((x) => {
          const on = x.id === t.id;
          return (
            <Bouncy key={x.id} onPress={() => setPicked(x.id)} style={[styles.tpl, { borderColor: c.border, backgroundColor: tone(c, x.color) }, on && { transform: [{ translateY: -6 }] }]}>
              <Image source={x.image} style={styles.tplImg} contentFit="cover" />
              <View style={[styles.tplLabel, { backgroundColor: on ? c.primary : c.card }]}>
                <Text numberOfLines={1} style={[styles.tplText, { color: on ? c.primaryForeground : c.foreground }]}>{x.title}</Text>
              </View>
              {on && <View style={[styles.check, { backgroundColor: c.accent, borderColor: c.border }]}><Feather name="check" size={14} color={c.foreground} /></View>}
            </Bouncy>
          );
        })}
      </ScrollView>
      <Text style={[styles.hint, styles.pad, { color: c.mutedForeground }]}>{mode === 'photo' ? 'Иллюстрация задаёт стиль, а не точную хореографию.' : 'Это иллюстрация-подсказка, а не видео. Движения берутся только из твоего ролика.'}</Text>

      <View style={{ paddingHorizontal: 20, marginTop: 22, gap: 8 }}>
        {error && (
          <View style={[styles.err, { borderColor: c.border, backgroundColor: c.destructive }]}>
            <Feather name="alert-triangle" size={16} color={c.destructiveForeground} />
            <Text style={[styles.errText, { color: c.destructiveForeground }]}>{error}</Text>
            <Bouncy onPress={() => setError(null)}><Feather name="x" size={16} color={c.destructiveForeground} /></Bouncy>
          </View>
        )}
        {mode === 'video' && <>
          <BigButton testID="save-draft" label={blocker ?? 'Сохранить черновик'} icon="bookmark" disabled={!!blocker} onPress={save} />
          <Text style={[styles.hint, { color: c.mutedForeground, textAlign: 'center' }]}>Черновик хранится только на этом устройстве. Генерация Genjutsu Light не запускается.</Text>
        </>}
      </View>
      {mode === 'photo' && <>
      <Step n="3" title="Длительность" color={c.sun} />
      <View style={[styles.durRow, { paddingHorizontal: 20 }]}>
        {[5, 10, 15].map((d) => {
          const ok = t.durations.includes(d);
          const on = dur === d;
          return (
            <View key={d} style={{ flex: 1 }}>
            <Bouncy disabled={!ok} onPress={() => setDuration(d)} style={[styles.dur, { flex: 0, borderColor: c.border, backgroundColor: on ? c.sun : c.card }]}>
              <Text style={[styles.durNum, { color: c.foreground }]}>{d}</Text>
              <Text style={[styles.durUnit, { color: c.foreground }]}>сек</Text>
            </Bouncy>
            </View>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: c.mutedForeground, paddingHorizontal: 20 }]}>Недоступные длительности не поддерживаются этим танцем.</Text>

      <View style={{ paddingHorizontal: 20, marginTop: 28, gap: 10 }}>
        <BigButton testID="generate-video" label={generating ? 'Отправляем фото…' : photo ? 'Создать танцевальное видео' : 'Сначала выбери фото'} icon={generating ? 'loader' : 'play'} disabled={!photo || generating} onPress={generate} />
        {generationError && <Text accessibilityRole="alert" style={[styles.hint, { color: c.primary, textAlign: 'center' }]}>{generationError}</Text>}
        <Text style={[styles.hint, { color: c.mutedForeground, textAlign: 'center' }]}>Фото будет отправлено в Higgsfield (PixVerse V6), генерация расходует баланс. Нужна действующая оплаченная подписка; лимиты и бюджет проверяет сервер. Черновик хранится на этом устройстве.</Text>
      </View>
      </>}
    </ScrollView>
  );
}

function Step({ n, title, color, right }: { n: string; title: string; color: string; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.step}>
      <View style={[styles.stepNum, { backgroundColor: color, borderColor: c.border }]}>
        <Text style={[styles.stepNumText, { color: c.foreground }]}>{n}</Text>
      </View>
      <Text style={[styles.stepTitle, { color: c.foreground }]} numberOfLines={1}>{title}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  durRow: { flexDirection: 'row', gap: 8 },
  dur: { flex: 1, borderWidth: 1, borderRadius: 8, alignItems: 'center', paddingVertical: 14 },
  durNum: { fontFamily: F.display, fontSize: 24 },
  durUnit: { fontFamily: F.bodyBold, fontSize: 12 },
  pad: { paddingHorizontal: 20 },
  title: { fontFamily: F.display, fontSize: 34, lineHeight: 38, letterSpacing: -1 },
  sub: { fontFamily: F.body, fontSize: 14, lineHeight: 20 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginTop: 22, marginBottom: 10 },
  stepNum: { width: 30, height: 30, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  stepNumText: { fontFamily: F.display, fontSize: 14 },
  stepTitle: { fontFamily: F.display, fontSize: 18, flex: 1 },
  pickRow: { flexDirection: 'row', gap: 6 },
  pick: { flex: 1, height: 56, minHeight: 56, borderRadius: 6, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pickWide: { height: 150, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  pickText: { fontFamily: F.display, fontSize: 15 },
  srcBar: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  srcMeta: { flex: 1, fontFamily: F.bodyHeavy, fontSize: 13 },
  sq: { width: 38, height: 38, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: F.body, fontSize: 12, lineHeight: 16 },
  warn: { fontFamily: F.bodyBold, fontSize: 12 },
  input: { minHeight: 84, maxHeight: 180, borderWidth: 1, borderRadius: 6, padding: 10, fontFamily: F.bodyBold, fontSize: 14, textAlignVertical: 'top' },
  counter: { fontFamily: F.bodyBold, fontSize: 11, textAlign: 'right', marginTop: -4 },
  tpl: { width: 120, height: 170, borderRadius: 6, borderWidth: 1, overflow: 'hidden', marginTop: 8 },
  tplImg: { flex: 1 },
  tplLabel: { paddingVertical: 7, paddingHorizontal: 8 },
  tplText: { fontFamily: F.bodyHeavy, fontSize: 12 },
  check: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  err: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 6, padding: 10 },
  errText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13 },
});
