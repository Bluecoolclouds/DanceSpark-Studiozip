import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AuthAction, BigButton } from '@/components/AuthFrame';
import { DemoBadge } from '@/components/ui';
import { useDanceAuth } from '@/lib/dance-auth';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/fonts';

/** Public Logto callback. The SDK exchange runs inside the auth provider. */
export default function AuthCallbackScreen() {
  const c = useColors();
  const auth = useDanceAuth();
  const [startError, setStartError] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    setStartError('');
    try { await auth.signInWithLogto(); }
    catch { setBusy(false); setStartError('Не удалось открыть вход. Проверь подключение и повтори.'); }
  };
  const finished = auth.phase === 'signed-in';
  useEffect(() => { if (finished) router.replace('/studio'); }, [finished]);
  const failed = auth.callback === 'error' || ((auth.callback === 'none' || auth.callback === 'disabled') && auth.phase === 'signed-out');
  return (
    <View style={{ flex: 1, backgroundColor: c.background, padding: 24, paddingTop: (Platform.OS === 'web' ? 67 : 48) + 24, gap: 16 }}>
      <DemoBadge label="DANCEFLOW · АККАУНТ" />
      {failed ? (
        <>
          <Text style={{ fontFamily: F.display, fontSize: 28, color: c.foreground }}>Вход не завершён</Text>
          <Text testID="callback-error" style={{ fontFamily: F.body, fontSize: 15, color: c.mutedForeground }}>Страница входа вернула ошибку или ссылка устарела. Попробуй ещё раз.</Text>
          {auth.logtoEnabled && <BigButton testID="callback-retry" label={busy ? 'Открываем вход…' : 'Войти снова'} disabled={busy} icon="refresh-cw" onPress={start} />}
          {!!startError && <Text accessibilityRole="alert" style={{ color: c.foreground }}>{startError}</Text>}
          <AuthAction label="Войти старым способом" onPress={() => router.replace({ pathname: '/sign-in', params: { legacy: '1' } })} />
          <AuthAction label="На главную" onPress={() => router.replace('/studio')} />
        </>
      ) : (
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 40 }}>
          <ActivityIndicator color={c.primary} />
          <Text testID="callback-progress" style={{ fontFamily: F.body, fontSize: 15, color: c.mutedForeground }}>{finished ? 'Готово, открываем студию…' : 'Завершаем вход…'}</Text>
        </View>
      )}
    </View>
  );
}
