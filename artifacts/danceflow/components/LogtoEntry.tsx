import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { AuthAction, AuthError, BigButton } from '@/components/AuthFrame';
import { DemoBadge } from '@/components/ui';
import { useDanceAuth } from '@/lib/dance-auth';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/fonts';

export const legacyParams = (enabled: boolean) => (enabled ? { legacy: '1' } : {});

const copy = {
  'sign-in': { title: 'Войди в танец', subtitle: 'Новый единый вход Danceflow. Пароль и восстановление — на защищённой странице входа.', cta: 'Войти' },
  'sign-up': { title: 'Твоя сцена ждёт', subtitle: 'Аккаунт создаётся на защищённой странице входа. Уже есть аккаунт Danceflow? Войди и привяжи его — не создавай новый.', cta: 'Продолжить' },
  reset: { title: 'Восстановить доступ', subtitle: 'Сброс пароля для нового входа выполняется на защищённой странице входа.', cta: 'Открыть восстановление' },
} as const;

/** Logto-first entry. The old Clerk forms stay reachable with ?legacy=1. */
export function LogtoEntry({ mode }: { mode: keyof typeof copy }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const auth = useDanceAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = copy[mode];
  const start = async () => {
    setBusy(true); setError('');
    try { await auth.signInWithLogto(); } catch {
      setError('Не удалось открыть страницу входа. Проверь подключение и повтори.');
      setBusy(false);
    }
  };
  const legacyPath = mode === 'sign-in' ? '/sign-in' : mode === 'sign-up' ? '/sign-up' : '/forgot-password';
  return (
    <KeyboardAwareScrollViewCompat bottomOffset={20} style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 24, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 24, gap: 18 }}>
      <DemoBadge label="DANCEFLOW · АККАУНТ" />
      <Text style={{ fontFamily: F.display, fontSize: 33, color: c.foreground, lineHeight: 39 }}>{t.title}</Text>
      <Text style={{ fontFamily: F.body, color: c.mutedForeground, fontSize: 15 }}>{t.subtitle}</Text>
      <BigButton testID={`logto-${mode}`} label={busy ? 'Открываем вход…' : t.cta} icon="log-in" disabled={busy} onPress={start} />
      <AuthError message={error} />
      <View style={{ gap: 2 }}>
        <AuthAction testID="legacy-login" label={mode === 'sign-up' ? 'Старая регистрация по почте' : mode === 'reset' ? 'Старое восстановление пароля' : 'Войти старым способом (почта и пароль)'}
          onPress={() => router.push({ pathname: legacyPath, params: { legacy: '1' } })} />
        {mode !== 'sign-in' && <AuthAction label="Вернуться ко входу" onPress={() => router.replace('/sign-in')} />}
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}
