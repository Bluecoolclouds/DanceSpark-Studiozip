import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer } from 'expo-video';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { useReducedMotion, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigButton, Bouncy, SectionTitle, TemplateCard, EmptyState } from '@/components/ui';
import { F } from '@/constants/fonts';
import { StageBackdrop } from '@/components/stage-backdrop';
import { HERO_IMAGE, templateCardPreviewUri } from '@/constants/templates';
import { useCatalogue } from '@/hooks/useCatalogue';
import { useColors } from '@/hooks/useColors';
import { templatePreviewCandidates } from '@/lib/template-preview';

const CATALOG_PAGE_SIZE = 4;

export default function Discover() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { height: viewportHeight } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const catalogue = useCatalogue({ search, limit: CATALOG_PAGE_SIZE });
  const featuredQuery = useCatalogue({ section: 'featured', limit: 12 });
  const recommendations = useCatalogue({ section: 'recommended', limit: 3 });
  const loadMore = useCallback(() => {
    if (catalogue.hasNextPage && !catalogue.isFetching && !catalogue.isError)
      void catalogue.fetchNextPage({ cancelRefetch: false });
  }, [catalogue.hasNextPage, catalogue.isFetching, catalogue.isError, catalogue.fetchNextPage]);
  const top = Platform.OS === 'web' ? 67 : insets.top;

  const bob = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    bob.value = withRepeat(withSequence(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 520, easing: Easing.in(Easing.quad) })), -1);
  }, [bob, reduced]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-6 + bob.value * 6}deg` }, { scale: 1 + bob.value * 0.06 }] }));

  const list = catalogue.items;

  const cardW = (Math.min(width, 600) - 12 * 2 - 2) / 2;
  const featured = featuredQuery.items;
  const featuredCardWidth = Math.min(width * 0.72, 300);
  const recommendationCardWidth = Math.min(width * 0.58, 230);
  const [activeFeaturedIndex, setActiveFeaturedIndex] = useState(0);
  const [activeRecommendationIndex, setActiveRecommendationIndex] = useState(0);
  const [featuredInView, setFeaturedInView] = useState(false);
  const [recommendationsInView, setRecommendationsInView] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const featuredFrame = useRef({ y: 0, height: 0 });
  const recommendationsFrame = useRef({ y: 0, height: 0 });
  const pageScrollY = useRef(0);

  const updateSectionVisibility = useCallback(() => {
    const isVisible = ({ y, height: sectionHeight }: { y: number; height: number }) =>
      sectionHeight > 0 && y < pageScrollY.current + viewportHeight && y + sectionHeight > pageScrollY.current;
    const featuredVisible = isVisible(featuredFrame.current);
    const recommendationsVisible = isVisible(recommendationsFrame.current);
    setFeaturedInView((current) => current === featuredVisible ? current : featuredVisible);
    setRecommendationsInView((current) => current === recommendationsVisible ? current : recommendationsVisible);
  }, [viewportHeight]);

  const activeFeatured = featured[activeFeaturedIndex] ?? featured[0];
  const activeRecommendation = recommendations.items[activeRecommendationIndex] ?? recommendations.items[0];
  const featuredScroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const recommendationsScroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const moveFeatured = useCallback((direction: -1 | 1) => {
    const next = Math.max(0, Math.min(featured.length - 1, activeFeaturedIndex + direction));
    if (next === activeFeaturedIndex) return;
    setActiveFeaturedIndex(next);
    featuredScroll.current?.scrollTo({ x: next * (featuredCardWidth + 2), y: 0, animated: true });
  }, [activeFeaturedIndex, featured.length, featuredCardWidth]);
  const selectRecommendationAtOffset = useCallback((offsetX: number) => {
    const next = Math.max(0, Math.min(recommendations.items.length - 1, Math.round(offsetX / (recommendationCardWidth + 4))));
    setActiveRecommendationIndex(next);
  }, [recommendations.items.length, recommendationCardWidth]);
  const activePreviewSection = featuredInView && activeFeatured && templateCardPreviewUri(activeFeatured)
    ? 'featured'
    : recommendationsInView && activeRecommendation && templateCardPreviewUri(activeRecommendation)
      ? 'recommendations'
      : null;
  const activePreview = activePreviewSection === 'featured' ? activeFeatured : activeRecommendation;
  const activePreviewUri = activePreview ? templateCardPreviewUri(activePreview) : undefined;
  const previewCandidates = useMemo(
    () => activePreviewUri ? templatePreviewCandidates(activePreviewUri) : [],
    [activePreviewUri],
  );
  const videoPlayer = useVideoPlayer(null, (player) => {
    player.loop = true;
    player.muted = true;
  });
  const shouldPreviewRef = useRef(false);

  useEffect(() => {
    // Web owns its HTML video lifecycle inside CardVideoPreview.web.
    if (Platform.OS === 'web') return;
    shouldPreviewRef.current = !!activePreview && previewCandidates.length > 0 && !reduced;
    if (!shouldPreviewRef.current) {
      setPreviewReady(false);
      videoPlayer.pause();
      void videoPlayer.replaceAsync(null).catch(() => {});
      return;
    }

    let cancelled = false;
    let candidateIndex = -1;
    setPreviewReady(false);
    videoPlayer.pause();

    const loadCandidate = (index: number) => {
      if (cancelled || index >= previewCandidates.length) {
        candidateIndex = previewCandidates.length;
        setPreviewReady(false);
        return;
      }
      candidateIndex = index;
      setPreviewReady(false);
      void videoPlayer.replaceAsync(previewCandidates[index]).then(() => {
        if (!cancelled && candidateIndex === index && shouldPreviewRef.current) videoPlayer.play();
      }).catch(() => {
        if (!cancelled && candidateIndex === index) loadCandidate(index + 1);
      });
    };

    const subscription = videoPlayer.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && candidateIndex < previewCandidates.length && shouldPreviewRef.current) {
        setPreviewReady(true);
        videoPlayer.play();
      } else if (status === 'error') {
        loadCandidate(candidateIndex + 1);
      } else if (status === 'loading' || status === 'idle') {
        setPreviewReady(false);
      }
    });
    loadCandidate(0);

    return () => {
      cancelled = true;
      subscription.remove();
      videoPlayer.pause();
    };
  }, [activePreview?.id, previewCandidates, reduced, videoPlayer]);

  const handlePageScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    pageScrollY.current = contentOffset.y;
    updateSectionVisibility();
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (distanceFromBottom < layoutMeasurement.height * 0.7) {
      loadMore();
    }
  }, [loadMore, updateSectionVisibility]);

  const selectFeaturedAtOffset = useCallback((offsetX: number) => {
    const next = Math.max(0, Math.min(featured.length - 1, Math.round(offsetX / (featuredCardWidth + 2))));
    setActiveFeaturedIndex(next);
  }, [featured.length, featuredCardWidth]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
    <StageBackdrop />
    <ScrollView onScroll={handlePageScroll} onContentSizeChange={(_w, h) => {
      updateSectionVisibility();
      if (h - pageScrollY.current - viewportHeight < viewportHeight * 0.7) loadMore();
    }} onLayout={updateSectionVisibility} scrollEventThrottle={120} style={{ flex: 1, backgroundColor: 'transparent' }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
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

      {featured.length >= 5 && <>
        <SectionTitle kicker="СВЕЖЕЕ НА СЦЕНЕ" title="Новые хиты" />
        <View
          onLayout={(event) => {
            featuredFrame.current = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height };
            updateSectionVisibility();
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
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              if (contentSize.width - contentOffset.x - layoutMeasurement.width < featuredCardWidth &&
                featuredQuery.hasNextPage && !featuredQuery.isFetching && !featuredQuery.isError)
                void featuredQuery.fetchNextPage({ cancelRefetch: false });
            }}
            scrollEventThrottle={200}
          >
            {featured.map((t, index) => (
              <TemplateCard
                key={t.id}
                t={t}
                width={featuredCardWidth}
                height={340}
                previewPlayer={index === activeFeaturedIndex && activePreviewSection === 'featured' && !reduced ? videoPlayer : undefined}
                previewReady={previewReady}
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
        {featuredQuery.isError && <EmptyState icon="alert-circle" title="Хиты не загрузились" text="Попробуй ещё раз." action="Повторить" onAction={() => void featuredQuery.refetch()} />}
        <View style={{ height: 28 }} />
      </>}

      <View onLayout={(event) => {
        recommendationsFrame.current = { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height };
        updateSectionVisibility();
      }}>
        <SectionTitle kicker="ВЫБРАЛИ ДЛЯ ТЕБЯ" title="Рекомендуем" />
        <ScrollView
          ref={recommendationsScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={recommendationCardWidth + 4}
          decelerationRate="fast"
          disableIntervalMomentum
          contentContainerStyle={{ paddingHorizontal: 12, gap: 4, paddingBottom: 8 }}
          onScrollEndDrag={(event) => selectRecommendationAtOffset(event.nativeEvent.contentOffset.x)}
          onMomentumScrollEnd={(event) => selectRecommendationAtOffset(event.nativeEvent.contentOffset.x)}
        >
          {recommendations.items.map((t, index) => (
            <TemplateCard
              key={t.id}
              t={t}
              width={recommendationCardWidth}
              height={250}
              previewPlayer={index === activeRecommendationIndex && activePreviewSection === 'recommendations' && !reduced ? videoPlayer : undefined}
              previewReady={previewReady}
              onPress={() => router.push(`/template/${t.id}`)}
            />
          ))}
        </ScrollView>
      </View>
      {recommendations.isError && <EmptyState icon="alert-circle" title="Рекомендации не загрузились" text="Попробуй ещё раз." action="Повторить" onAction={() => void recommendations.refetch()} />}

      <View style={{ height: 24 }} />
      <SectionTitle kicker="ВЕСЬ КАТАЛОГ" title="Выбери свой стиль" />
      <View style={[styles.searchBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="search" size={19} color={c.mutedForeground} />
        <TextInput
          testID="catalog-search"
          accessibilityLabel="Поиск по каталогу"
          value={search}
          onChangeText={setSearch}
          placeholder="Название, описание, движение…"
          placeholderTextColor={c.mutedForeground}
          returnKeyType="search"
          style={[styles.searchInput, { color: c.foreground }]}
        />
        {!!search && (
          <Bouncy
            testID="catalog-search-clear"
            accessibilityLabel="Очистить поиск"
            onPress={() => setSearch('')}
            style={styles.searchClear}
          >
            <Feather name="x-circle" size={20} color={c.mutedForeground} />
          </Bouncy>
        )}
      </View>
      {catalogue.isError && !list.length ? (
        <EmptyState icon="alert-circle" title="Не удалось загрузить каталог" text="Проверь соединение и повтори загрузку." action="Повторить" onAction={() => void catalogue.refetch()} />
      ) : catalogue.isPending ? (
        <Text style={{ color: c.mutedForeground, textAlign: 'center', margin: 20 }}>Загружаем танцы…</Text>
      ) : list.length === 0 ? (
        <EmptyState
          icon="search"
          title={!search.trim() ? 'Пока нет опубликованных танцев' : 'Ничего не найдено'}
          text={!search.trim() ? 'Сохранённые черновики по-прежнему доступны в студии.' : 'Попробуй изменить или очистить запрос.'}
          action={!search.trim() ? 'В студию' : 'Очистить поиск'}
          onAction={() => { if (!search.trim()) router.push('/studio'); else setSearch(''); }}
        />
      ) : (
        <View style={styles.grid}>
          {list.map((t) => (
            <View key={t.id}>
              <TemplateCard t={t} width={cardW} height={250} onPress={() => router.push(`/template/${t.id}`)} />
            </View>
          ))}
        </View>
      )}
      {catalogue.isError && list.length > 0 && <EmptyState icon="alert-circle" title="Не удалось загрузить продолжение" text="Уже загруженные танцы остаются доступны." action="Повторить" onAction={() => void catalogue.fetchNextPage({ cancelRefetch: false })} />}
      {catalogue.hasNextPage && (
        <Text style={{ color: c.mutedForeground, fontFamily: F.body, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
          Показано {list.length} из {catalogue.total} · {catalogue.isFetchingNextPage ? 'Загружаем…' : 'прокрути ниже, чтобы увидеть ещё'}
        </Text>
      )}
      {!catalogue.hasNextPage && !catalogue.isPending && list.length > 0 &&
        <Text style={{ color: c.mutedForeground, textAlign: 'center', marginTop: 12 }}>Все танцы загружены</Text>}

      <View style={[styles.honest, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="info" size={18} color={c.violet} />
        <Text style={[styles.honestText, { color: c.foreground }]}>В каталоге реальные ролики: открой танец, посмотри видео и добавь своё фото. Перенос движений пока сохраняется как черновик, без запуска генерации.</Text>
      </View>
    </ScrollView>
    </View>
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
  searchBox: { minHeight: 52, marginHorizontal: 12, marginTop: 2, marginBottom: 10, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 12, fontFamily: F.body, fontSize: 15 },
  searchClear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  featuredArrow: { position: 'absolute', top: 148, width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  featuredArrowLeft: { left: 6 },
  featuredArrowRight: { right: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 2, marginTop: 6 },
  honest: { margin: 20, marginTop: 34, padding: 16, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 10 },
  honestText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13, lineHeight: 19 },
});
