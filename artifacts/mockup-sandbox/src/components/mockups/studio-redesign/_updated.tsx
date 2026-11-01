// Visual snapshot of implemented Studio. Only external effects/data are stubbed.
import React, { useState, useCallback } from 'react';
import { Alert, AppState, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from './_native';
import { Feather, Image, Bouncy, TemplateCard, F, StageBackdrop, resolveDraftTemplate, useCatalogueTemplate, useDance, ColorScope, useColors, colors, DraftImage, useSafeAreaInsets, router, useDanceAuth, useGetAccountSubscription, useFocusEffect } from './_stubs';
import './_group.css';
export function UpdatedStudio() {
  return <ColorScope.Provider value={colors.neon}><StudioScreen /></ColorScope.Provider>;
}

const fmtCount = (n: number) => (n > 999 ? '999+' : String(n));

function StudioScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { favorites, drafts, removeDraft, ready } = useDance();
  const [tab, setTab] = useState<'drafts' | 'favs'>('drafts');
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const cardW = (Math.min(width, 600) - 40 - 12) / 2;

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
      <View style={styles.col}>
        <View style={styles.hero}>
          <Text style={[styles.kicker, { color: c.tint }]}>Твоя личная студия</Text>
          <Text style={[styles.title, { color: c.foreground }]}>Моя <Text style={{ color: c.violet }}>сцена</Text></Text>
          <Text style={[styles.lead, { color: c.mutedForeground }]}>Черновики танцев, любимые движения и аккаунт — всё в одном месте.</Text>
        </View>

        <View style={styles.stats}>
          <Stat n={drafts.length} label="черновиков" icon="film" bg={c.sun} rotate="-2deg" onPress={() => setTab('drafts')} />
          <Stat n={favorites.length} label="в избранном" icon="heart" bg={c.accent} rotate="1.5deg" onPress={() => setTab('favs')} />
        </View>

        <Bouncy accessibilityLabel="Создать новый танец" scaleTo={0.97} haptic="medium" onPress={() => router.push('/create')}
          style={[styles.create, { backgroundColor: c.primary, shadowColor: c.primary }]}>
          <View style={[styles.createIcon, { backgroundColor: c.sun }]}>
            <Feather name="plus" size={22} color={c.foreground} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.createTitle, { color: c.primaryForeground }]}>Новый танец</Text>
            <Text numberOfLines={2} style={[styles.createText, { color: c.primaryForeground }]}>Фото + движение = видео</Text>
          </View>
          <Feather name="arrow-right" size={20} color={c.primaryForeground} />
        </Bouncy>
      </View>

      <View style={[styles.col, { marginTop: 28 }]}>
        <View style={[styles.segment, { backgroundColor: c.muted }]}>
          {(['drafts', 'favs'] as const).map((k) => {
            const on = tab === k;
            const n = k === 'drafts' ? drafts.length : favorites.length;
            return (
              <Bouncy key={k} accessibilityLabel={k === 'drafts' ? 'Черновики' : 'Избранное'} accessibilityState={{ selected: on }} scaleTo={0.95}
                onPress={() => setTab(k)} style={[styles.segBtn, on && { backgroundColor: c.card, shadowColor: c.violet }]}>
                <Text numberOfLines={1} style={[styles.segText, { color: on ? c.foreground : c.mutedForeground }]}>{k === 'drafts' ? 'Черновики' : 'Избранное'}</Text>
                <View style={[styles.segCount, { backgroundColor: on ? c.sun : c.card }]}>
                  <Text style={[styles.segCountText, { color: c.foreground }]}>{fmtCount(n)}</Text>
                </View>
              </Bouncy>
            );
          })}
        </View>
      </View>

      <View style={[styles.col, { marginTop: 16 }]}>
      {!ready ? (
        <View style={{ gap: 12 }}>
          {[0, 1].map((i) => <View key={i} style={[styles.skel, { backgroundColor: c.muted }]} />)}
        </View>
      ) : tab === 'drafts' ? (
        drafts.length === 0 ? (
          <Empty icon="film" title="Черновиков пока нет" text="Выбери фото и танец — черновик появится здесь и будет ждать на этом устройстве." action="Создать" onAction={() => router.push('/create')} />
        ) : (
          <View style={{ gap: 12 }}>
            {drafts.map((d) => {
              const t = d.templateSnapshot ?? resolveDraftTemplate(d.templateId);
              if (!t) return null;
              const st = d.savedVideoAssetId ? { l: 'Сохранено', bg: c.sun, i: 'check' as const } : d.videoUri ? { l: 'Готовое видео', bg: c.sun, i: 'play' as const } :
                d.generationStatus === 'uploading' ? { l: 'Подготовка', bg: c.secondary, i: 'upload' as const } :
                d.generationStatus === 'submitting' || d.generationStatus === 'unknown' ? { l: 'Проверяем запрос', bg: c.secondary, i: 'clock' as const } :
                d.generationStatus === 'queued' ? { l: 'В очереди', bg: c.secondary, i: 'clock' as const } :
                d.generationStatus === 'processing' ? { l: 'Создаётся', bg: c.secondary, i: 'loader' as const } :
                d.generationStatus === 'failed' ? { l: 'Ошибка', bg: c.accent, i: 'alert-triangle' as const } : { l: 'Черновик', bg: c.muted, i: 'edit-3' as const };
              return (
                <View key={d.id} style={[styles.draft, { backgroundColor: c.card, borderColor: c.border, shadowColor: c.violet }]}>
                  <Bouncy accessibilityLabel={`Открыть черновик: ${t.title}`} scaleTo={0.97} onPress={() => router.push(`/draft/${d.id}`)} style={styles.draftOpen}>
                    <View style={styles.thumbWrap}>
                      <DraftImage uri={d.photoUri} style={[styles.thumb, { backgroundColor: c.muted }]} contentFit="cover" />
                      <Image source={t.image} style={[styles.thumbSmall, { borderColor: c.card }]} contentFit="cover" />
                    </View>
                    <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
                      <Text style={[styles.dTitle, { color: c.foreground }]} numberOfLines={1}>{t.title}</Text>
                      <Text numberOfLines={1} style={[styles.dMeta, { color: c.mutedForeground }]}>{d.duration} сек · {new Date(d.createdAt).toLocaleDateString('ru-RU')}</Text>
                      <View style={[styles.badge, { backgroundColor: st.bg }]}>
                        <Feather name={st.i} size={11} color={c.foreground} />
                        <Text numberOfLines={1} style={[styles.badgeText, { color: c.foreground }]}>{st.l}</Text>
                      </View>
                    </View>
                  </Bouncy>
                  <Bouncy accessibilityLabel={`Удалить черновик: ${t.title}`} onPress={() => confirmDelete(d.id)} style={[styles.del, { borderColor: c.border }]}>
                    <Feather name="trash-2" size={16} color={c.mutedForeground} />
                  </Bouncy>
                </View>
              );
            })}
          </View>
        )
      ) : favorites.length === 0 ? (
        <Empty icon="heart" title="Сердечек пока нет" text="Отмечай танцы в каталоге, чтобы вернуться к ним позже." action="В каталог" onAction={() => router.push('/')} />
      ) : (
        <View style={styles.grid}>
          {favorites.map((id) => <FavoriteTemplate key={id} id={id} width={cardW} />)}
        </View>
      )}
      </View>

      <View style={[styles.col, { marginTop: 32, gap: 12 }]}>
        <Text style={[styles.section, { color: c.foreground }]}>Аккаунт</Text>
        <AccountSubscription />
        <Bouncy testID="open-subscription" accessibilityLabel="Тарифы подписки" scaleTo={0.97} onPress={() => router.push('/subscription')}
          style={[styles.subEntry, { backgroundColor: c.violet, shadowColor: c.violet }]}>
          <View style={[styles.subIcon, { backgroundColor: c.sun }]}>
            <Feather name="star" size={18} color={c.foreground} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.subTitle, { color: c.primaryForeground }]}>Тарифы подписки</Text>
            <Text numberOfLines={2} style={[styles.subText, { color: c.primaryForeground }]}>Посмотреть цены · оплата скоро</Text>
          </View>
          <Feather name="arrow-right" size={20} color={c.primaryForeground} />
        </Bouncy>
        <Bouncy testID="open-privacy-policy" accessibilityLabel="Политика конфиденциальности и поддержка" scaleTo={0.97} onPress={() => router.push('/privacy')}
          style={[styles.privacyLink, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.privIcon, { backgroundColor: c.muted }]}><Feather name="shield" size={15} color={c.violet} /></View>
          <Text style={[styles.privacyText, { color: c.foreground }]}>Конфиденциальность и поддержка</Text>
          <Feather name="chevron-right" size={17} color={c.mutedForeground} />
        </Bouncy>
      </View>
    </ScrollView>
    </View>
  );
}

