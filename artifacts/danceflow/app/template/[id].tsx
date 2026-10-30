import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigButton, Bouncy, EmptyState, EnergyBars, FavButton, tone } from '@/components/ui';
import { F } from '@/constants/fonts';
import { categoryLabel, getTemplate } from '@/constants/templates';
import { useColors } from '@/hooks/useColors';

export default function TemplateDetail() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = getTemplate(id);
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom;

  if (!t) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: top + 40 }}>
        <EmptyState icon="alert-circle" title="Танец не найден" text="Возможно, он ушёл со сцены." action="Назад" onAction={() => router.back()} />
      </View>
    );
  }
  const col = tone(c, t.color);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 + bottom }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: col }]}>
          <Image source={t.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={[c.clear, c.scrim]} start={{ x: 0, y: 0.5 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={[styles.topBar, { top: top + 6 }]}>
            <Bouncy onPress={() => router.back()} style={[styles.round, { backgroundColor: c.card, borderColor: c.border }]}>
              <Feather name="arrow-left" size={20} color={c.foreground} />
            </Bouncy>
            <FavButton id={t.id} size={44} />
          </View>
          <View style={styles.heroText}>
            <View style={[styles.tag, { backgroundColor: col, borderColor: c.border }]}>
              <Text style={[styles.tagText, { color: c.foreground }]}>{categoryLabel(t.category).toUpperCase()}</Text>
            </View>
            <Text style={[styles.title, { color: c.stageForeground }]}>{t.title}</Text>
            <Text style={[styles.tagline, { color: c.stageForeground }]}>{t.tagline}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <Stat label="Темп" value={`${t.bpm}`} unit="BPM" bg={c.secondary} />
          <View style={[styles.stat, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.statLabel, { color: c.mutedForeground }]}>Энергия</Text>
            <View style={{ marginTop: 8 }}><EnergyBars level={t.energy} color={c.primary} /></View>
          </View>
          <Stat label="Танцор" value={t.dancer} bg={c.accent} />
        </View>

        <View style={styles.block}>
          <Text style={[styles.h, { color: c.foreground }]}>О танце</Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>{t.description}</Text>
        </View>

        <View style={styles.block}>
          <Text style={[styles.h, { color: c.foreground }]}>Движения</Text>
          {t.moves.map((m, i) => (
            <View key={m} style={[styles.move, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={[styles.moveN, { backgroundColor: i % 2 ? c.violet : c.primary }]}>
                <Text style={[styles.moveNText, { color: c.primaryForeground }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.moveText, { color: c.foreground }]}>{m}</Text>
            </View>
          ))}
        </View>

        <View style={styles.block}>
          <Text style={[styles.h, { color: c.foreground }]}>Длительность</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {t.durations.map((d) => (
              <View key={d} style={[styles.durChip, { borderColor: c.border, backgroundColor: c.sun }]}>
                <Text style={[styles.durText, { color: c.foreground }]}>{d} сек</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={[styles.cta, { paddingBottom: bottom + 14, backgroundColor: c.background, borderColor: c.border }]}>
        <BigButton testID="use-template" label="Станцевать с моим фото" icon="arrow-right" onPress={() => router.push({ pathname: '/create', params: { template: t.id } })} />
      </View>
    </View>
  );
}

function Stat({ label, value, unit, bg }: { label: string; value: string; unit?: string; bg: string }) {
  const c = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: bg, borderColor: c.border }]}>
      <Text style={[styles.statLabel, { color: c.foreground }]}>{label}</Text>
      <Text style={[styles.statValue, { color: c.foreground }]} numberOfLines={1}>{value}{unit ? <Text style={styles.statLabel}> {unit}</Text> : null}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 520, overflow: 'hidden', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  heroText: { position: 'absolute', left: 20, right: 20, bottom: 26, gap: 8 },
  tag: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontFamily: F.bodyHeavy, fontSize: 11, letterSpacing: 1 },
  title: { fontFamily: F.display, fontSize: 36, letterSpacing: -1 },
  tagline: { fontFamily: F.bodyBold, fontSize: 15 },
  statsRow: { flexDirection: 'row', gap: 5, paddingHorizontal: 12, marginTop: 12 },
  stat: { flex: 1, borderWidth: 2, borderRadius: 8, padding: 12 },
  statLabel: { fontFamily: F.bodyBold, fontSize: 11 },
  statValue: { fontFamily: F.display, fontSize: 18, marginTop: 4 },
  block: { paddingHorizontal: 20, marginTop: 26, gap: 10 },
  h: { fontFamily: F.display, fontSize: 19 },
  body: { fontFamily: F.body, fontSize: 15, lineHeight: 22 },
  move: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderRadius: 18, padding: 10 },
  moveN: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  moveNText: { fontFamily: F.display, fontSize: 13 },
  moveText: { fontFamily: F.bodyBold, fontSize: 15, flex: 1 },
  durChip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  durText: { fontFamily: F.bodyHeavy, fontSize: 13 },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 14, borderTopWidth: 2 },
});
