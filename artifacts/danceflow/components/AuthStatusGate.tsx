import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { AuthAction, AuthError, BigButton } from '@/components/AuthFrame';
import { DemoBadge } from '@/components/ui';
import { useDanceAuth, type DanceAuthState } from '@/lib/dance-auth';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/fonts';

const LEGACY_ROUTES = ['/sign-in', '/sign-up', '/forgot-password'];

const actionErrors: Record<string, string> = {
  'link-needs-legacy': 'Сначала войди в старый аккаунт — без этого привязка невозможна.',
  'link-rejected': 'Старый вход не подтверждён. Войди в старый аккаунт ещё раз и повтори.',
  'already-linked': 'Один из аккаунтов уже привязан. Выйди и войди тем способом, которым пользовался раньше.',
  'email-taken': 'Аккаунт с этой почтой уже существует. Войди старым способом и привяжи его, а не создавай новый.',
  'email-unverified': 'Сначала подтверди email в Logto, затем войди снова и повтори регистрацию.',
  blocked: 'Этот аккаунт заблокирован. Новый аккаунт создать нельзя.',
  expired: 'Новый вход истёк. Выйди и войди снова.',
  network: 'Не удалось связаться с сервером. Проверь подключение и повтори.',
};

/** Covers the app while identity is unresolved or needs an explicit decision. */
export function AuthStatusGate() {
  const auth = useDanceAuth();
  const pathname = usePathname();
  const loading = ['config-loading', 'loading', 'resolving', 'signing-out'].includes(auth.phase);
  const decision = ['config-error', 'link-required', 'blocked', 'session-error'].includes(auth.phase);
  if (!loading && !decision) return null;
  // Legacy forms must stay usable so the old account can be proven for linking.
  if (auth.phase === 'link-required' && LEGACY_ROUTES.includes(pathname)) return null;
  return <GateScreen auth={auth} />;
}

function GateScreen({ auth }: { auth: DanceAuthState }) {
  const c = useColors();
  const [leaveError, setLeaveError] = useState('');
  const leave = async () => {
    setLeaveError('');
    try { await auth.signOut(); router.replace('/studio'); } catch { setLeaveError('Не удалось выйти. Повтори.'); }
  };
  const oldLogin = () => router.push({ pathname: '/sign-in', params: { legacy: '1' } });
  const card = [styles.card, { backgroundColor: c.card, borderColor: c.border }];
  const label = { fontFamily: F.bodyHeavy, fontSize: 12, color: c.mutedForeground };
  const value = { fontFamily: F.body, fontSize: 15, color: c.foreground };
  let body: React.ReactNode;
  switch (auth.phase) {
    case 'config-error':
      body = (<>
        <Text style={[styles.title, { color: c.foreground }]}>Вход недоступен</Text>
        <Text style={[styles.text, { color: c.mutedForeground }]}>Не удалось загрузить настройки входа. Проверь подключение — мы не будем входить в обход проверки.</Text>
        <BigButton testID="auth-config-retry" label="Повторить" icon="refresh-cw" onPress={auth.retry} />
      </>);
      break;
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
        <Text style={[styles.text, { color: c.mutedForeground }]}>{auth.sessionError === 'expired' ? 'Сеанс входа истёк. Выйди и войди снова.' : 'Не удалось проверить вход. Повтори или выйди, чтобы сменить способ входа.'}</Text>
        <BigButton testID="auth-session-retry" label="Повторить" icon="refresh-cw" onPress={auth.retry} />
        <AuthAction testID="auth-session-signout" label="Выйти и войти заново" onPress={leave} />
      </>);
      break;
    case 'link-required': {
      const m = auth.migration!;
      body = (<>
        <Text style={[styles.title, { color: c.foreground }]}>Перенос аккаунта</Text>
        <Text style={[styles.text, { color: c.mutedForeground }]}>Новый вход ещё не связан с аккаунтом Danceflow. Если ты уже пользовался приложением — привяжи старый аккаунт, чтобы сохранить черновики, подписку и историю.</Text>
        <View style={card}>
          <Text style={label}>Новый вход</Text>
          <Text testID="migration-logto-email" style={value}>{m.logtoEmail ?? 'Почта не указана'}</Text>
        </View>
        <View style={card}>
          <Text style={label}>Старый аккаунт</Text>
          <Text testID="migration-legacy-email" style={value}>{m.legacySignedIn ? (m.legacyEmail ?? 'Аккаунт Danceflow') : 'Вход не выполнен'}</Text>
        </View>
        <AuthError message={m.error ? actionErrors[m.error] : ''} />
        {m.legacySignedIn
          ? <BigButton testID="migration-link" label={m.busy === 'link' ? 'Привязываем…' : 'Привязать старый аккаунт'} icon="link" disabled={!!m.busy} onPress={() => { void m.link(); }} />
          : <BigButton testID="migration-legacy-login" label="Войти в старый аккаунт" icon="log-in" disabled={!!m.busy} onPress={oldLogin} />}
        <View style={[styles.warn, { borderColor: c.border }]}>
          <Text style={[styles.text, { color: c.mutedForeground }]}>Уже есть аккаунт Danceflow? Привяжи его — не создавай новый. Новый аккаунт начнётся с нуля, а этот вход потом нельзя будет перенести на старый аккаунт.</Text>
          <AuthAction testID="migration-register" label={m.busy === 'register' ? 'Создаём…' : 'Я здесь впервые — создать новый аккаунт'} disabled={!!m.busy} onPress={() => { void m.register(); }} />
        </View>
        <AuthAction testID="migration-cancel" label="Отмена — выйти" disabled={!!m.busy} onPress={leave} />
      </>);
      break;
    }
    default:
      body = (<View style={{ alignItems: 'center', gap: 14 }}>
        <ActivityIndicator color={c.primary} />
        <Text style={[styles.text, { color: c.mutedForeground }]}>{auth.phase === 'signing-out' ? 'Выходим из аккаунта…' : auth.phase === 'resolving' ? 'Проверяем аккаунт…' : 'Подключаем вход…'}</Text>
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
  card: { borderWidth: 1, borderRadius: 13, padding: 14, gap: 4 },
  warn: { borderTopWidth: 1, paddingTop: 12, gap: 4 },
});
