import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigButton, Pill, SectionTitle, TemplateCard, EmptyState } from '@/components/ui';
import { F } from '@/constants/fonts';
import { CATEGORIES, Category, HERO_IMAGE, TEMPLATES } from '@/constants/templates';
import { useColors } from '@/hooks/useColors';

const SPEEDS = [
  { key: 'any', label: 'Любой темп' },
  { key: 'chill', label: 'До 110 BPM' },
  { key: 'hype', label: '110+ BPM' },
] as const;

export default function Discover() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [speed, setSpeed] = useState<'any' | 'chill' | 'hype'>('any');
  const top = Platform.OS === 'web' ? 67 : insets.top;

  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 520, easing: Easing.in(Easing.quad) })), -1);
  }, [bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-6 + bob.value * 6}deg` }, { scale: 1 + bob.value * 0.06 }] }));

  const list = useMemo(() => TEMPLATES.filter((t) =>
    (cat === 'all' || t.category === cat) &&
    (speed === 'any' || (speed === 'chill' ? t.bpm < 110 : t.bpm >= 110))), [cat, speed]);

  const cardW = (Math.min(width, 600) - 20 * 2 - 14) / 2;
  const featured = TEMPLATES.filter((t) => t.isNew);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { paddingTop: top + 12, backgroundColor: c.stage }]}>
        <Image source={HERO_IMAGE} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="right" />
        <LinearGradient colors={[c.stage, c.clear]} start={{ x: 0, y: 0 }} end={{ x: 0.85, y: 0 }} style={StyleSheet.absoluteFill} />
        <View style={styles.brandRow}>
          <Text style={[styles.brand, { color: c.stageForeground }]}>Dance<Text style={{ color: c.accent }}>flow</Text></Text>
        </View>
        <View style={{ maxWidth: 230, marginTop: 40 }}>
          <Text style={[styles.heroTitle, { color: c.stageForeground }]}>Твоё фото{'\n'}выходит{'\n'}<Text style={{ color: c.primary }}>на сцену</Text></Text>
          <Text style={[styles.heroSub, { color: c.stageForeground }]}>Выбери танец, загрузи снимок — и собери черновик своего клипа.</Text>
        </View>
        <Animated.View style={[{ alignSelf: 'flex-start', marginTop: 22 }, bobStyle]}>
          <BigButton testID="hero-create" label="Станцевать" icon="zap" color="accent" onPress={() => router.push('/create')} />
        </Animated.View>
      </View>

      <View style={[styles.marquee, { backgroundColor: c.primary, borderColor: c.border }]}>
        <Text style={[styles.marqueeText, { color: c.primaryForeground }]} numberOfLines={1}>K-POP  ·  СТРИТ  ·  ДИСКО  ·  ТРЕНДЫ  ·  K-POP  ·  СТРИТ  ·  ДИСКО</Text>
      </View>

      <SectionTitle kicker="СВЕЖЕЕ НА СЦЕНЕ" title="Новые хиты" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 8 }}>
        {featured.map((t) => (
          <TemplateCard key={t.id} t={t} width={Math.min(width * 0.72, 300)} height={340} onPress={() => router.push(`/template/${t.id}`)} />
        ))}
      </ScrollView>

      <View style={{ height: 28 }} />
      <SectionTitle kicker="ВЕСЬ КАТАЛОГ" title="Выбери свой стиль" right={<Text style={[styles.count, { color: c.mutedForeground }]}>{list.length}</Text>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 4 }}>
        {CATEGORIES.map((k) => <Pill key={k.key} label={k.label} active={cat === k.key} onPress={() => setCat(k.key)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 10 }}>
        {SPEEDS.map((k) => <Pill key={k.key} color="secondary" label={k.label} active={speed === k.key} onPress={() => setSpeed(k.key)} />)}
      </ScrollView>

      {list.length === 0 ? (
        <EmptyState icon="music" title="Тут пока тихо" text="Под такой фильтр танцев нет. Попробуй другой темп." action="Сбросить" onAction={() => { setCat('all'); setSpeed('any'); }} />
      ) : (
        <View style={styles.grid}>
          {list.map((t, i) => (
            <View key={t.id} style={{ marginTop: i % 2 === 1 ? 24 : 0 }}>
              <TemplateCard t={t} width={cardW} height={250} onPress={() => router.push(`/template/${t.id}`)} />
            </View>
          ))}
        </View>
      )}

      <View style={[styles.honest, { backgroundColor: c.secondary, borderColor: c.border }]}>
        <Feather name="info" size={18} color={c.foreground} />
        <Text style={[styles.honestText, { color: c.foreground }]}>Danceflow — дизайн-прототип. Видео не генерируются: ты собираешь черновик из фото, танца и длительности.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingBottom: 30, minHeight: 470, overflow: 'hidden' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brand: { fontFamily: F.display, fontSize: 22, letterSpacing: -0.5 },
  heroTitle: { fontFamily: F.display, fontSize: 38, lineHeight: 42, letterSpacing: -1 },
  heroSub: { fontFamily: F.bodyBold, fontSize: 15, lineHeight: 21, marginTop: 12, opacity: 0.92 },
  marquee: { borderTopWidth: 3, borderBottomWidth: 3, paddingVertical: 10, transform: [{ rotate: '-2deg' }], marginTop: -14, marginHorizontal: -10, marginBottom: 30 },
  marqueeText: { fontFamily: F.display, fontSize: 15, letterSpacing: 1 },
  count: { fontFamily: F.display, fontSize: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 14, marginTop: 6 },
  honest: { margin: 20, marginTop: 34, padding: 16, borderRadius: 20, borderWidth: 2, flexDirection: 'row', gap: 10 },
  honestText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13, lineHeight: 19 },
});