function Empty({ icon, title, text, action, onAction }: { icon: keyof typeof Feather.glyphMap; title: string; text: string; action: string; onAction: () => void }) {
  const c = useColors();
  return (
    <View style={[styles.empty, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.emptyArt}>
        <View style={[styles.emptyBlob, { backgroundColor: c.sun, transform: [{ rotate: '-10deg' }] }]} />
        <View style={[styles.emptyBlob2, { backgroundColor: c.accent, transform: [{ rotate: '12deg' }] }]} />
        <View style={[styles.emptyIcon, { backgroundColor: c.primary }]}><Feather name={icon} size={24} color={c.primaryForeground} /></View>
      </View>
      <Text style={[styles.emptyTitle, { color: c.foreground }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: c.mutedForeground }]}>{text}</Text>
      <Bouncy accessibilityLabel={action} haptic="medium" scaleTo={0.95} onPress={onAction} style={[styles.emptyBtn, { backgroundColor: c.sun }]}>
        <Text style={[styles.emptyBtnText, { color: c.foreground }]}>{action}</Text>
        <Feather name="arrow-right" size={16} color={c.foreground} />
      </Bouncy>
    </View>
  );
}

function FavoriteTemplate({ id, width }: { id: string; width: number }) {
  const query = useCatalogueTemplate(id);
  const c = useColors();
  if (!query.template) return (
    <View style={[styles.favFallback, { width, backgroundColor: c.card, borderColor: c.border }]}>
      <Feather name={query.isPending ? 'loader' : 'cloud-off'} size={20} color={c.mutedForeground} />
      <Text style={[styles.dMeta, { color: c.mutedForeground, textAlign: 'center' }]}>{query.isPending ? 'Загружаем…' : 'Танец недоступен'}</Text>
      {query.isError && (
        <Bouncy accessibilityLabel="Повторить" onPress={() => void query.refetch()} style={[styles.retry, { backgroundColor: c.sun }]}>
          <Text style={[styles.badgeText, { color: c.foreground }]}>Повторить</Text>
        </Bouncy>
      )}
    </View>
  );
  return <TemplateCard t={query.template} width={width} height={240} onPress={() => router.push(`/template/${id}`)} />;
}

