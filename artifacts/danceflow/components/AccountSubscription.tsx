import { Feather } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useDanceAuth } from '@/lib/dance-auth';
import { useGetAccountSubscription } from '@workspace/api-client-react';
import { router, useFocusEffect } from 'expo-router';
import { Bouncy } from '@/components/ui';
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

  // Presentation-only derivation of the status chip.
  const chip = leaving ? { label: 'Выходим', icon: 'log-out' as const, bg: c.muted }
    : cannotVerify ? { label: 'Не подтверждено', icon: 'alert-triangle' as const, bg: c.accent }
    : !subscription ? { label: 'Проверяем', icon: 'loader' as const, bg: c.muted }
    : active ? { label: planNames[subscription.plan], icon: 'star' as const, bg: c.sun }
    : { label: 'Без подписки', icon: 'circle' as const, bg: c.secondary };
  const initial = (email ?? 'D').trim().charAt(0).toUpperCase() || 'D';

  return (
    <View testID="account-subscription" style={[styles.card, { backgroundColor: c.card, borderColor: c.border, shadowColor: c.violet }]}>
      {!isLoaded ? (
        <View style={styles.row}>
          <View style={[styles.avatar, { backgroundColor: c.muted }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.skelLine, { width: '60%', backgroundColor: c.muted }]} />
            <Text style={[styles.muted, { color: c.mutedForeground }]}>Загружаем аккаунт…</Text>
          </View>
        </View>
      ) : !isSignedIn ? (
        <>
          <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: c.sun, transform: [{ rotate: '-6deg' }] }]}>
              <Feather name="user" size={22} color={c.foreground} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kicker, { color: c.tint }]}>Ты здесь как гость</Text>
              <Text style={[styles.title, { color: c.foreground }]}>Аккаунт</Text>
            </View>
          </View>
          <Text style={[styles.body, { color: c.mutedForeground }]}>Войди, чтобы видеть статус подписки. На новом телефоне используй тот же аккаунт — доступ восстановится с сервера. Черновики хранятся на этом устройстве.</Text>
          <Bouncy testID="account-sign-in" accessibilityLabel="Войти / создать аккаунт" haptic="medium" scaleTo={0.96} onPress={() => router.push('/sign-in')}
            style={[styles.primary, { backgroundColor: c.primary }]}>
            <Text style={[styles.primaryText, { color: c.primaryForeground }]}>Войти / создать аккаунт</Text>
            <Feather name="arrow-right" size={18} color={c.primaryForeground} />
          </Bouncy>
        </>
      ) : (
        <>
          <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: c.primary, transform: [{ rotate: '-6deg' }] }]}>
              <Text style={[styles.initial, { color: c.primaryForeground }]}>{initial}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kicker, { color: c.tint }]}>Мой аккаунт</Text>
              <Text testID="account-email" style={[styles.email, { color: c.foreground }]}>{email ?? 'Аккаунт Danceflow'}</Text>
            </View>
          </View>
          <View style={[styles.statusBox, { backgroundColor: c.background, borderColor: c.border }]}>
            <View style={[styles.chip, { backgroundColor: chip.bg }]}>
              <Feather name={chip.icon} size={12} color={c.foreground} />
              <Text numberOfLines={1} style={[styles.chipText, { color: c.foreground }]}>{chip.label}</Text>
            </View>
            <Text testID="subscription-status" accessibilityLiveRegion="polite" style={[styles.body, { color: c.foreground }]}>
              {leaving ? 'Выходим из аккаунта…' : cannotVerify
                ? 'Не удалось подтвердить подписку. Доступ не подтверждён — проверь подключение и обнови статус.'
                : !subscription ? 'Проверяем подписку на сервере…'
                : active ? `Подписка подтверждена: ${planNames[subscription.plan]}\nДействует до ${new Date(subscription.subscriptionUntil!).toLocaleString('ru-RU')}`
                : subscription.status === 'expired' || subscription.status === 'active'
                  ? 'Срок подписки истёк. Действующей подписки нет.'
                  : 'Действующей подписки нет.'}
            </Text>
            <Text style={[styles.note, { color: c.mutedForeground }]}>Подписка привязана к этому аккаунту, а не к телефону. Просмотр тарифов не меняет доступ.</Text>
          </View>
          {!!signOutError && (
            <View accessibilityRole="alert" style={[styles.error, { backgroundColor: c.accent, borderColor: c.border }]}>
              <Feather name="alert-circle" size={16} color={c.destructive} />
              <Text style={[styles.body, { color: c.foreground, flex: 1 }]}>{signOutError}</Text>
            </View>
          )}
          <View style={styles.actions}>
            <Bouncy testID="subscription-refresh" accessibilityLabel="Обновить статус" disabled={query.isFetching || leaving} scaleTo={0.95} onPress={() => { void query.refetch(); }}
              style={[styles.action, { backgroundColor: c.secondary }]}>
              <Feather name="refresh-cw" size={15} color={c.foreground} />
              <Text style={[styles.actionText, { color: c.foreground }]}>{query.isFetching ? 'Проверяем…' : 'Обновить статус'}</Text>
            </Bouncy>
            <Bouncy testID="account-sign-out" accessibilityLabel="Выйти из аккаунта" disabled={leaving} scaleTo={0.95} onPress={logout}
              style={[styles.action, { backgroundColor: 'transparent', borderColor: c.border, borderWidth: 1 }]}>
              <Feather name="log-out" size={15} color={c.foreground} />
              <Text style={[styles.actionText, { color: c.foreground }]}>Выйти из аккаунта</Text>
            </Bouncy>
          </View>
          {logtoEnabled && source === 'clerk' && (
            <Bouncy testID="account-connect-logto" accessibilityLabel="Подключить вход Logto" disabled={connecting || leaving} scaleTo={0.96} onPress={connectLogto}
              style={[styles.action, { backgroundColor: c.muted, flex: 0 }]}>
              <Feather name="key" size={15} color={c.violet} />
              <Text numberOfLines={1} style={[styles.actionText, { color: c.foreground }]}>{connecting ? 'Открываем вход…' : 'Подключить вход Logto'}</Text>
            </Bouncy>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 28, padding: 16, gap: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 22, elevation: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: F.display, fontSize: 20 },
  kicker: { fontFamily: F.bodyHeavy, fontSize: 12 },
  title: { fontFamily: F.display, fontSize: 20 },
  email: { fontFamily: F.bodyBold, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  body: { fontFamily: F.body, fontSize: 13, lineHeight: 19 },
  muted: { fontFamily: F.bodyBold, fontSize: 13 },
  note: { fontFamily: F.body, fontSize: 12, lineHeight: 17 },
  skelLine: { height: 14, borderRadius: 7 },
  statusBox: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: F.bodyHeavy, fontSize: 12, flexShrink: 1 },
  error: { flexDirection: 'row', gap: 8, alignItems: 'center', borderWidth: 1, borderRadius: 16, padding: 12 },
  actions: { gap: 10 },
  action: { minHeight: 46, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontFamily: F.bodyHeavy, fontSize: 13, flexShrink: 1, textAlign: 'center' },
  primary: { minHeight: 54, borderRadius: 999, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { fontFamily: F.display, fontSize: 14, flexShrink: 1, textAlign: 'center' },
});
