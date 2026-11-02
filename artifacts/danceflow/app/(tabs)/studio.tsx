import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bouncy, TemplateCard } from '@/components/ui';
import { F } from '@/constants/fonts';
import { StageBackdrop } from '@/components/stage-backdrop';
import { resolveDraftTemplate } from '@/lib/draft-meta';
import { useCatalogueTemplate } from '@/hooks/useCatalogue';
import { useDance } from '@/context/DanceContext';
import { ColorScope, useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';
import { AccountSubscription } from '@/components/AccountSubscription';
import { AccountCredits } from '@/components/AccountCredits';
import { DraftImage } from '@/components/draft-image';

export default function Studio() {
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
      <View style={[styles.col, { gap: 12 }]}>
        <Text style={[styles.section, { color: c.foreground }]}>Аккаунт</Text>
        <AccountSubscription />
        <AccountCredits />
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
      </View>

      <View style={[styles.col, { marginTop: 28 }]}>
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

      <View style={[styles.col, styles.legalFooter]}>
        <Text style={[styles.section, { color: c.foreground }]}>Документы и поддержка</Text>
        <Text style={[styles.legalIntro, { color: c.mutedForeground }]}>
          Платежи пока отключены. Документы с пометкой «черновик» нужно заполнить до публикации и запуска оплаты.
        </Text>
        <View style={[styles.legalList, { backgroundColor: c.card, borderColor: c.border }]}>
          <LegalLink testID="open-privacy-policy" icon="shield" title="Политика конфиденциальности" subtitle="Обработка и защита персональных данных" onPress={() => router.push('/privacy')} />
          <LegalLink icon="file-text" title="Пользовательское соглашение" subtitle="Правила использования Danceflow" onPress={() => router.push('/legal/terms')} />
          <LegalLink icon="credit-card" title="Оферта и подписка" subtitle="Цены, ежемесячное продление и оплата" onPress={() => router.push('/legal/offer')} />
          <LegalLink icon="rotate-ccw" title="Отмена и возвраты" subtitle="Как прекратить подписку и запросить возврат" onPress={() => router.push('/legal/refunds')} />
          <LegalLink icon="briefcase" title="Реквизиты оператора" subtitle="Кто предоставляет услугу и принимает оплату" onPress={() => router.push('/legal/operator')} />
          <LegalLink icon="mail" title="Поддержка" subtitle="danceflow@meduha.app" onPress={() => {
            void Linking.openURL('mailto:danceflow@meduha.app').catch(() => Alert.alert('Не удалось открыть почту', 'Напиши на danceflow@meduha.app.'));
          }} last />
        </View>
      </View>
    </ScrollView>
    </View>
  );
}

function LegalLink({ icon, title, subtitle, onPress, last = false, testID }: {
  icon: keyof typeof Feather.glyphMap; title: string; subtitle: string; onPress: () => void; last?: boolean; testID?: string;
}) {
  const c = useColors();
  return (
    <Bouncy testID={testID} accessibilityLabel={`${title}. ${subtitle}`} scaleTo={0.99} onPress={onPress}
      style={[styles.legalLink, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <View style={[styles.legalIcon, { backgroundColor: c.muted }]}>
        <Feather name={icon} size={16} color={c.violet} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[styles.legalTitle, { color: c.foreground }]}>{title}</Text>
        <Text style={[styles.legalSubtitle, { color: c.mutedForeground }]}>{subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={c.mutedForeground} />
    </Bouncy>
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
  legalFooter: { marginTop: 28, marginBottom: 24, gap: 10 },
  legalIntro: { fontFamily: F.body, fontSize: 13, lineHeight: 19 },
  legalList: { borderWidth: 1, borderRadius: 20, overflow: 'hidden', paddingHorizontal: 12 },
  legalLink: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  legalIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  legalTitle: { fontFamily: F.bodyBold, fontSize: 13 },
  legalSubtitle: { fontFamily: F.body, fontSize: 11, lineHeight: 15 },
});