function Stat({ n, label, icon, bg, rotate, onPress }: { n: number; label: string; icon: keyof typeof Feather.glyphMap; bg: string; rotate: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Bouncy accessibilityLabel={`${n} ${label}`} scaleTo={0.94} onPress={onPress} style={[styles.stat, { backgroundColor: bg, transform: [{ rotate }] }]}>
      <Feather name={icon} size={16} color={c.foreground} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[styles.statN, { color: c.foreground }]}>{fmtCount(n)}</Text>
      <Text numberOfLines={1} style={[styles.statL, { color: c.foreground }]}>{label}</Text>
    </Bouncy>
  );
}

const styles = StyleSheet.create({
  col: { paddingHorizontal: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  hero: { gap: 4, marginBottom: 18 },
  kicker: { fontFamily: F.bodyHeavy, fontSize: 13 },
  title: { fontFamily: F.display, fontSize: 34, letterSpacing: -1 },
  lead: { fontFamily: F.body, fontSize: 14, lineHeight: 20, marginTop: 4 },
  section: { fontFamily: F.display, fontSize: 22 },
  stats: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  stat: { flex: 1, minWidth: 0, borderRadius: 26, padding: 16, gap: 2 },
  statN: { fontFamily: F.display, fontSize: 34, marginTop: 6 },
  statL: { fontFamily: F.bodyBold, fontSize: 13 },
  create: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 28, padding: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 18, elevation: 4 },
  createIcon: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  createTitle: { fontFamily: F.display, fontSize: 17 },
  createText: { fontFamily: F.bodyBold, fontSize: 13, opacity: 0.9, marginTop: 2 },
  segment: { flexDirection: 'row', borderRadius: 999, padding: 5, gap: 4 },
  segBtn: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
  segText: { fontFamily: F.bodyHeavy, fontSize: 14, flexShrink: 1 },
  segCount: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, minWidth: 22, alignItems: 'center' },
  segCountText: { fontFamily: F.bodyHeavy, fontSize: 11 },
  skel: { height: 116, borderRadius: 24 },
  draft: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 24, borderWidth: 1, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 1 },
  draftOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0 },
  thumbWrap: { width: 84, height: 96 },
  thumb: { width: 72, height: 96, borderRadius: 16 },
  thumbSmall: { position: 'absolute', right: 0, bottom: -2, width: 38, height: 38, borderRadius: 19, borderWidth: 3 },
  dTitle: { fontFamily: F.displayBold, fontSize: 16 },
  dMeta: { fontFamily: F.bodyBold, fontSize: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginTop: 2 },
  badgeText: { fontFamily: F.bodyHeavy, fontSize: 11, flexShrink: 1 },
  del: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  favFallback: { height: 240, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14 },
  retry: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  empty: { borderRadius: 28, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8 },
  emptyArt: { width: 96, height: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyBlob: { position: 'absolute', left: 6, top: 8, width: 54, height: 54, borderRadius: 18 },
  emptyBlob2: { position: 'absolute', right: 6, bottom: 4, width: 40, height: 40, borderRadius: 20 },
  emptyIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: F.displayBold, fontSize: 17, textAlign: 'center' },
  emptyText: { fontFamily: F.body, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 6, maxWidth: 320 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 20, minHeight: 46 },
  emptyBtnText: { fontFamily: F.display, fontSize: 14 },
  subEntry: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 26, padding: 14, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 18, elevation: 3 },
  subIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '8deg' }] },
  subTitle: { fontFamily: F.displayBold, fontSize: 15 },
  subText: { fontFamily: F.bodyBold, fontSize: 12, opacity: 0.9, marginTop: 2 },
  privacyLink: { minHeight: 54, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  privIcon: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  privacyText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13 },
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

  // Presentation-only derivation of the status chip.
  const chip = leaving ? { label: 'Выходим', icon: 'log-out' as const, bg: c.muted }
    : cannotVerify ? { label: 'Не подтверждено', icon: 'alert-triangle' as const, bg: c.accent }
    : !subscription ? { label: 'Проверяем', icon: 'loader' as const, bg: c.muted }
    : active ? { label: planNames[subscription.plan], icon: 'star' as const, bg: c.sun }
    : { label: 'Без подписки', icon: 'circle' as const, bg: c.secondary };
  const initial = (email ?? 'D').trim().charAt(0).toUpperCase() || 'D';

  return (
    <View testID="account-subscription" style={[accountStyles.card, { backgroundColor: c.card, borderColor: c.border, shadowColor: c.violet }]}>
      {!isLoaded ? (
        <View style={accountStyles.row}>
          <View style={[accountStyles.avatar, { backgroundColor: c.muted }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[accountStyles.skelLine, { width: '60%', backgroundColor: c.muted }]} />
            <Text style={[accountStyles.muted, { color: c.mutedForeground }]}>Загружаем аккаунт…</Text>
          </View>
        </View>
      ) : !isSignedIn ? (
        <>
          <View style={accountStyles.row}>
            <View style={[accountStyles.avatar, { backgroundColor: c.sun, transform: [{ rotate: '-6deg' }] }]}>
              <Feather name="user" size={22} color={c.foreground} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[accountStyles.kicker, { color: c.tint }]}>Ты здесь как гость</Text>
              <Text style={[accountStyles.title, { color: c.foreground }]}>Аккаунт</Text>
            </View>
          </View>
          <Text style={[accountStyles.body, { color: c.mutedForeground }]}>Войди, чтобы видеть статус подписки. На новом телефоне используй тот же аккаунт — доступ восстановится с сервера. Черновики хранятся на этом устройстве.</Text>
          <Bouncy testID="account-sign-in" accessibilityLabel="Войти / создать аккаунт" haptic="medium" scaleTo={0.96} onPress={() => router.push('/sign-in')}
            style={[accountStyles.primary, { backgroundColor: c.primary }]}>
            <Text style={[accountStyles.primaryText, { color: c.primaryForeground }]}>Войти / создать аккаунт</Text>
            <Feather name="arrow-right" size={18} color={c.primaryForeground} />
          </Bouncy>
        </>
      ) : (
        <>
          <View style={accountStyles.row}>
            <View style={[accountStyles.avatar, { backgroundColor: c.primary, transform: [{ rotate: '-6deg' }] }]}>
              <Text style={[accountStyles.initial, { color: c.primaryForeground }]}>{initial}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[accountStyles.kicker, { color: c.tint }]}>Мой аккаунт</Text>
              <Text testID="account-email" style={[accountStyles.email, { color: c.foreground }]}>{email ?? 'Аккаунт Danceflow'}</Text>
            </View>
          </View>
          <View style={[accountStyles.statusBox, { backgroundColor: c.background, borderColor: c.border }]}>
            <View style={[accountStyles.chip, { backgroundColor: chip.bg }]}>
              <Feather name={chip.icon} size={12} color={c.foreground} />
              <Text numberOfLines={1} style={[accountStyles.chipText, { color: c.foreground }]}>{chip.label}</Text>
            </View>
            <Text testID="subscription-status" accessibilityLiveRegion="polite" style={[accountStyles.body, { color: c.foreground }]}>
              {leaving ? 'Выходим из аккаунта…' : cannotVerify
                ? 'Не удалось подтвердить подписку. Доступ не подтверждён — проверь подключение и обнови статус.'
                : !subscription ? 'Проверяем подписку на сервере…'
                : active ? `Подписка подтверждена: ${planNames[subscription.plan]}\nДействует до ${new Date(subscription.subscriptionUntil!).toLocaleString('ru-RU')}`
                : subscription.status === 'expired' || subscription.status === 'active'
                  ? 'Срок подписки истёк. Действующей подписки нет.'
                  : 'Действующей подписки нет.'}
            </Text>
            <Text style={[accountStyles.note, { color: c.mutedForeground }]}>Подписка привязана к этому аккаунту, а не к телефону. Просмотр тарифов не меняет доступ.</Text>
          </View>
          {!!signOutError && (
            <View accessibilityRole="alert" style={[accountStyles.error, { backgroundColor: c.accent, borderColor: c.border }]}>
              <Feather name="alert-circle" size={16} color={c.destructive} />
              <Text style={[accountStyles.body, { color: c.foreground, flex: 1 }]}>{signOutError}</Text>
            </View>
          )}
          <View style={accountStyles.actions}>
            <Bouncy testID="subscription-refresh" accessibilityLabel="Обновить статус" disabled={query.isFetching || leaving} scaleTo={0.95} onPress={() => { void query.refetch(); }}
              style={[accountStyles.action, { backgroundColor: c.secondary }]}>
              <Feather name="refresh-cw" size={15} color={c.foreground} />
              <Text style={[accountStyles.actionText, { color: c.foreground }]}>{query.isFetching ? 'Проверяем…' : 'Обновить статус'}</Text>
            </Bouncy>
            <Bouncy testID="account-sign-out" accessibilityLabel="Выйти из аккаунта" disabled={leaving} scaleTo={0.95} onPress={logout}
              style={[accountStyles.action, { backgroundColor: 'transparent', borderColor: c.border, borderWidth: 1 }]}>
              <Feather name="log-out" size={15} color={c.foreground} />
              <Text style={[accountStyles.actionText, { color: c.foreground }]}>Выйти из аккаунта</Text>
            </Bouncy>
          </View>
          {logtoEnabled && source === 'clerk' && (
            <Bouncy testID="account-connect-logto" accessibilityLabel="Подключить вход Logto" disabled={connecting || leaving} scaleTo={0.96} onPress={connectLogto}
              style={[accountStyles.action, { backgroundColor: c.muted, flex: 0 }]}>
              <Feather name="key" size={15} color={c.violet} />
              <Text numberOfLines={1} style={[accountStyles.actionText, { color: c.foreground }]}>{connecting ? 'Открываем вход…' : 'Подключить вход Logto'}</Text>
            </Bouncy>
          )}
        </>
      )}
    </View>
  );
}

const accountStyles = StyleSheet.create({
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

