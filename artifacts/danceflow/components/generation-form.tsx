import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bouncy } from '@/components/ui';
import { F } from '@/constants/fonts';
import {
  GENERATION_MODELS, GENERATION_QUALITIES, GenerationModel, GenerationResolution,
  MAX_REFERENCE_IMAGES, estimateGenerationCost, GenerationFamily, outputLimit, getGenerationModel,
} from '@/constants/generation';
import { useColors } from '@/hooks/useColors';
import { templatePreviewCandidates } from '@/lib/template-preview';
import { resolveDraftVideo } from '@/lib/draft-media';
import { DraftImage } from '@/components/draft-image';

export const fmtSec = (s: number) => `${Number(s.toFixed(2)).toString().replace('.', ',')} сек`;
export const fmtUsd = (v: number, digits = 2) => `$${v.toFixed(digits)}`;
export const getModel = getGenerationModel;

type PreviewPoster = number | { uri: string };

export function SourcePreview({ uri, height = 300, poster }: { uri: string; height?: number; poster?: PreviewPoster }) {
  return <StoredPreview key={uri} uri={uri} height={height} poster={poster} />;
}

function StoredPreview({ uri, height, poster }: { uri: string; height: number; poster?: PreviewPoster }) {
  const c = useColors();
  const [source, setSource] = useState<string | null>(uri.startsWith('danceflow-media:') ? null : uri);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let dispose = () => {};
    void resolveDraftVideo(uri).then(result => {
      if (!active) { result.dispose(); return; }
      dispose = result.dispose;
      setSource(result.uri);
    }).catch(() => { if (active) setError('Не удалось открыть сохранённое видео. Возможно, хранилище браузера было очищено.'); });
    return () => { active = false; dispose(); };
  }, [uri]);
  return source ? <PreviewSession uri={source} height={height} poster={poster} /> :
    <Text style={{ color: c.mutedForeground }}>{error ?? 'Загружаем сохранённое видео…'}</Text>;
}

function PreviewSession({ uri, height, poster }: { uri: string; height: number; poster?: PreviewPoster }) {
  const candidates = useMemo(() => templatePreviewCandidates(uri), [uri]);
  const [attempt, setAttempt] = useState(0);
  const [retry, setRetry] = useState(0);
  return <PreviewPlayer key={`${attempt}:${retry}`} playbackUri={candidates[attempt]} height={height} poster={poster}
    onFallback={attempt + 1 < candidates.length ? () => setAttempt(attempt + 1) : undefined}
    onRetry={() => { setAttempt(0); setRetry((n) => n + 1); }} />;
}

function PreviewPlayer({ playbackUri, height, poster, onFallback, onRetry }: {
  playbackUri: string; height: number; poster?: PreviewPoster; onFallback?: () => void; onRetry: () => void;
}) {
  const c = useColors();
  const player = useVideoPlayer(playbackUri, (p) => { p.loop = false; p.muted = false; });
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const handleStatus = (status: string) => {
      if (status === 'error' && onFallback) { onFallback(); return; }
      setFailed(status === 'error');
    };
    handleStatus(player.status);
    setPlaying(player.playing);
    const subscription = player.addListener('statusChange', ({ status }) => handleStatus(status));
    const playingSubscription = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying));
    return () => { subscription.remove(); playingSubscription.remove(); };
  }, [player, onFallback]);
  return (
    <View style={[s.video, { height, borderColor: c.border, backgroundColor: c.stage }]}>
      <VideoView player={player} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} contentFit="contain" nativeControls />
      {poster && !playing && !failed && <ExpoImage source={poster} style={StyleSheet.absoluteFill} contentFit="contain" pointerEvents="none" />}
      {!failed && <Bouncy testID="template-video-toggle" onPress={() => playing ? player.pause() : player.play()}
        style={{ position: 'absolute', top: 12, right: 12, minHeight: 44, backgroundColor: c.card, borderRadius: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name={playing ? 'pause' : 'play'} size={18} color={c.foreground} />
        <Text style={{ color: c.foreground, fontFamily: F.bodyBold }}>{playing ? 'Пауза' : 'Смотреть'}</Text>
      </Bouncy>}
      {failed && <View style={[StyleSheet.absoluteFill, { backgroundColor: c.stage, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 12 }]}>
        <Text style={{ color: c.stageForeground, fontFamily: F.bodyBold, textAlign: 'center' }}>Не удалось воспроизвести видео. Файл недоступен или его формат не поддерживается этим устройством.</Text>
        <Bouncy onPress={onRetry} style={{ backgroundColor: c.accent, padding: 12, borderRadius: 12 }}>
          <Text style={{ color: c.foreground, fontFamily: F.bodyBold }}>Повторить</Text>
        </Bouncy>
      </View>}
    </View>
  );
}

export function ModelPicker({ value, onChange }: { value: GenerationModel; onChange: (m: GenerationModel) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {GENERATION_MODELS.map((m, i) => {
        const on = m.id === value;
        return (
          <Bouncy key={m.id} testID={`model-${m.id}`} onPress={() => onChange(m.id)} scaleTo={0.98}
            style={[s.model, { borderColor: c.border, backgroundColor: on ? (i === 0 ? c.secondary : c.accent) : c.card }]}>
            <View style={[s.radio, { borderColor: c.border, backgroundColor: on ? c.border : c.card }]}>
              {on && <Feather name="check" size={12} color={c.card} />}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.modelTitle, { color: c.foreground }]}>{m.title}</Text>
              <Text style={[s.modelSub, { color: c.foreground }]}>{m.subtitle}</Text>
            </View>
          </Bouncy>
        );
      })}
    </View>
  );
}

