import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer } from 'expo-video';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useReducedMotion, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigButton, Bouncy, Pill, SectionTitle, TemplateCard, EmptyState } from '@/components/ui';
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
  const { height: viewportHeight } = useWindowDimensions();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [speed, setSpeed] = useState<'any' | 'chill' | 'hype'>('any');
  const top = Platform.OS === 'web' ? 67 : insets.top;

  const bob = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 520, easing: Easing.in(Easing.quad) })), -1);
  }, [bob, reduced]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-6 + bob.value * 6}deg` }, { scale: 1 + bob.value * 0.06 }] }));

  const list = useMemo(() => TEMPLATES.filter((t) =>
    (cat === 'all' || t.category === cat) &&
    (speed === 'any' || (t.bpm != null && (speed === 'chill' ? t.bpm < 110 : t.bpm >= 110)))), [cat, speed]);

  const cardW = (Math.min(width, 600) - 12 * 2 - 2) / 2;
  const featured = TEMPLATES.filter((t) => t.isNew);
  const featuredCardWidth = Math.min(width * 0.72, 300);
  const [activeFeaturedIndex, setActiveFeaturedIndex] = useState(0);
  const [featuredInView, setFeaturedInView] = useState(false);
  const featuredFrame = useRef({ y: 0, height: 0 });
  const pageScrollY = useRef(0);

  const updateFeaturedVisibility = useCallback(() => {
    const { y, height: sectionHeight } = featuredFrame.current;
    const visible = y < pageScrollY.current + viewportHeight && y + sectionHeight > pageScrollY.current;
    setFeaturedInView((current) => current === visible ? current : visible);
  }, [viewportHeight]);

  const activeFeatured = featured[activeFeaturedIndex] ?? featured[0];
  const featuredScroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const moveFeatured = useCallback((direction: -1 | 1) => {
    const next = Math.max(0, Math.min(featured.length - 1, activeFeaturedIndex + direction));
    if (next === activeFeaturedIndex) return;
    setActiveFeaturedIndex(next);
    featuredScroll.current?.scrollTo({ x: next * (featuredCardWidth + 2), y: 0, animated: true });
  }, [activeFeaturedIndex, featured.length, featuredCardWidth]);
  const previewUri = activeFeatured?.videoUri
    ? Platform.OS === 'web'
      ? activeFeatured.videoUri.replace(/\/video\.mp4$/, '/preview.webm')
      : activeFeatured.videoUri.replace(/\/video\.mp4$/, '/preview.mp4')
    : null;
  const videoPlayer = useVideoPlayer(null, (player) => {
    player.loop = true;
    player.muted = true;
  });
  const activeIdRef = useRef(activeFeatured?.id);
  const shouldPreviewRef = useRef(false);

  useEffect(() => {
    if (!activeFeatured || !previewUri) return;
    const templateChanged = activeIdRef.current !== activeFeatured.id;
    activeIdRef.current = activeFeatured.id;
    shouldPreviewRef.current = featuredInView && !reduced;
    if (!shouldPreviewRef.current) {
      videoPlayer.pause();
      void videoPlayer.replaceAsync(null).catch(() => {});
      return;
    }
    if (!templateChanged && videoPlayer.status === 'readyToPlay') {
      videoPlayer.play();
      return;
    }
    let cancelled = false;
    videoPlayer.pause();
    void videoPlayer.replaceAsync(previewUri).then(() => {
      if (!cancelled && shouldPreviewRef.current) videoPlayer.play();
    }).catch(() => {});
    return () => { cancelled = true; videoPlayer.pause(); };
  }, [activeFeatured?.id, featuredInView, previewUri, reduced, videoPlayer]);

  useEffect(() => {
    const subscription = videoPlayer.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && shouldPreviewRef.current) videoPlayer.play();
    });
    return () => subscription.remove();
  }, [videoPlayer]);

  const handlePageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    pageScrollY.current = event.nativeEvent.contentOffset.y;
    updateFeaturedVisibility();
  }, [updateFeaturedVisibility]);

  const selectFeaturedAtOffset = useCallback((offsetX: number) => {
    const next = Math.max(0, Math.min(featured.length - 1, Math.round(offsetX / (featuredCardWidth + 2))));
    setActiveFeaturedIndex(next);
  }, [featured.length, featuredCardWidth]);

  return (
    <ScrollView onScroll={handlePageScroll} onLayout={updateFeaturedVisibility} scrollEventThrottle={120} style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { paddingTop: top + 12, backgroundColor: c.stage }]}>
        <Image source={HERO_IMAGE} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="right" />
        <LinearGradient colors={[c.stage, c.clear]} start={{ x: 0, y: 0 }} end={{ x: 0.85, y: 0 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={[c.clear, c.primary]} start={{ x: 0, y: 0.55 }} end={{ x: 0, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} />
        <View pointerEvents="none" style={[styles.spot, { backgroundColor: c.secondary }]} />
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

      <View style={[styles.marquee, { backgroundColor: c.accent, borderColor: 'transparent' }]}>
        <Text style={[styles.marqueeText, { color: c.foreground }]} numberOfLines={1}>K-POP  /  СТРИТ  /  ДИСКО  /  ТРЕНДЫ  /  K-POP  /  СТРИТ  /  ДИСКО</Text>
      </View>

      <SectionTitle kicker="СВЕЖЕЕ НА СЦЕНЕ" title="Новые хиты" />
      <View
        onLayout={(event) => {
          featuredFrame.current = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height };
          updateFeaturedVisibility();
        }}
      >
        <ScrollView
          ref={featuredScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={featuredCardWidth + 2}
          decelerationRate="fast"
          disableIntervalMomentum
          contentContainerStyle={{ paddingHorizontal: 12, gap: 2, paddingBottom: 8 }}
          onScrollEndDrag={(event) => selectFeaturedAtOffset(event.nativeEvent.contentOffset.x)}
          onMomentumScrollEnd={(event) => selectFeaturedAtOffset(event.nativeEvent.contentOffset.x)}
        >
          {featured.map((t, index) => (
            <TemplateCard
              key={t.id}
              t={t}
              width={featuredCardWidth}
              height={340}
              previewPlayer={index === activeFeaturedIndex && featuredInView ? videoPlayer : undefined}
              onPress={() => router.push(`/template/${t.id}`)}
            />
        ))}
        </ScrollView>
        {featured.length > 1 && <>
          <Bouncy
            testID="featured-previous"
            accessibilityLabel="Предыдущий хит"
            disabled={activeFeaturedIndex === 0}
            onPress={() => moveFeatured(-1)}
            style={[styles.featuredArrow, styles.featuredArrowLeft, { backgroundColor: c.glass, borderColor: c.glassEdge }]}
          >
            <Feather name="chevron-left" size={24} color={c.foreground} />
          </Bouncy>
          <Bouncy
            testID="featured-next"
            accessibilityLabel="Следующий хит"
            disabled={activeFeaturedIndex === featured.length - 1}
            onPress={() => moveFeatured(1)}
            style={[styles.featuredArrow, styles.featuredArrowRight, { backgroundColor: c.glass, borderColor: c.glassEdge }]}
          >
            <Feather name="chevron-right" size={24} color={c.foreground} />
          </Bouncy>
        </>}
      </View>

      <View style={{ height: 28 }} />
      <SectionTitle kicker="ВЕСЬ КАТАЛОГ" title="Выбери свой стиль" right={<Text style={[styles.count, { color: c.mutedForeground }]}>{list.length}</Text>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 5, paddingVertical: 4 }}>
        {CATEGORIES.filter((k) => k.key === 'all' || TEMPLATES.some((t) => t.category === k.key)).map((k) => <Pill key={k.key} label={k.label} active={cat === k.key} onPress={() => setCat(k.key)} />)}
      </ScrollView>
      {TEMPLATES.some((t) => t.bpm != null) && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 5, paddingVertical: 10 }}>
        {SPEEDS.map((k) => <Pill key={k.key} color="secondary" label={k.label} active={speed === k.key} onPress={() => setSpeed(k.key)} />)}
      </ScrollView>}

      {list.length === 0 ? (
        <EmptyState icon="music" title="Тут пока тихо" text="Под такой фильтр танцев нет. Попробуй другой темп." action="Сбросить" onAction={() => { setCat('all'); setSpeed('any'); }} />
      ) : (
        <View style={styles.grid}>
          {list.map((t) => (
            <View key={t.id}>
              <TemplateCard t={t} width={cardW} height={250} onPress={() => router.push(`/template/${t.id}`)} />
            </View>
          ))}
        </View>
      )}

      <View style={[styles.honest, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="info" size={18} color={c.violet} />
        <Text style={[styles.honestText, { color: c.foreground }]}>В каталоге реальные ролики: открой танец, посмотри видео и добавь своё фото. Перенос движений пока сохраняется как черновик, без запуска генерации.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  spot: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, top: 40, opacity: 0.22 },
  hero: { paddingHorizontal: 20, paddingBottom: 30, minHeight: 470, overflow: 'hidden' },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brand: { fontFamily: F.display, fontSize: 22, letterSpacing: -0.5 },
  heroTitle: { fontFamily: F.display, fontSize: 38, lineHeight: 42, letterSpacing: -1 },
  heroSub: { fontFamily: F.bodyBold, fontSize: 15, lineHeight: 21, marginTop: 12, opacity: 0.92 },
  marquee: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 10, transform: [{ rotate: '-3deg' }], marginTop: -18, marginHorizontal: -10, marginBottom: 30 },
  marqueeText: { fontFamily: F.display, fontSize: 15 },
  count: { fontFamily: F.display, fontSize: 22 },
  featuredArrow: { position: 'absolute', top: 148, width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  featuredArrowLeft: { left: 6 },
  featuredArrowRight: { right: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 2, marginTop: 6 },
  honest: { margin: 20, marginTop: 34, padding: 16, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 10 },
  honestText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13, lineHeight: 19 },
});
