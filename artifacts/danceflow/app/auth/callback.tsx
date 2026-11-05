import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AuthAction, BigButton } from '@/components/AuthFrame';
import { DemoBadge } from '@/components/ui';
import { useDanceAuth } from '@/lib/dance-auth';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/fonts';

/** Old external-login return URL. Email/password sign-in no longer redirects here. */
export default function AuthCallbackScreen() {
  const c = useColors();
  const auth = useDanceAuth();
  const finished = auth.phase === 'signed-in';
  useEffect(() => { if (finished) router.replace('/studio'); }, [finished]);
  const waiting = auth.phase === 'loading' || finished;
  return (
    <View style={{ flex: 1, backgroundColor: c.background, padding: 24, paddingTop: (Platform.OS === 'web' ? 67 : 48) + 24, gap: 16 }}>
      <DemoBadge label="DANCEFLOW · АККАУНТ" />
      {waiting ? (
        <View style={{ alignItems: 'center', gap: 14, paddingTop: 40 }}>
          <ActivityIndicator color={c.primary} />
          <Text testID="callback-progress" style={{ fontFamily: F.body, fontSize: 15, color: c.mutedForeground }}>{finished ? 'Готово, открываем студию…' : 'Проверяем вход…'}</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontFamily: F.display, fontSize: 28, color: c.foreground }}>Эта ссылка устарела</Text>
          <Text testID="callback-error" style={{ fontFamily: F.body, fontSize: 15, color: c.mutedForeground }}>Вход теперь выполняется по почте и паролю прямо в приложении. Старые ссылки входа больше не работают.</Text>
          <BigButton testID="callback-signin" label="Войти" icon="log-in" onPress={() => router.replace('/sign-in')} />
          <AuthAction label="На главную" onPress={() => router.replace('/studio')} />
        </>
      )}
    </View>
  );
}
