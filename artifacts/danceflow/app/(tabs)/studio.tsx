import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bouncy, EmptyState, Pill, TemplateCard, tone } from '@/components/ui';
import { F } from '@/constants/fonts';
import { TEMPLATES, getTemplate } from '@/constants/templates';
import { useDance } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';

export default function Studio() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { favorites, drafts, removeDraft, ready } = useDance();
  const [tab, setTab] = useState<'drafts' | 'favs'>('drafts');
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const favT = favorites.map((id) => TEMPLATES.find((t) => t.id === id)).filter(Boolean) as typeof TEMPLATES;
  const cardW = (Math.min(width, 600) - 40 - 14) / 2;

  const confirmDelete = (id: string) => {
    if (Platform.OS === 'web') { removeDraft(id); return; }
    Alert.alert('Удалить черновик?', 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeDraft(id) },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingTop: top + 14, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 20 }}>
        <Text style={[styles.title, { color: c.foreground }]}>Моя <Text style={{ color: c.violet }}>сцена</Text></Text>
        <View style={styles.stats}>
          <Stat n={drafts.length} label="черновиков" color={c.accent} />
          <Stat n={favorites.length} label="в избранном" color={c.primary} />
        </View>
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
              const t = getTemplate(d.templateId);
              if (!t) return null;
              return (
                <Bouncy key={d.id} scaleTo={0.97} onPress={() => router.push(`/draft/${d.id}`)} style={[styles.draft, { backgroundColor: c.card, borderColor: c.border, shadowColor: c.border }]}>
                  <Image source={{ uri: d.photoUri }} style={[styles.thumb, { borderColor: c.border, backgroundColor: c.muted }]} contentFit="cover" />
                  <Image source={t.image} style={[styles.thumbSmall, { borderColor: c.border }]} contentFit="cover" />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.dTitle, { color: c.foreground }]} numberOfLines={1}>{t.title}</Text>
                    <Text style={[styles.dMeta, { color: c.mutedForeground }]}>{d.duration} сек · {new Date(d.createdAt).toLocaleDateString('ru-RU')}</Text>
                    <View style={[styles.badge, { backgroundColor: tone(c, t.color), borderColor: c.border }]}>
                      <Text style={[styles.badgeText, { color: c.foreground }]}>ЧЕРНОВИК</Text>
                    </View>
                  </View>
                  <Bouncy onPress={() => confirmDelete(d.id)} style={[styles.del, { borderColor: c.border }]}>
                    <Feather name="trash-2" size={16} color={c.foreground} />
                  </Bouncy>
                </Bouncy>
              );
            })}
          </View>
        )
      ) : favT.length === 0 ? (
        <EmptyState icon="heart" title="Сердечек пока нет" text="Отмечай танцы в каталоге, чтобы вернуться к ним позже." action="В каталог" onAction={() => router.push('/')} />
      ) : (
        <View style={styles.grid}>
          {favT.map((t) => <TemplateCard key={t.id} t={t} width={cardW} height={240} onPress={() => router.push(`/template/${t.id}`)} />)}
        </View>
      )}
    </ScrollView>
  );
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
  stat: { flex: 1, borderWidth: 3, borderRadius: 22, padding: 14 },
  statN: { fontFamily: F.display, fontSize: 30 },
  statL: { fontFamily: F.bodyBold, fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginVertical: 20 },
  skel: { height: 110, borderRadius: 22 },
  draft: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 24, borderWidth: 3, shadowOffset: { width: 3, height: 4 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  thumb: { width: 72, height: 92, borderRadius: 16, borderWidth: 2 },
  thumbSmall: { position: 'absolute', left: 62, top: 60, width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  dTitle: { fontFamily: F.displayBold, fontSize: 16 },
  dMeta: { fontFamily: F.bodyBold, fontSize: 12 },
  badge: { alignSelf: 'flex-start', borderWidth: 2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  badgeText: { fontFamily: F.bodyHeavy, fontSize: 10, letterSpacing: 1 },
  del: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 20 },
});
