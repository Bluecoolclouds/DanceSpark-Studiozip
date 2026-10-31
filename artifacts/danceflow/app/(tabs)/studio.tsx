import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bouncy, EmptyState, Pill, TemplateCard, tone } from '@/components/ui';
import { F } from '@/constants/fonts';
import { resolveDraftTemplate } from '@/lib/draft-meta';
import { useCatalogueTemplate } from '@/hooks/useCatalogue';
import { useDance } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';
import { AccountSubscription } from '@/components/AccountSubscription';
import { DraftImage } from '@/components/draft-image';

export default function Studio() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { favorites, drafts, removeDraft, ready } = useDance();
  const [tab, setTab] = useState<'drafts' | 'favs'>('drafts');
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const cardW = (Math.min(width, 600) - 40 - 14) / 2;

  const confirmDelete = (id: string) => {
    if (Platform.OS === 'web') { removeDraft(id); return; }
    const draft = drafts.find((item) => item.id === id);
    Alert.alert('Удалить черновик?', draft?.savedVideoAssetId
      ? 'Черновик будет удалён. Сохранённая копия в медиатеке останется.'
      : 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeDraft(id) },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingTop: top + 14, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={[styles.title, { color: c.foreground }]}>Моя <Text style={{ color: c.violet }}>сцена</Text></Text>
        <AccountSubscription />
        <View style={styles.stats}>
          <Stat n={drafts.length} label="черновиков" color={c.accent} />
          <Stat n={favorites.length} label="в избранном" color={c.primary} />
        </View>
        <Bouncy testID="open-subscription" accessibilityLabel="Тарифы подписки" scaleTo={0.97} onPress={() => router.push('/subscription')}
          style={[styles.subEntry, { backgroundColor: c.violet, borderColor: c.border, shadowColor: c.border }]}>
          <View style={styles.subRow}>
            <View style={[styles.subIcon, { backgroundColor: c.sun, borderColor: c.border }]}>
              <Feather name="star" size={18} color={c.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.subTitle, { color: c.primaryForeground }]}>Тарифы подписки</Text>
              <Text style={[styles.subText, { color: c.primaryForeground }]}>Посмотреть цены · оплата скоро</Text>
            </View>
            <Feather name="arrow-right" size={20} color={c.primaryForeground} />
          </View>
        </Bouncy>
      </View>
      <View style={styles.tabs}>
        <Pill label="Черновики" active={tab === 'drafts'} onPress={() => setTab('drafts')} color="accent" />
        <Pill label="Избранное" active={tab === 'favs'} onPress={() => setTab('favs')} />
      </View>

      {!ready ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {[0, 1].map((i) => <View key={i} style={[styles.skel, { backgroundColor: c.muted }]} />)}
        </View>
      ) : tab === 'drafts' ? (
        drafts.length === 0 ? (
          <EmptyState icon="bookmark" title="Черновиков пока нет" text="Выбери фото и танец — черновик появится здесь." action="Создать" onAction={() => router.push('/create')} />
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 14 }}>
            {drafts.map((d) => {
              const t = d.templateSnapshot ?? resolveDraftTemplate(d.templateId);
              if (!t) return null;
              return (
                <View key={d.id} style={[styles.draft, { backgroundColor: c.card, borderColor: c.border, shadowColor: c.border }]}>
                  <Bouncy accessibilityLabel={`Открыть черновик: ${t.title}`} scaleTo={0.97} onPress={() => router.push(`/draft/${d.id}`)} style={styles.draftOpen}>
                  <DraftImage uri={d.photoUri} style={[styles.thumb, { borderColor: c.border, backgroundColor: c.muted }]} contentFit="cover" />
                  <Image source={t.image} style={[styles.thumbSmall, { borderColor: c.border }]} contentFit="cover" />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.dTitle, { color: c.foreground }]} numberOfLines={1}>{t.title}</Text>
                    <Text style={[styles.dMeta, { color: c.mutedForeground }]}>{d.duration} сек · {new Date(d.createdAt).toLocaleDateString('ru-RU')}</Text>
                    <View style={[styles.badge, { backgroundColor: tone(c, t.color), borderColor: c.border }]}>
                      <Text style={[styles.badgeText, { color: c.foreground }]}>
                        {d.savedVideoAssetId ? 'СОХРАНЕНО' : d.videoUri ? 'ГОТОВОЕ ВИДЕО' :
                          d.generationStatus === 'uploading' ? 'ПОДГОТОВКА' :
                          d.generationStatus === 'submitting' || d.generationStatus === 'unknown' ? 'ПРОВЕРЯЕМ ЗАПРОС' :
                          d.generationStatus === 'queued' ? 'В ОЧЕРЕДИ' :
                          d.generationStatus === 'processing' ? 'СОЗДАЁТСЯ' :
                          d.generationStatus === 'failed' ? 'ОШИБКА' : 'ЧЕРНОВИК'}
                      </Text>
                    </View>
                  </View>
                  </Bouncy>
                  <Bouncy accessibilityLabel={`Удалить черновик: ${t.title}`} onPress={() => confirmDelete(d.id)} style={[styles.del, { borderColor: c.border }]}>
                    <Feather name="trash-2" size={16} color={c.foreground} />
                  </Bouncy>
                </View>
              );
            })}
          </View>
        )
      ) : favorites.length === 0 ? (
        <EmptyState icon="heart" title="Сердечек пока нет" text="Отмечай танцы в каталоге, чтобы вернуться к ним позже." action="В каталог" onAction={() => router.push('/')} />
      ) : (
        <View style={styles.grid}>
          {favorites.map((id) => <FavoriteTemplate key={id} id={id} width={cardW} />)}
        </View>
      )}
    </ScrollView>
  );
}

