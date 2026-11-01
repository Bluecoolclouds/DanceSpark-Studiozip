import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import React from 'react';
import { useRecordCatalogueOpen } from '@workspace/api-client-react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SourcePreview } from '@/components/generation-form';
import { SwapWorkspace } from '@/components/swap-workspace';
import { Bouncy, EmptyState, FavButton } from '@/components/ui';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import colors from '@/constants/colors';
import { F } from '@/constants/fonts';
import { categoryLabel, type DanceTemplate } from '@/constants/templates';
import { useCatalogueTemplate } from '@/hooks/useCatalogue';
import { recordCatalogueOpenIfEnabled } from '@/lib/catalogue-analytics';
import { ColorScope, useColors } from '@/hooks/useColors';

const N = colors.neon;


export default function TemplatePlayground() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useCatalogueTemplate(id);
  const c = useColors();
  if (!query.template) return <View style={{ flex: 1, backgroundColor: c.background, paddingTop: 90 }}>
    <EmptyState icon="info" title={query.isPending ? 'Загружаем танец…' : 'Танец недоступен'}
      text={query.isError ? 'Не удалось загрузить танец или он снят с публикации. Сохранённые черновики остаются в студии.' : 'Получаем актуальное описание.'}
      action={query.isPending ? 'В каталог' : 'Повторить'} onAction={() => query.isPending ? router.back() : void query.refetch()} />
  </View>;
  return <ColorScope.Provider value={N}><TemplatePlaygroundForm key={id} id={id} t={query.template} /></ColorScope.Provider>;
}

