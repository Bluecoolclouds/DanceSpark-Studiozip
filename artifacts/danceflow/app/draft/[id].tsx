import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigButton, Bouncy, DemoBadge, EmptyState, tone } from '@/components/ui';
import { F } from '@/constants/fonts';
import { getTemplate } from '@/constants/templates';
import { useDance } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';

export default function DraftScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { drafts, removeDraft, ready } = useDance();
  const d = drafts.find((x) => x.id === id);
  const t = d ? getTemplate(d.templateId) : undefined;
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/studio'));

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.background }} />;
  if (!d || !t) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: top + 40 }}>
        <EmptyState icon="bookmark" title="Черновик не найден" text="Возможно, он был удалён." action="К моей сцене" onAction={() => router.replace('/studio')} />
      </View>
    );
  }

  const del = () => {
    const go = () => { removeDraft(d.id); router.replace('/studio'); };
    if (Platform.OS === 'web') return go();
    Alert.alert('Удалить черновик?', 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingTop: top + 8, paddingBottom: bottom + 30, paddingHorizontal: 20 }}>
      <View style={styles.bar}>
        <Bouncy onPress={back} style={[styles.round, { backgroundColor: c.card, borderColor: c.border }]}>
          <Feather name="arrow-left" size={20} color={c.foreground} />
        </Bouncy>
        <DemoBadge label="ЧЕРНОВИК · БЕЗ ВИДЕО" />
      </View>

      <Text style={[styles.title, { color: c.foreground }]}>Черновик{'\n'}<Text style={{ color: c.primary }}>готов к сцене</Text></Text>

      <View style={styles.collage}>
        <View style={[styles.photo, { borderColor: c.border, backgroundColor: c.muted, transform: [{ rotate: '-4deg' }] }]}>
          <Image source={{ uri: d.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[styles.lbl, { backgroundColor: c.card, borderColor: c.border }]}><Text style={[styles.lblText, { color: c.foreground }]}>ТЫ</Text></View>
        </View>
        <View style={[styles.plus, { backgroundColor: c.accent, borderColor: c.border }]}>
          <Feather name="plus" size={22} color={c.foreground} />
        </View>
        <View style={[styles.photo, { borderColor: c.border, backgroundColor: tone(c, t.color), transform: [{ rotate: '4deg' }] }]}>
          <Image source={t.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[styles.lbl, { backgroundColor: tone(c, t.color), borderColor: c.border }]}><Text style={[styles.lblText, { color: c.foreground }]}>{t.dancer.toUpperCase()}</Text></View>
        </View>
      </View>

      <View style={[styles.summary, { backgroundColor: c.card, borderColor: c.border }]}>
        <Row k="Танец" v={t.title} />
        <Row k="Стиль" v={t.tagline} />
        <Row k="Темп" v={`${t.bpm} BPM`} />
        <Row k="Длительность" v={`${d.duration} сек`} />
        <Row k="Создан" v={new Date(d.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} last />
      </View>

      <View style={[styles.note, { backgroundColor: c.secondary, borderColor: c.border }]}>
        <Feather name="info" size={18} color={c.foreground} />
        <Text style={[styles.noteText, { color: c.foreground }]}>Это прототип: генерация видео не подключена. Черновик сохраняет только выбранные фото, танец и длительность.</Text>
      </View>

      <View style={{ gap: 12, marginTop: 20 }}>
        <BigButton label="Открыть танец" icon="music" color="violet" onPress={() => router.push(`/template/${t.id}`)} />
        <BigButton label="Новый черновик" icon="plus" color="accent" onPress={() => router.push('/create')} />
        <BigButton label="Удалить" icon="trash-2" color="sun" onPress={del} small />
      </View>
    </ScrollView>
  );
}

function Row({ k, v, last }: { k: string; v: string; last?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 1.5, borderColor: c.input }]}>
      <Text style={[styles.k, { color: c.mutedForeground }]}>{k}</Text>
      <Text style={[styles.v, { color: c.foreground }]} numberOfLines={2}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.display, fontSize: 30, lineHeight: 34, letterSpacing: -1 },
  collage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 28 },
  photo: { width: 140, height: 190, borderRadius: 22, borderWidth: 3, overflow: 'hidden' },
  plus: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center', marginHorizontal: -12, zIndex: 2 },
  lbl: { position: 'absolute', bottom: 8, left: 8, borderWidth: 2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  lblText: { fontFamily: F.bodyHeavy, fontSize: 10, letterSpacing: 1 },
  summary: { borderWidth: 3, borderRadius: 24, paddingHorizontal: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 13 },
  k: { fontFamily: F.bodyBold, fontSize: 14 },
  v: { fontFamily: F.bodyHeavy, fontSize: 14, flex: 1, textAlign: 'right' },
  note: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 20, borderWidth: 2, marginTop: 16 },
  noteText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13, lineHeight: 19 },
});
