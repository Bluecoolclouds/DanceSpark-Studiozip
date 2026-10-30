import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bouncy } from '@/components/ui';
import { F } from '@/constants/fonts';
import {
  GENERATION_MODELS, GENERATION_QUALITIES, GenerationModel, GenerationResolution,
  MAX_OUTPUT_SECONDS, MAX_REFERENCE_IMAGES, estimateGenerationCost,
} from '@/constants/generation';
import { useColors } from '@/hooks/useColors';

export const fmtSec = (s: number) => `${Number(s.toFixed(2)).toString().replace('.', ',')} сек`;
export const fmtUsd = (v: number) => `$${v.toFixed(2)}`;
export const getModel = (id?: GenerationModel) => GENERATION_MODELS.find((m) => m.id === id);

export function SourcePreview({ uri, height = 300 }: { uri: string; height?: number }) {
  const c = useColors();
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.muted = false; });
  return (
    <View style={[s.video, { height, borderColor: c.border, backgroundColor: c.stage }]}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />
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

export function QualityPicker({ value, onChange }: { value: GenerationResolution; onChange: (r: GenerationResolution) => void }) {
  const c = useColors();
  return (
    <View style={s.qRow}>
      {GENERATION_QUALITIES.map((q) => {
        const on = q === value;
        return (
          <Bouncy key={q} testID={`quality-${q}`} onPress={() => onChange(q)}
            style={[s.q, { borderColor: c.border, backgroundColor: on ? c.sun : c.card }]}>
            <Text style={[s.qText, { color: c.foreground }]}>{q}</Text>
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
          <Image source={{ uri: u }} style={StyleSheet.absoluteFill} contentFit="cover" />
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

export function CostPreview({ resolution, seconds }: { resolution: GenerationResolution; seconds?: number | null }) {
  const c = useColors();
  const e = estimateGenerationCost(resolution, seconds);
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
            вход {fmtSec(e.inputSeconds)} + результат {e.roundedOutputSeconds} сек = {fmtSec(e.billableSeconds)} × {fmtUsd(e.usdPerSecond)}/сек
          </Text>
          {e.inputSeconds > MAX_OUTPUT_SECONDS && (
            <Text style={[s.costNote, { color: c.mutedForeground }]}>
              Видео длиннее {MAX_OUTPUT_SECONDS} сек: модель возьмёт первые {MAX_OUTPUT_SECONDS} сек. Вход посчитан по всей длине — фактическую длительность входа определит провайдер.
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
  video: { width: '100%', borderRadius: 6, borderWidth: 2, overflow: 'hidden' },
  model: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 6, borderWidth: 2 },
  radio: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  modelTitle: { fontFamily: F.display, fontSize: 15 },
  modelSub: { fontFamily: F.bodyBold, fontSize: 12, lineHeight: 16 },
  qRow: { flexDirection: 'row', gap: 6 },
  q: { flex: 1, borderRadius: 6, borderWidth: 2, paddingVertical: 10, alignItems: 'center' },
  qText: { fontFamily: F.display, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ref: { width: 74, height: 96, borderRadius: 4, borderWidth: 2, overflow: 'hidden' },
  refN: { position: 'absolute', left: 4, bottom: 4, borderWidth: 1.5, borderRadius: 3, paddingHorizontal: 4 },
  refNText: { fontFamily: F.bodyHeavy, fontSize: 10 },
  refX: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  counter: { fontFamily: F.bodyHeavy, fontSize: 12 },
  cost: { borderWidth: 2, borderRadius: 6, padding: 10, gap: 5 },
  costHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  costK: { fontFamily: F.bodyHeavy, fontSize: 12 },
  costV: { fontFamily: F.bodyHeavy, fontSize: 14 },
  costLine: { fontFamily: F.bodyBold, fontSize: 13 },
  costNote: { fontFamily: F.body, fontSize: 11, lineHeight: 15 },
});