export function QualityPicker({ value, onChange, variant = 'cards' }: { value: GenerationResolution; onChange: (r: GenerationResolution) => void; variant?: 'cards' | 'segmented' }) {
  const c = useColors();
  const segmented = variant === 'segmented';
  return (
    <View style={[s.qRow, segmented && { backgroundColor: c.muted, borderRadius: 15, padding: 4, gap: 4 }]}>
      {GENERATION_QUALITIES.map((q) => {
        const on = q === value;
        return (
          <Bouncy key={q} testID={`quality-${q}`} onPress={() => onChange(q)} accessibilityLabel={`Качество ${q}${on ? ', выбрано' : ''}`}
            style={[s.q, segmented && { borderRadius: 11, borderWidth: 0 }, { borderColor: c.border, backgroundColor: on ? c.sun : segmented ? 'transparent' : c.card }]}>
            <Text style={[s.qText, segmented && { fontFamily: F.bodyHeavy, fontSize: 14 }, { color: c.foreground }]}>{q}</Text>
          </Bouncy>
        );
      })}
    </View>
  );
}

export function RefGrid({ uris, onRemove }: { uris: string[]; onRemove?: (i: number) => void }) {
  const c = useColors();
  return (
    <View style={s.grid}>
      {uris.map((u, i) => (
        <View key={`${u}-${i}`} style={[s.ref, { borderColor: c.border, backgroundColor: c.muted }]}>
          <DraftImage uri={u} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[s.refN, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[s.refNText, { color: c.foreground }]}>{i + 1}</Text>
          </View>
          {onRemove && (
            <Bouncy testID={`ref-remove-${i}`} onPress={() => onRemove(i)} style={[s.refX, { backgroundColor: c.card, borderColor: c.border }]}>
              <Feather name="x" size={13} color={c.foreground} />
            </Bouncy>
          )}
        </View>
      ))}
    </View>
  );
}

export function RefCounter({ n }: { n: number }) {
  const c = useColors();
  return <Text style={[s.counter, { color: n >= MAX_REFERENCE_IMAGES ? c.primary : c.mutedForeground }]}>{n} / {MAX_REFERENCE_IMAGES}</Text>;
}

export function CostPreview({ resolution, seconds, family = 'light' }: { resolution: GenerationResolution; seconds?: number | null; family?: GenerationFamily }) {
  const c = useColors();
  const e = estimateGenerationCost(resolution, seconds, family);
  const limit = outputLimit(family);
  const [open, setOpen] = useState<boolean>(false);
  return (
    <View style={[s.cost, { borderColor: c.border, backgroundColor: c.card }]}>
      <Bouncy testID="cost-toggle" scaleTo={0.98} onPress={() => setOpen((v) => !v)} style={s.costHead}>
        <View style={{ flex: 1 }}>
          <Text style={[s.costK, { color: c.mutedForeground }]}>Оценка себестоимости Higgsfield</Text>
          <Text style={[s.costNote, { color: c.mutedForeground }]}>Не списание с подписки</Text>
        </View>
        <Text style={[s.costV, { color: c.mutedForeground }]}>{e ? `≈ ${fmtUsd(e.estimatedUsd)}` : '—'}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.mutedForeground} />
      </Bouncy>
      {open && (e ? (
        <>
          <Text style={[s.costLine, { color: c.foreground }]}>
            {family === 'light'
              ? `вход ${fmtSec(e.inputSeconds)} + результат ${e.roundedOutputSeconds} сек`
              : `вход ${fmtSec(e.inputSeconds)}, округление вверх`} = {fmtSec(e.billableSeconds)} × {fmtUsd(e.usdPerSecond, family === 'standard' ? 3 : 2)}/сек
          </Text>
          {e.inputSeconds > limit && (
            <Text style={[s.costNote, { color: c.mutedForeground }]}>
              Видео длиннее {limit} сек: модель возьмёт первые {limit} сек. Вход посчитан по всей длине — фактическую длительность входа определит провайдер.
            </Text>
          )}
        </>
      ) : (
        <Text style={[s.costLine, { color: c.foreground }]}>Стоимость уточнится после обработки.</Text>
      ))}
      {open && <Text style={[s.costNote, { color: c.mutedForeground }]}>Примерные затраты сервиса у поставщика в USD, базовый тариф до скидок и предобработки. Это не цена для тебя, не доплата к подписке и не баланс. Сохранение черновика ничего не запускает и не оплачивает.</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  video: { width: '100%', borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  model: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 6, borderWidth: 1 },
  radio: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modelTitle: { fontFamily: F.display, fontSize: 15 },
  modelSub: { fontFamily: F.bodyBold, fontSize: 12, lineHeight: 16 },
  qRow: { flexDirection: 'row', gap: 6 },
  q: { flex: 1, minHeight: 44, borderRadius: 6, borderWidth: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  qText: { fontFamily: F.display, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ref: { width: 74, height: 96, borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  refN: { position: 'absolute', left: 4, bottom: 4, borderWidth: 1.5, borderRadius: 3, paddingHorizontal: 4 },
  refNText: { fontFamily: F.bodyHeavy, fontSize: 10 },
  refX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  counter: { fontFamily: F.bodyHeavy, fontSize: 12 },
  cost: { borderWidth: 1, borderRadius: 6, padding: 10, gap: 5 },
  costHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  costK: { fontFamily: F.bodyHeavy, fontSize: 12 },
  costV: { fontFamily: F.bodyHeavy, fontSize: 14 },
  costLine: { fontFamily: F.bodyBold, fontSize: 13 },
  costNote: { fontFamily: F.body, fontSize: 11, lineHeight: 15 },
});
