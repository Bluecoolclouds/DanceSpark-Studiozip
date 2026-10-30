import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ColorKey, DanceTemplate, categoryLabel } from '@/constants/templates';
import { F } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { useDance } from '@/context/DanceContext';

export type Palette = ReturnType<typeof useColors>;

export const tap = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (Platform.OS === 'web') return;
  const map = { light: Haptics.ImpactFeedbackStyle.Light, medium: Haptics.ImpactFeedbackStyle.Medium, heavy: Haptics.ImpactFeedbackStyle.Heavy };
  Haptics.impactAsync(map[style]).catch(() => {});
};

export function Bouncy({
  children, onPress, style, disabled, haptic = 'light', testID, scaleTo = 0.94,
}: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean;
  haptic?: 'light' | 'medium' | 'heavy'; testID?: string; scaleTo?: number;
}) {
  const s = useSharedValue(1);
  const r = useSharedValue(0);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { rotate: `${r.value}deg` }] }));
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPressIn={() => { s.value = withSpring(scaleTo, { damping: 12, stiffness: 400 }); r.value = withSpring(-1.5); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 6, stiffness: 260 }); r.value = withSpring(0, { damping: 5 }); }}
      onPress={() => { tap(haptic); onPress?.(); }}
    >
      <Animated.View style={[style, a, disabled && { opacity: 0.45 }]}>{children}</Animated.View>
    </Pressable>
  );
}

export const tone = (c: Palette, k: ColorKey) => c[k];

export function Pill({ label, active, onPress, color = 'primary' }: { label: string; active: boolean; onPress: () => void; color?: ColorKey }) {
  const c = useColors();
  return (
    <Bouncy onPress={onPress} style={[s.pill, { borderColor: c.border, backgroundColor: active ? tone(c, color) : c.card }, active && { transform: [{ rotate: '-2deg' }] }]}>
      <Text style={[s.pillText, { color: c.foreground }]}>{label}</Text>
    </Bouncy>
  );
}

export function DemoBadge({ label = 'ПРОТОТИП · ДЕМО' }: { label?: string }) {
  const c = useColors();
  return (
    <View style={[s.demo, { backgroundColor: c.sun, borderColor: c.border }]}>
      <Feather name="info" size={12} color={c.foreground} />
      <Text style={[s.demoText, { color: c.foreground }]}>{label}</Text>
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
      style={[s.fav, { width: size, height: size, borderRadius: size / 2, backgroundColor: on ? c.primary : c.card, borderColor: c.border }]}>
      <Feather name="heart" size={size * 0.45} color={on ? c.primaryForeground : c.foreground} />
    </Bouncy>
  );
}

export function TemplateCard({ t, onPress, width, height = 280 }: { t: DanceTemplate; onPress: () => void; width?: number; height?: number }) {
  const c = useColors();
  const col = tone(c, t.color);
  return (
    <Bouncy onPress={onPress} scaleTo={0.97} style={[s.card, { width, height, borderColor: c.border, backgroundColor: col, shadowColor: c.border }]}>
      <Image source={t.image} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={[c.clear, c.scrim]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.45 }} end={{ x: 0, y: 1 }} />
      <View style={s.cardTop}>
        <View style={[s.tag, { backgroundColor: col, borderColor: c.border }]}>
          <Text style={[s.tagText, { color: c.foreground }]}>{categoryLabel(t.category).toUpperCase()}</Text>
        </View>
        <FavButton id={t.id} size={36} />
      </View>
      <View style={s.cardBottom}>
        {t.isNew && <Text style={[s.newText, { color: c.accent }]}>НОВИНКА</Text>}
        <Text style={[s.cardTitle, { color: c.stageForeground }]} numberOfLines={1}>{t.title}</Text>
        <View style={s.row}>
          <Text style={[s.meta, { color: c.stageForeground }]}>{t.bpm} BPM · {t.dancer}</Text>
          <EnergyBars level={t.energy} color={col} />
        </View>
      </View>
    </Bouncy>
  );
}

export function SectionTitle({ kicker, title, right }: { kicker?: string; title: string; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={s.sectionRow}>
      <View style={{ flex: 1 }}>
        {kicker && <Text style={[s.kicker, { color: c.primary }]}>{kicker}</Text>}
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
      <View style={[s.emptyIcon, { backgroundColor: c.secondary, borderColor: c.border }]}>
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
  const fg = color === 'primary' || color === 'violet' ? c.primaryForeground : c.foreground;
  return (
    <Bouncy testID={testID} disabled={disabled} haptic="medium" onPress={onPress}
      style={[s.big, small && s.bigSmall, { backgroundColor: bg, borderColor: c.border, shadowColor: c.border }]}>
      <Text style={[s.bigText, small && { fontSize: 13 }, { color: fg }]}>{label}</Text>
      {icon && <Feather name={icon} size={small ? 16 : 20} color={fg} />}
    </Bouncy>
  );
}

const s = StyleSheet.create({
  pill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, borderWidth: 2 },
  pillText: { fontFamily: F.bodyHeavy, fontSize: 14 },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 2 },
  demoText: { fontFamily: F.bodyHeavy, fontSize: 11, letterSpacing: 1 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  fav: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  card: { borderRadius: 8, borderWidth: 2, overflow: 'hidden', shadowOffset: { width: 2, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  tag: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontFamily: F.bodyHeavy, fontSize: 11, letterSpacing: 1 },
  cardBottom: { position: 'absolute', left: 14, right: 14, bottom: 14, gap: 4 },
  newText: { fontFamily: F.bodyHeavy, fontSize: 11, letterSpacing: 2 },
  cardTitle: { fontFamily: F.display, fontSize: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  meta: { fontFamily: F.bodyBold, fontSize: 13, opacity: 0.9 },
  sectionRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, marginBottom: 14 },
  kicker: { fontFamily: F.bodyHeavy, fontSize: 12, letterSpacing: 2, marginBottom: 2 },
  section: { fontFamily: F.display, fontSize: 22 },
  empty: { margin: 20, padding: 26, borderRadius: 26, borderWidth: 3, alignItems: 'center', gap: 10, borderStyle: 'dashed' },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 2, transform: [{ rotate: '-8deg' }] },
  emptyTitle: { fontFamily: F.displayBold, fontSize: 17, textAlign: 'center' },
  emptyText: { fontFamily: F.body, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 6 },
  big: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, paddingHorizontal: 24, borderRadius: 999, borderWidth: 3, shadowOffset: { width: 3, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  bigSmall: { paddingVertical: 11, paddingHorizontal: 18 },
  bigText: { fontFamily: F.display, fontSize: 16 },
});
