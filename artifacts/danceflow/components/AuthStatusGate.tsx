import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AuthAction, AuthError, BigButton } from '@/components/AuthFrame';
import { DemoBadge } from '@/components/ui';
import { useDanceAuth } from '@/lib/dance-auth';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/fonts';

/** Covers the app while identity is unresolved or needs an explicit decision. */
export function AuthStatusGate() {
  const auth = useDanceAuth();
  if (!['loading', 'signing-out', 'blocked', 'session-error'].includes(auth.phase)) return null;
  return <GateScreen auth={auth} />;
}

function GateScreen({ auth }: { auth: ReturnType<typeof useDanceAuth> }) {
  const c = useColors();
  const [leaveError, setLeaveError] = useState('');
  const leave = async () => {
    setLeaveError('');
    try { await auth.signOut(); router.replace('/studio'); } catch { setLeaveError('Не удалось выйти. Повтори.'); }
  };
  let body: React.ReactNode;
  switch (auth.phase) {
    case 'blocked':
      body = (<>
        <Text style={[styles.title, { color: c.foreground }]}>Доступ закрыт</Text>
        <Text style={[styles.text, { color: c.mutedForeground }]}>Этот аккаунт заблокирован. Обратись в поддержку Danceflow.</Text>
        <BigButton testID="auth-blocked-signout" label="Выйти" icon="log-out" onPress={leave} />
      </>);
      break;
    case 'session-error':
      body = (<>
        <Text style={[styles.title, { color: c.foreground }]}>Не удалось проверить аккаунт</Text>
        <Text style={[styles.text, { color: c.mutedForeground }]}>Не удалось проверить вход. Повтори или выйди и войди снова.</Text>
        <BigButton testID="auth-session-retry" label="Повторить" icon="refresh-cw" onPress={auth.retry} />
        <AuthAction testID="auth-session-signout" label="Выйти и войти заново" onPress={leave} />
      </>);
      break;
    default:
      body = (<View style={{ alignItems: 'center', gap: 14 }}>
        <ActivityIndicator color={c.primary} />
        <Text style={[styles.text, { color: c.mutedForeground }]}>{auth.phase === 'signing-out' ? 'Выходим из аккаунта…' : 'Проверяем аккаунт…'}</Text>
      </View>);
  }
  return (
    <View testID={`auth-gate-${auth.phase}`} style={[StyleSheet.absoluteFill, { backgroundColor: c.background, zIndex: 50 }]}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: (Platform.OS === 'web' ? 67 : 48) + 24, paddingBottom: 58, gap: 16, flexGrow: 1, justifyContent: 'center' }}>
        <DemoBadge label="DANCEFLOW · АККАУНТ" />
        {body}
        <AuthError message={leaveError} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: F.display, fontSize: 28, lineHeight: 34 },
  text: { fontFamily: F.body, fontSize: 14, lineHeight: 20 },
});
