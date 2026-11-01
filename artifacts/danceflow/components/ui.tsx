import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { VideoPlayer } from 'expo-video';
import React, { useState } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { ColorKey, DanceTemplate, categoryLabel } from '@/constants/templates';
import { F } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useDance } from '@/context/DanceContext';
import colors from '@/constants/colors';
import { CardVideoPreview } from './card-video-preview';

/** Text colour that stays readable on a given fill token. */
export const onTone = (c: { foreground: string; primaryForeground: string }, k: ColorKey) =>
  k === 'primary' || k === 'violet' ? c.primaryForeground : c.foreground;

/** Sentence-case a legacy all-caps label (no tracked capitals, Hallmark 54/67). */
export const sentence = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);

const focusRing = Platform.OS === 'web' ? ({ outlineColor: colors.light.focus, outlineStyle: 'solid', outlineWidth: 3, outlineOffset: 2 } as unknown as ViewStyle) : null;
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type Palette = ReturnType<typeof useColors>;

export const tap = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (Platform.OS === 'web') return;
  const map = { light: Haptics.ImpactFeedbackStyle.Light, medium: Haptics.ImpactFeedbackStyle.Medium, heavy: Haptics.ImpactFeedbackStyle.Heavy };
  Haptics.impactAsync(map[style]).catch(() => {});
};

export function Bouncy({
  children, onPress, style, disabled, haptic = 'light', testID, accessibilityLabel, scaleTo = 0.94,
}: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean;
  haptic?: 'light' | 'medium' | 'heavy'; testID?: string; accessibilityLabel?: string; scaleTo?: number;
}) {
  const s = useSharedValue(1);
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const r = useSharedValue(0);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { rotate: `${r.value}deg` }] }));
  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      style={[style, a, focused && focusRing, disabled && { opacity: 0.45 }]}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => { if (reduced) return; s.value = withSpring(scaleTo, { damping: 12, stiffness: 400 }); r.value = withSpring(-1.5); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 6, stiffness: 260 }); r.value = withSpring(0, { damping: 5 }); }}
      onPress={() => { tap(haptic); onPress?.(); }}
    >
      {children}
    </AnimatedPressable>
  );
}

export const tone = (c: Palette, k: ColorKey) => c[k];

export function Pill({ label, active, onPress, color = 'primary' }: { label: string; active: boolean; onPress: () => void; color?: ColorKey }) {
  const c = useColors();
  return (
    <Bouncy onPress={onPress} style={[s.pill, { borderColor: active ? 'transparent' : c.border, backgroundColor: active ? tone(c, color) : c.glassFallback, shadowColor: tone(c, color), shadowOpacity: active ? 0.45 : 0 }]}>
      <Text style={[s.pillText, { color: active ? onTone(c, color) : c.foreground }]}>{label}</Text>
    </Bouncy>
  );
}

export function DemoBadge({ label = 'ПРОТОТИП · ДЕМО' }: { label?: string }) {
  const c = useColors();
  return (
    <View style={[s.demo, { backgroundColor: c.secondary, borderColor: 'transparent' }]}>
      <Feather name="info" size={12} color={c.foreground} />
      <Text style={[s.demoText, { color: c.foreground }]}>{sentence(label)}</Text>
    </View>
  );
}

export function EnergyBars({ level, color }: { level: number; color: string }) {
  const c = useColors();
  return (
    <View style={s.bars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={{ width: 5, height: 5 + i * 3, borderRadius: 2, backgroundColor: i <= level ? color : c.muted }} />
      ))}
    </View>
  );
}

export function FavButton({ id, size = 40 }: { id: string; size?: number }) {
  const c = useColors();
  const { isFavorite, toggleFavorite } = useDance();
  const on = isFavorite(id);
  return (
    <Bouncy testID={`fav-${id}`} haptic="medium" scaleTo={0.8} onPress={() => toggleFavorite(id)}
      style={[s.fav, { width: size, height: size, borderRadius: size / 2, backgroundColor: on ? c.primary : c.glass, borderColor: on ? 'transparent' : c.glassEdge }]}>
      <Feather name="heart" size={size * 0.45} color={on ? c.primaryForeground : c.foreground} />
    </Bouncy>
  );
}

