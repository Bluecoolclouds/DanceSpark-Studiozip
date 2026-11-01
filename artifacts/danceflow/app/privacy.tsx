import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { BigButton, Bouncy } from '@/components/ui';
import { F } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { getCatalogueAnalyticsEnabled, setCatalogueAnalyticsEnabled } from '@/lib/catalogue-analytics';

const SUPPORT_EMAIL = 'danceflow@meduha.app';

export default function PrivacyScreen() {
  const c = useColors();
  const [opening, setOpening] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean | null>(null);
  const [savingAnalytics, setSavingAnalytics] = useState(false);
  useEffect(() => {
    let active = true;
    void getCatalogueAnalyticsEnabled().then((enabled) => {
      if (active) setAnalyticsEnabled(enabled);
    });
    return () => { active = false; };
  }, []);

  const updateAnalyticsPreference = async (enabled: boolean) => {
    setAnalyticsEnabled(enabled);
    setSavingAnalytics(true);
    try {
      await setCatalogueAnalyticsEnabled(enabled);
      const savedValue = await getCatalogueAnalyticsEnabled();
      setAnalyticsEnabled(savedValue);
    } catch {
      if (enabled) setAnalyticsEnabled(false);
      Alert.alert(
        'Не удалось сохранить выбор',
        enabled
          ? 'Сбор статистики останется выключен, пока приложение открыто. Проверь настройки хранилища устройства.'
          : 'Сбор статистики выключен на этом устройстве, но выбор может не сохраниться после перезапуска.',
      );
    } finally {
      setSavingAnalytics(false);
    }
  };

  const policyUrl = useMemo(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return `${window.location.origin}/api/privacy-policy`;
    }
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    return domain ? `https://${domain}/api/privacy-policy` : null;
  }, []);

  const openPolicy = async () => {
    if (!policyUrl || opening) {
      Alert.alert('Ссылка недоступна', 'Публичная версия появится после публикации сервиса.');
      return;
    }
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(policyUrl);
    } catch {
      await Linking.openURL(policyUrl).catch(() =>
        Alert.alert('Не удалось открыть политику', 'Проверь подключение и попробуй ещё раз.'));
    } finally {
      setOpening(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Bouncy accessibilityLabel="Назад" onPress={() => router.back()} style={[styles.back, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="arrow-left" size={20} color={c.foreground} />
      </Bouncy>
      <Text style={[styles.title, { color: c.foreground }]}>Конфиденциальность</Text>
      <View style={[styles.warning, { backgroundColor: c.sun, borderColor: c.border }]}>
        <Feather name="alert-circle" size={18} color={c.foreground} />
        <Text style={[styles.warningText, { color: c.foreground }]}>
          Публичная политика сейчас помечена как проект. Не отправляйте её в RuStore до заполнения реквизитов оператора и подтверждения сроков хранения.
        </Text>
      </View>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.section, { color: c.foreground }]}>Что важно знать</Text>
        <Text style={[styles.text, { color: c.mutedForeground }]}>
          Для генерации выбранные фото, видео и параметры запроса передаются Higgsfield. Загруженные исходные видео Light Swapper хранятся в Cloudflare R2. Черновики сохраняются на устройстве.
        </Text>
        <Text style={[styles.text, { color: c.mutedForeground }]}>
          Для подсчёта популярности мы учитываем открытия карточек каталога. Приложение использует случайный токен посетителя, который обновляется каждые 7 дней; сервер хранит его хеш, а не сам токен. Токен не связан с аккаунтом. Вы можете отключить сбор в любой момент.
        </Text>
        <Text style={[styles.text, { color: c.mutedForeground }]}>
          По вопросам данных и поддержки: {SUPPORT_EMAIL}
        </Text>
        <BigButton testID="open-public-privacy-policy" label={opening ? 'Открываем…' : 'Открыть полный текст'} icon="external-link" onPress={() => void openPolicy()} disabled={opening} />
      </View>
      <View style={[styles.preference, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.preferenceCopy}>
          <Text style={[styles.section, { color: c.foreground }]}>Статистика открытий</Text>
          <Text style={[styles.text, { color: c.mutedForeground }]}>
            {analyticsEnabled === false
              ? 'Новые открытия карточек не отправляются.'
              : 'Помогает показывать популярные карточки каталога.'}
          </Text>
        </View>
        <Switch
          testID="catalogue-analytics-switch"
          accessibilityRole="switch"
          accessibilityLabel="Сбор статистики открытий карточек"
          value={analyticsEnabled ?? false}
          onValueChange={(enabled) => void updateAnalyticsPreference(enabled)}
          disabled={analyticsEnabled === null || savingAnalytics}
          trackColor={{ false: c.border, true: c.primary }}
          thumbColor={c.card}
        />
      </View>
      {!!policyUrl && <Text selectable style={[styles.url, { color: c.mutedForeground }]}>{policyUrl}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: Platform.OS === 'web' ? 67 : 18, paddingHorizontal: 18, paddingBottom: 40, gap: 16 },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, borderWidth: 1 },
  title: { fontFamily: F.display, fontSize: 30, letterSpacing: -0.8 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1 },
  warningText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13, lineHeight: 19 },
  card: { padding: 16, gap: 14, borderRadius: 18, borderWidth: 1 },
  preference: { padding: 16, gap: 14, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  preferenceCopy: { flex: 1, gap: 6 },
  section: { fontFamily: F.display, fontSize: 18 },
  text: { fontFamily: F.body, fontSize: 14, lineHeight: 21 },
  url: { fontFamily: F.body, fontSize: 11, lineHeight: 16 },
});
