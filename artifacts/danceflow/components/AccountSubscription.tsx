import React, { useCallback, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useDanceAuth } from '@/lib/dance-auth';
import { useGetAccountSubscription } from '@workspace/api-client-react';
import { router, useFocusEffect } from 'expo-router';
import { BigButton } from '@/components/ui';
import { F } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';

const planNames = { none: 'Без подписки', warmup: 'Разминка', dancefloor: 'Танцпол', stage: 'Сцена' };

/** Read-only account access. Choosing an offer never changes this server state. */
export function AccountSubscription() {
  const c = useColors();
  const { isLoaded, isSignedIn, userId, email, signOut, source, logtoEnabled, signInWithLogto } = useDanceAuth();
  const [leaving, setLeaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const enabled = isLoaded && !!isSignedIn && !leaving;
  const query = useGetAccountSubscription({
    query: {
      queryKey: ['account-subscription', userId],
      enabled,
      staleTime: 0,
      gcTime: 0,
      retry: false,
      refetchInterval: enabled ? 30_000 : false,
    },
  });
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    void query.refetch();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void query.refetch();
    });
    return () => listener.remove();
  }, [enabled, query.refetch]));

  // Never render another user's result, even during an in-flight account switch.
  const subscription = enabled && !query.isError && query.data?.accountId === userId ? query.data : null;
  const cannotVerify = query.isError || (!!query.data && query.data.accountId !== userId);
  const active = subscription?.status === 'active' && !!subscription.subscriptionUntil &&
    new Date(subscription.subscriptionUntil).getTime() > Date.now();
  const logout = async () => {
    setLeaving(true);
    setSignOutError('');
    try {
      await signOut();
      router.replace('/studio');
    } catch {
      setLeaving(false);
      setSignOutError('Не удалось выйти. Проверь подключение и повтори.');
    }
  };
  const connectLogto = async () => {
    setConnecting(true);
    setSignOutError('');
    try { await signInWithLogto(); }
    catch { setConnecting(false); setSignOutError('Не удалось открыть новый вход. Проверь подключение и повтори.'); }
  };

  return (
    <View testID="account-subscription" style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[styles.title, { color: c.foreground }]}>Мой аккаунт</Text>
      {!isLoaded ? <Text style={{ color: c.foreground }}>Загружаем аккаунт…</Text> : !isSignedIn ? (
        <>
          <Text style={[styles.text, { color: c.mutedForeground }]}>Войди, чтобы увидеть подписку. На новом телефоне используй тот же аккаунт — доступ восстановится с сервера.</Text>
          <BigButton testID="account-sign-in" label="Войти / создать аккаунт" onPress={() => router.push('/sign-in')} />
        </>
      ) : (
        <>
          <Text testID="account-email" style={[styles.text, { color: c.foreground }]}>{email ?? 'Аккаунт Danceflow'}</Text>
          <Text testID="subscription-status" accessibilityLiveRegion="polite" style={[styles.text, { color: c.foreground }]}>
            {leaving ? 'Выходим из аккаунта…' : cannotVerify
              ? 'Не удалось подтвердить подписку. Доступ не подтверждён — проверь подключение и обнови статус.'
              : !subscription ? 'Проверяем подписку на сервере…'
              : active ? `Подписка подтверждена: ${planNames[subscription.plan]}\nДействует до ${new Date(subscription.subscriptionUntil!).toLocaleString('ru-RU')}`
              : subscription.status === 'expired' || subscription.status === 'active'
                ? 'Срок подписки истёк. Действующей подписки нет.'
                : 'Действующей подписки нет.'}
          </Text>
          <Text style={[styles.text, { color: c.mutedForeground }]}>Подписка привязана к этому аккаунту, а не к телефону. Просмотр тарифов не меняет доступ.</Text>
          <BigButton testID="subscription-refresh" label={query.isFetching ? 'Проверяем…' : 'Обновить статус'} disabled={query.isFetching || leaving} onPress={() => { void query.refetch(); }} />
          {logtoEnabled && source === 'clerk' && (
            <BigButton testID="account-connect-logto" label={connecting ? 'Открываем вход…' : 'Подключить вход Logto'} disabled={connecting || leaving} onPress={connectLogto} />
          )}
          {!!signOutError && <Text accessibilityRole="alert" style={{ color: c.foreground }}>{signOutError}</Text>}
          <BigButton testID="account-sign-out" label="Выйти из аккаунта" disabled={leaving} onPress={logout} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 12, marginVertical: 16 },
  title: { fontFamily: F.display, fontSize: 18 },
  text: { fontFamily: F.body, fontSize: 13, lineHeight: 19 },
});