export function TemplateCard({ t, onPress, width, height = 280, previewPlayer, previewReady = true }: { t: DanceTemplate; onPress: () => void; width?: number; height?: number; previewPlayer?: VideoPlayer; previewReady?: boolean }) {
  const c = useColors();
  const col = tone(c, t.color);
  return (
    <View style={[s.card, { width, height, borderColor: c.glassEdge, backgroundColor: col, shadowColor: c.glow }]}>
      <Bouncy onPress={onPress} scaleTo={0.97} style={StyleSheet.absoluteFill}>
        <Image source={t.image} style={StyleSheet.absoluteFill} contentFit="cover" />
        {previewPlayer && t.videoUri && <CardVideoPreview key={t.videoUri} uri={t.videoUri} player={previewPlayer} ready={previewReady} />}
        <LinearGradient colors={[c.clear, c.scrim]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.5 }} end={{ x: 0, y: 1 }} />
      </Bouncy>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={s.cardTop}>
          {!t.videoUri && !t.badge && <View style={[s.tag, { backgroundColor: col, borderColor: 'transparent' }]}>
            <Text style={[s.tagText, { color: onTone(c, t.color) }]}>{categoryLabel(t.category)}</Text>
          </View>}
          <FavButton id={t.id} size={36} />
        </View>
        <View pointerEvents="none" style={s.cardBottom}>
          {t.badge && <View style={[s.newChip, { backgroundColor: c.accent }]}><Text style={[s.newText, { color: c.foreground }]}>{t.badge === 'new' ? 'Новинка' : 'Тренд'}</Text></View>}
          <Text style={[s.cardTitle, { color: c.stageForeground }]} numberOfLines={1}>{t.title}</Text>
          <View style={s.row}>
            {t.videoUri
              ? <Feather name="play-circle" size={22} color={c.stageForeground} />
              : <><Text style={[s.meta, { color: c.stageForeground }]}>{t.bpm} BPM · {t.dancer}</Text>{t.energy != null && <EnergyBars level={t.energy} color={col} />}</>}
          </View>
        </View>
      </View>
    </View>
  );
}

export function SectionTitle({ kicker, title, right }: { kicker?: string; title: string; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={s.sectionRow}>
      <View style={{ flex: 1 }}>
        {kicker && <Text style={[s.kicker, { color: c.primary }]}>{sentence(kicker)}</Text>}
        <Text style={[s.section, { color: c.foreground }]}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function EmptyState({ icon, title, text, action, onAction }: { icon: keyof typeof Feather.glyphMap; title: string; text: string; action?: string; onAction?: () => void }) {
  const c = useColors();
  return (
    <View style={[s.empty, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={[s.emptyIcon, { backgroundColor: c.secondary, borderColor: 'transparent' }]}>
        <Feather name={icon} size={26} color={c.foreground} />
      </View>
      <Text style={[s.emptyTitle, { color: c.foreground }]}>{title}</Text>
      <Text style={[s.emptyText, { color: c.mutedForeground }]}>{text}</Text>
      {action && <BigButton label={action} onPress={onAction} icon="arrow-right" small />}
    </View>
  );
}

export function BigButton({ label, onPress, icon, color = 'primary', disabled, small, testID }: {
  label: string; onPress?: () => void; icon?: keyof typeof Feather.glyphMap; color?: ColorKey; disabled?: boolean; small?: boolean; testID?: string;
}) {
  const c = useColors();
  const bg = tone(c, color);
  const fg = onTone(c, color);
  return (
    <Bouncy testID={testID} disabled={disabled} haptic="medium" onPress={onPress}
      style={[s.big, small && s.bigSmall, { backgroundColor: bg, borderColor: c.glassEdge, shadowColor: bg }]}>
      <Text style={[s.bigText, small && { fontSize: 13 }, { color: fg }]}>{label}</Text>
      {icon && <Feather name={icon} size={small ? 16 : 20} color={fg} />}
    </Bouncy>
  );
}

const s = StyleSheet.create({
  pill: { paddingHorizontal: 18, paddingVertical: 11, minHeight: 44, justifyContent: 'center', borderRadius: 999, borderWidth: 1, shadowOffset: { width: 0, height: 6 }, shadowRadius: 12, elevation: 0 },
  pillText: { fontFamily: F.bodyHeavy, fontSize: 14 },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  demoText: { fontFamily: F.bodyHeavy, fontSize: 11 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  fav: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  card: { borderRadius: 8, borderWidth: 1, overflow: 'hidden', shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 3 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontFamily: F.bodyHeavy, fontSize: 11 },
  cardBottom: { position: 'absolute', left: 14, right: 14, bottom: 14, gap: 4 },
  newChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 2 },
  newText: { fontFamily: F.bodyHeavy, fontSize: 11 },
  cardTitle: { fontFamily: F.display, fontSize: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  meta: { fontFamily: F.bodyBold, fontSize: 13, opacity: 0.9 },
  sectionRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, marginBottom: 14 },
  kicker: { fontFamily: F.bodyHeavy, fontSize: 12, marginBottom: 2 },
  section: { fontFamily: F.display, fontSize: 22 },
  empty: { margin: 20, padding: 26, borderRadius: 26, borderWidth: 1, alignItems: 'center', gap: 10, borderStyle: 'solid' },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, transform: [{ rotate: '-8deg' }] },
  emptyTitle: { fontFamily: F.displayBold, fontSize: 17, textAlign: 'center' },
  emptyText: { fontFamily: F.body, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
  big: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1, shadowOffset: { width: 3, height: 4 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 3 },
  bigSmall: { paddingVertical: 11, paddingHorizontal: 18 },
  bigText: { fontFamily: F.display, fontSize: 16 },
});