function TemplatePlaygroundForm({ id, t }: { id: string; t: DanceTemplate }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom;
  const wide = width >= 900;
  const recordOpen = useRecordCatalogueOpen();

  useEffect(() => {
    let active = true;
    void recordCatalogueOpenIfEnabled(id, (templateId, visitorToken) => {
      if (active) recordOpen.mutate({ id: templateId, data: { visitorToken } });
    }).catch(() => {});
    return () => { active = false; };
  }, [id, recordOpen.mutate]);

  if (!t) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: top + 40 }}>
        <EmptyState icon="alert-circle" title="Танец не найден" text="Возможно, он ушёл со сцены." action="Назад" onAction={() => router.back()} />
      </View>
    );
  }
  const panel = [styles.panel, { backgroundColor: c.card, borderColor: c.glassEdge }];
  const input = <SwapWorkspace initialTrend={t} defaultModel="object-swap" wide={wide} />;

  const result = (
    <View style={[panel, { gap: 12 }]}>
      <View style={styles.row}>
        <Text style={[styles.panelTitle, { color: c.foreground }]}>{t.exampleResultUri ? 'Пример результата' : 'Результат'}</Text>
        <Feather name="star" size={16} color={N.pink} />
      </View>
      {t.exampleResultUri ? (
        <View style={{ gap: 8 }}>
          <SourcePreview uri={t.exampleResultUri} height={Math.round(Math.min(wide ? 480 : 420, windowHeight * 0.5))} />
          <Text style={[styles.hint, { color: c.mutedForeground }]}>Пример из каталога. Новая генерация не запускалась.</Text>
        </View>
      ) : (
        <View style={[styles.empty, { borderColor: c.border, backgroundColor: c.muted }]}>
          <View style={[styles.emptyIcon, { backgroundColor: N.pink, borderColor: 'transparent' }]}>
            <Feather name="film" size={20} color={c.primaryForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: c.foreground }]}>Здесь пока пусто</Text>
          <Text style={[styles.hint, { color: c.mutedForeground, textAlign: 'center', maxWidth: 280 }]}>
            Сохрани настройки в черновик. Отдельный запуск Light Swapper с подтверждением и твоё готовое видео будут на экране черновика.
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background, overflow: 'hidden', width: '100%', maxWidth: '100%' }}>
      <Stage />
      <KeyboardAwareScrollViewCompat bottomOffset={24} style={{ width: '100%' }} contentContainerStyle={{ overflow: 'hidden', paddingTop: top + 8, paddingBottom: bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.wrap, { maxWidth: wide ? 1120 : 640 }]}>
          <View style={styles.topBar}>
            <Bouncy testID="back" accessibilityLabel="Назад" onPress={() => router.back()} style={[styles.round, { backgroundColor: c.glass, borderColor: c.glassEdge }]}>
              <Feather name="arrow-left" size={20} color={c.foreground} />
            </Bouncy>
            <View pointerEvents="none" accessibilityLabel="Danceflow" style={styles.centerBrand}>
              <Text style={[styles.brand, { color: c.foreground }]}>Dance<Text style={{ color: N.pink }}>flow</Text></Text>
            </View>
            <FavButton id={t.id} size={44} />
          </View>

          <View style={styles.hero}>
            <View style={{ flex: 1, gap: 8, zIndex: 2 }}>
              <View style={styles.row}>
                <View style={[styles.tag, { backgroundColor: N.pink }]}><Text style={styles.tagText}>Light Swapper</Text></View>
                <View style={[styles.tag, { backgroundColor: N.yellow }]}><Text style={[styles.tagText, { color: N.deep }]}>{categoryLabel(t.category)}</Text></View>
              </View>
              <Text style={[styles.sub, { color: c.mutedForeground }]} numberOfLines={2}>{t.tagline}</Text>
            </View>
          </View>

          <View style={[wide ? styles.cols : { gap: 18 }]}>
            <View style={wide ? { flex: 1.1 } : undefined}>{input}</View>
            <View style={wide ? { flex: 0.9 } : undefined}>{result}</View>
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function Stage() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: N.background }]} />
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignSelf: 'center', paddingHorizontal: 16, gap: 14 },
  topBar: { position: 'relative', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  centerBrand: { position: 'absolute', left: 44, right: 44, alignItems: 'center' },
  brand: { fontFamily: F.display, fontSize: 24, letterSpacing: -0.6 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  go: { minHeight: 60, borderRadius: 30, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  goText: { fontFamily: F.display, fontSize: 18, flexShrink: 1 },
  dropIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontFamily: F.bodyHeavy, fontSize: 11, color: '#FFFCFF' },
  sub: { fontFamily: F.body, fontSize: 14, lineHeight: 19 },
  cols: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  panel: { borderWidth: 1, borderRadius: 22, padding: 16 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  panelTitle: { fontFamily: F.display, fontSize: 22 },
  compactRow: { minHeight: 68, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 8 },
  promptRow: { minHeight: 50 },
  rowIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  mediaThumb: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden', flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  mediaPlay: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  refThumbs: { width: 76, height: 56, borderRadius: 10, overflow: 'hidden', flexDirection: 'row', gap: 2, flexShrink: 0 },
  refThumb: { flex: 1, height: '100%' },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: F.bodyHeavy, fontSize: 13, lineHeight: 17, flexShrink: 1 },
  rowSubtitle: { fontFamily: F.body, fontSize: 11, lineHeight: 14 },
  expandedContent: { borderWidth: 1, borderRadius: 14, padding: 10, gap: 8 },
  resetIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  label: { fontFamily: F.bodyHeavy, fontSize: 14, flex: 1 },
  count: { fontFamily: F.bodyHeavy, fontSize: 12 },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, minHeight: 36 },
  ghostText: { fontFamily: F.bodyBold, fontSize: 13 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3, gap: 3 },
  segItem: { flex: 1, minHeight: 48, paddingHorizontal: 6, borderRadius: 999, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: F.display, fontSize: 12, lineHeight: 15, textAlign: 'center', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  meta: { flex: 1, fontFamily: F.bodyHeavy, fontSize: 13 },
  sq: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  drop: { height: 150, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  dropTitle: { fontFamily: F.display, fontSize: 16 },
  pick: { flex: 1, minHeight: 52, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pickText: { fontFamily: F.display, fontSize: 14 },
  input: { minHeight: 96, maxHeight: 200, borderWidth: 1, borderRadius: 16, padding: 12, fontFamily: F.bodyBold, fontSize: 14, textAlignVertical: 'top' },
  hint: { fontFamily: F.body, fontSize: 12, lineHeight: 16 },
  warn: { fontFamily: F.bodyBold, fontSize: 12 },
  empty: { minHeight: 240, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '6deg' }] },
  emptyTitle: { fontFamily: F.display, fontSize: 17 },
  err: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, padding: 10 },
  errText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13 },
});
