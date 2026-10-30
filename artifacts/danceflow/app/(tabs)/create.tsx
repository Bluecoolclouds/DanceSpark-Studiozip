import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigButton, Bouncy, DemoBadge, tone } from '@/components/ui';
import { F } from '@/constants/fonts';
import { TEMPLATES, getTemplate } from '@/constants/templates';
import { useDance } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';

export default function Create() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ template?: string }>();
  const { addDraft } = useDance();
  const [photo, setPhoto] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const templateId = picked ?? (getTemplate(params.template) ? params.template! : TEMPLATES[0].id);
  const t = getTemplate(templateId)!;
  const dur = duration && t.durations.includes(duration) ? duration : t.durations[0];
  const top = Platform.OS === 'web' ? 67 : insets.top;

  const denied = (what: string) => {
    if (Platform.OS === 'web') { Alert.alert('Нет доступа', `Разреши доступ к ${what} в браузере.`); return; }
    Alert.alert('Нет доступа', `Разреши доступ к ${what} в настройках, чтобы выбрать фото.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Настройки', onPress: () => Linking.openSettings().catch(() => {}) },
    ]);
  };

  const pickLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return denied('галерее');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.8 });
    if (!r.canceled && r.assets[0]) setPhoto(r.assets[0].uri);
  };
  const pickCamera = async () => {
    if (Platform.OS === 'web') return pickLibrary();
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return denied('камере');
    const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [3, 4], quality: 0.8 });
    if (!r.canceled && r.assets[0]) setPhoto(r.assets[0].uri);
  };

  const save = () => {
    if (!photo) return;
    const d = addDraft({ templateId: t.id, photoUri: photo, duration: dur });
    setPhoto(null);
    router.push(`/draft/${d.id}`);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingTop: top + 14, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        <DemoBadge />
        <Text style={[styles.title, { color: c.foreground }]}>Собери свой{'\n'}<Text style={{ color: c.primary }}>танец</Text></Text>
        <Text style={[styles.sub, { color: c.mutedForeground }]}>Три шага до черновика. Видео в прототипе не создаётся — мы честно сохраним твой выбор.</Text>
      </View>

      <Step n="1" title="Твоё фото" color={c.primary} />
      <View style={{ paddingHorizontal: 20 }}>
        {photo ? (
          <View style={[styles.photoWrap, { borderColor: c.border, backgroundColor: c.muted }]}>
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.photoActions}>
              <Bouncy onPress={pickLibrary} style={[styles.round, { backgroundColor: c.card, borderColor: c.border }]}><Feather name="refresh-cw" size={18} color={c.foreground} /></Bouncy>
              <Bouncy onPress={() => setPhoto(null)} style={[styles.round, { backgroundColor: c.card, borderColor: c.border }]}><Feather name="x" size={18} color={c.foreground} /></Bouncy>
            </View>
          </View>
        ) : (
          <View style={styles.pickRow}>
            <Bouncy testID="pick-library" onPress={pickLibrary} style={[styles.pick, { backgroundColor: c.secondary, borderColor: c.border, transform: [{ rotate: '-2deg' }] }]}>
              <Feather name="image" size={30} color={c.foreground} />
              <Text style={[styles.pickText, { color: c.foreground }]}>Галерея</Text>
            </Bouncy>
            <Bouncy testID="pick-camera" onPress={pickCamera} style={[styles.pick, { backgroundColor: c.accent, borderColor: c.border, transform: [{ rotate: '2deg' }] }]}>
              <Feather name="camera" size={30} color={c.foreground} />
              <Text style={[styles.pickText, { color: c.foreground }]}>Камера</Text>
            </Bouncy>
          </View>
        )}
        <Text style={[styles.hint, { color: c.mutedForeground }]}>Лучше всего — фото в полный рост на чистом фоне.</Text>
      </View>

      <Step n="2" title="Танец" color={c.violet} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 8 }}>
        {TEMPLATES.map((x) => {
          const on = x.id === t.id;
          return (
            <Bouncy key={x.id} onPress={() => setPicked(x.id)} style={[styles.tpl, { borderColor: c.border, backgroundColor: tone(c, x.color) }, on && { transform: [{ translateY: -6 }] }]}>
              <Image source={x.image} style={styles.tplImg} contentFit="cover" />
              <View style={[styles.tplLabel, { backgroundColor: on ? c.primary : c.card }]}>
                <Text numberOfLines={1} style={[styles.tplText, { color: on ? c.primaryForeground : c.foreground }]}>{x.title}</Text>
              </View>
              {on && <View style={[styles.check, { backgroundColor: c.accent, borderColor: c.border }]}><Feather name="check" size={14} color={c.foreground} /></View>}
            </Bouncy>
          );
        })}
      </ScrollView>

      <Step n="3" title="Длительность" color={c.sun} />
      <View style={[styles.durRow, { paddingHorizontal: 20 }]}>
        {[5, 10, 15].map((d) => {
          const ok = t.durations.includes(d);
          const on = dur === d;
          return (
            <Bouncy key={d} disabled={!ok} onPress={() => setDuration(d)} style={[styles.dur, { borderColor: c.border, backgroundColor: on ? c.sun : c.card }]}>
              <Text style={[styles.durNum, { color: c.foreground }]}>{d}</Text>
              <Text style={[styles.durUnit, { color: c.foreground }]}>сек</Text>
            </Bouncy>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: c.mutedForeground, paddingHorizontal: 20 }]}>Недоступные длительности не поддерживаются этим танцем.</Text>

      <View style={{ paddingHorizontal: 20, marginTop: 28, gap: 10 }}>
        <BigButton testID="save-draft" label={photo ? 'Сохранить черновик' : 'Сначала выбери фото'} icon="bookmark" disabled={!photo} onPress={save} />
        <Text style={[styles.hint, { color: c.mutedForeground, textAlign: 'center' }]}>Черновик хранится только на этом устройстве.</Text>
      </View>
    </ScrollView>
  );
}

function Step({ n, title, color }: { n: string; title: string; color: string }) {
  const c = useColors();
  return (
    <View style={styles.step}>
      <View style={[styles.stepNum, { backgroundColor: color, borderColor: c.border }]}>
        <Text style={[styles.stepNumText, { color: c.foreground }]}>{n}</Text>
      </View>
      <Text style={[styles.stepTitle, { color: c.foreground }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: F.display, fontSize: 34, lineHeight: 38, letterSpacing: -1 },
  sub: { fontFamily: F.body, fontSize: 14, lineHeight: 20 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, marginTop: 30, marginBottom: 14 },
  stepNum: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  stepNumText: { fontFamily: F.display, fontSize: 15 },
  stepTitle: { fontFamily: F.display, fontSize: 20 },
  pickRow: { flexDirection: 'row', gap: 5 },
  pick: { flex: 1, height: 150, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 10 },
  pickText: { fontFamily: F.display, fontSize: 15 },
  photoWrap: { height: 360, borderRadius: 8, borderWidth: 2, overflow: 'hidden' },
  photoActions: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 8 },
  round: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  hint: { fontFamily: F.body, fontSize: 12, marginTop: 10 },
  tpl: { width: 120, height: 170, borderRadius: 6, borderWidth: 2, overflow: 'hidden', marginTop: 8 },
  tplImg: { flex: 1 },
  tplLabel: { paddingVertical: 7, paddingHorizontal: 8 },
  tplText: { fontFamily: F.bodyHeavy, fontSize: 12 },
  check: { position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  durRow: { flexDirection: 'row', gap: 12 },
  dur: { flex: 1, borderRadius: 8, borderWidth: 2, paddingVertical: 14, alignItems: 'center' },
  durNum: { fontFamily: F.display, fontSize: 28 },
  durUnit: { fontFamily: F.bodyBold, fontSize: 12 },
});
