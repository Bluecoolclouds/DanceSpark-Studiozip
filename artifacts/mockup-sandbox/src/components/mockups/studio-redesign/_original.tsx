// Extracted from the real Studio and account components. Only external dependencies are stubbed.
import React, { useState, useCallback } from 'react';
import { Alert, AppState, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from './_native';
import { Feather, Image, Bouncy, EmptyState, Pill, TemplateCard, tone, F, StageBackdrop, resolveDraftTemplate, useCatalogueTemplate, useDance, ColorScope, useColors, colors, DraftImage, useSafeAreaInsets, router, useDanceAuth, useGetAccountSubscription, useFocusEffect, BigButton } from './_stubs';
import './_group.css';
export function OriginalStudio() {
  return <ColorScope.Provider value={colors.neon}><StudioScreen /></ColorScope.Provider>;
}

function StudioScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { favorites, drafts, removeDraft, ready } = useDance();
  const [tab, setTab] = useState<'drafts' | 'favs'>('drafts');
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const cardW = (Math.min(width, 600) - 40 - 14) / 2;

  const confirmDelete = (id: string) => {
    if (Platform.OS === 'web') { removeDraft(id); return; }
    const draft = drafts.find((item) => item.id === id);
    Alert.alert('Удалить черновик?', draft?.savedVideoAssetId
      ? 'Черновик будет удалён. Сохранённая копия в медиатеке останется.'
      : 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removeDraft(id) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
    <StageBackdrop />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: top + 14, paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 20, width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 }}>
        <Text style={[styles.title, { color: c.foreground }]}>Моя <Text style={{ color: c.violet }}>сцена</Text></Text>
        <AccountSubscription />
        <Bouncy testID="open-privacy-policy" accessibilityLabel="Политика конфиденциальности и поддержка" onPress={() => router.push('/privacy')}
          style={[styles.privacyLink, { backgroundColor: c.card, borderColor: c.border }]}>
          <Feather name="shield" size={16} color={c.violet} />
          <Text style={[styles.privacyText, { color: c.foreground }]}>Конфиденциальность и поддержка</Text>
          <Feather name="chevron-right" size={17} color={c.mutedForeground} />
        </Bouncy>
        <View style={styles.stats}>
          <Stat n={drafts.length} label="черновиков" color={c.sun} />
          <Stat n={favorites.length} label="в избранном" color={c.secondary} />
        </View>
        <Bouncy testID="open-subscription" accessibilityLabel="Тарифы подписки" scaleTo={0.97} onPress={() => router.push('/subscription')}
          style={[styles.subEntry, { backgroundColor: c.violet, borderColor: c.border, shadowColor: c.border }]}>
          <View style={styles.subRow}>
            <View style={[styles.subIcon, { backgroundColor: c.sun, borderColor: c.border }]}>
              <Feather name="star" size={18} color={c.foreground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.subTitle, { color: c.primaryForeground }]}>Тарифы подписки</Text>
              <Text numberOfLines={2} style={[styles.subText, { color: c.primaryForeground }]}>Посмотреть цены · оплата скоро</Text>
            </View>
            <Feather name="arrow-right" size={20} color={c.primaryForeground} />
          </View>
        </Bouncy>
      </View>
      <View style={styles.tabs}>
        <Pill label="Черновики" active={tab === 'drafts'} onPress={() => setTab('drafts')} />
        <Pill label="Избранное" active={tab === 'favs'} onPress={() => setTab('favs')} />
      </View>

      {!ready ? (
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {[0, 1].map((i) => <View key={i} style={[styles.skel, { backgroundColor: c.muted }]} />)}
        </View>
      ) : tab === 'drafts' ? (
        drafts.length === 0 ? (
          <EmptyState icon="bookmark" title="Черновиков пока нет" text="Выбери фото и танец — черновик появится здесь." action="Создать" onAction={() => router.push('/create')} />
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 14, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
            {drafts.map((d) => {
              const t = d.templateSnapshot ?? resolveDraftTemplate(d.templateId);
              if (!t) return null;
              return (
                <View key={d.id} style={[styles.draft, { backgroundColor: c.card, borderColor: c.border, shadowColor: c.border }]}>
                  <Bouncy accessibilityLabel={`Открыть черновик: ${t.title}`} scaleTo={0.97} onPress={() => router.push(`/draft/${d.id}`)} style={styles.draftOpen}>
                  <DraftImage uri={d.photoUri} style={[styles.thumb, { borderColor: c.border, backgroundColor: c.muted }]} contentFit="cover" />
                  <Image source={t.image} style={[styles.thumbSmall, { borderColor: c.border }]} contentFit="cover" />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.dTitle, { color: c.foreground }]} numberOfLines={1}>{t.title}</Text>
                    <Text numberOfLines={1} style={[styles.dMeta, { color: c.mutedForeground }]}>{d.duration} сек · {new Date(d.createdAt).toLocaleDateString('ru-RU')}</Text>
                    <View style={[styles.badge, { backgroundColor: tone(c, t.color), borderColor: c.border }]}>
                      <Text style={[styles.badgeText, { color: c.foreground }]}>
                        {d.savedVideoAssetId ? 'СОХРАНЕНО' : d.videoUri ? 'ГОТОВОЕ ВИДЕО' :
                          d.generationStatus === 'uploading' ? 'ПОДГОТОВКА' :
                          d.generationStatus === 'submitting' || d.generationStatus === 'unknown' ? 'ПРОВЕРЯЕМ ЗАПРОС' :
                          d.generationStatus === 'queued' ? 'В ОЧЕРЕДИ' :
                          d.generationStatus === 'processing' ? 'СОЗДАЁТСЯ' :
                          d.generationStatus === 'failed' ? 'ОШИБКА' : 'ЧЕРНОВИК'}
                      </Text>
                    </View>
                  </View>
                  </Bouncy>
                  <Bouncy accessibilityLabel={`Удалить черновик: ${t.title}`} onPress={() => confirmDelete(d.id)} style={[styles.del, { borderColor: c.border }]}>
                    <Feather name="trash-2" size={16} color={c.foreground} />
                  </Bouncy>
                </View>
              );
            })}
          </View>
        )
      ) : favorites.length === 0 ? (
        <EmptyState icon="heart" title="Сердечек пока нет" text="Отмечай танцы в каталоге, чтобы вернуться к ним позже." action="В каталог" onAction={() => router.push('/')} />
      ) : (
        <View style={styles.grid}>
          {favorites.map((id) => <FavoriteTemplate key={id} id={id} width={cardW} />)}
        </View>
      )}
    </ScrollView>
    </View>
  );
}