function FavoriteTemplate({ id, width }: { id: string; width: number }) {
  const query = useCatalogueTemplate(id);
  const c = useColors();
  if (!query.template) return <View style={{ width, padding: 16 }}>
    <Text style={{ color: c.mutedForeground }}>{query.isPending ? 'Загружаем…' : 'Танец недоступен'}</Text>
    {query.isError && <Bouncy onPress={() => void query.refetch()}><Text style={{ color: c.primary }}>Повторить</Text></Bouncy>}
  </View>;
  return <TemplateCard t={query.template} width={width} height={240} onPress={() => router.push(`/template/${id}`)} />;
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  const c = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: color, borderColor: c.border }]}>
      <Text style={[styles.statN, { color: c.foreground }]}>{n}</Text>
      <Text style={[styles.statL, { color: c.foreground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: F.display, fontSize: 34, letterSpacing: -1 },
  stats: { flexDirection: 'row', gap: 12, marginTop: 16 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 22, padding: 14 },
  statN: { fontFamily: F.display, fontSize: 30 },
  statL: { fontFamily: F.bodyBold, fontSize: 13 },
  subEntry: { marginTop: 12, borderRadius: 8, borderWidth: 1, padding: 12, shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  subTitle: { fontFamily: F.displayBold, fontSize: 15 },
  subText: { fontFamily: F.bodyBold, fontSize: 12, opacity: 0.9, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginVertical: 20 },
  skel: { height: 110, borderRadius: 22 },
  draft: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, borderWidth: 1, shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 2 },
  draftOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  thumb: { width: 72, height: 92, borderRadius: 4, borderWidth: 1 },
  thumbSmall: { position: 'absolute', left: 54, top: 52, width: 36, height: 36, borderRadius: 18, borderWidth: 1 },
  dTitle: { fontFamily: F.displayBold, fontSize: 16 },
  dMeta: { fontFamily: F.bodyBold, fontSize: 12 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  badgeText: { fontFamily: F.bodyHeavy, fontSize: 10 },
  del: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 20 },
});