function FavoriteTemplate({ id, width }: { id: string; width: number }) {
  const query = useCatalogueTemplate(id);
  const c = useColors();
  if (!query.template) return <View style={{ width, padding: 16 }}>
    <Text style={{ color: c.mutedForeground }}>{query.isPending ? 'Загружаем…' : 'Танец недоступен'}</Text>
    {query.isError && <Bouncy onPress={() => void query.refetch()}><Text style={{ color: c.primary }}>Повторить</Text></Bouncy>}
  </View>;
  return <TemplateCard t={query.template} width={width} height={240} onPress={() => router.push(`/template/${id}`)} />;
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  const c = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: color, borderColor: c.border }]}>
      <Text style={[styles.statN, { color: c.foreground }]}>{n}</Text>
      <Text style={[styles.statL, { color: c.foreground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: F.display, fontSize: 34, letterSpacing: -1 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 24, padding: 16 },
  statN: { fontFamily: F.display, fontSize: 30 },
  statL: { fontFamily: F.bodyBold, fontSize: 13 },
  subEntry: { borderRadius: 24, borderWidth: 1, padding: 12, shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  subTitle: { fontFamily: F.displayBold, fontSize: 15 },
  subText: { fontFamily: F.bodyBold, fontSize: 12, opacity: 0.9, marginTop: 2 },
  privacyLink: { minHeight: 52, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  privacyText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginVertical: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  skel: { height: 110, borderRadius: 22 },
  draft: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 22, borderWidth: 1, shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 2 },
  draftOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  thumb: { width: 72, height: 92, borderRadius: 14, borderWidth: 1 },
  thumbSmall: { position: 'absolute', left: 54, top: 52, width: 36, height: 36, borderRadius: 18, borderWidth: 1 },
  dTitle: { fontFamily: F.displayBold, fontSize: 16 },
  dMeta: { fontFamily: F.bodyBold, fontSize: 12 },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  badgeText: { fontFamily: F.bodyHeavy, fontSize: 10 },
  del: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
});

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
    const listener = AppState.addEventListener('change', (state: string) => {
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
    <View testID="account-subscription" style={[accountStyles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={[accountStyles.title, { color: c.foreground }]}>Мой аккаунт</Text>
      {!isLoaded ? <Text style={{ color: c.foreground }}>Загружаем аккаунт…</Text> : !isSignedIn ? (
        <>
          <Text style={[accountStyles.text, { color: c.mutedForeground }]}>Войди, чтобы увидеть подписку. На новом телефоне используй тот же аккаунт — доступ восстановится с сервера.</Text>
          <BigButton testID="account-sign-in" label="Войти / создать аккаунт" onPress={() => router.push('/sign-in')} />
        </>
      ) : (
        <>
          <Text testID="account-email" style={[accountStyles.text, { color: c.foreground }]}>{email ?? 'Аккаунт Danceflow'}</Text>
          <Text testID="subscription-status" accessibilityLiveRegion="polite" style={[accountStyles.text, { color: c.foreground }]}>
            {leaving ? 'Выходим из аккаунта…' : cannotVerify
              ? 'Не удалось подтвердить подписку. Доступ не подтверждён — проверь подключение и обнови статус.'
              : !subscription ? 'Проверяем подписку на сервере…'
              : active ? `Подписка подтверждена: ${planNames[subscription.plan]}\nДействует до ${new Date(subscription.subscriptionUntil!).toLocaleString('ru-RU')}`
              : subscription.status === 'expired' || subscription.status === 'active'
                ? 'Срок подписки истёк. Действующей подписки нет.'
                : 'Действующей подписки нет.'}
          </Text>
          <Text style={[accountStyles.text, { color: c.mutedForeground }]}>Подписка привязана к этому аккаунту, а не к телефону. Просмотр тарифов не меняет доступ.</Text>
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

const accountStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 8, padding: 14, gap: 12, marginVertical: 16 },
  title: { fontFamily: F.display, fontSize: 18 },
  text: { fontFamily: F.body, fontSize: 13, lineHeight: 19 },
});

