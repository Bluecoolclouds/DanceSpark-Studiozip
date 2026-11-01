import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigButton, Bouncy, tone } from '@/components/ui';
import { F } from '@/constants/fonts';
import { SUBSCRIPTION_PLANS, SubscriptionPlanId, formatRub, limitLabel } from '@/constants/subscriptions';
import { useColors } from '@/hooks/useColors';

export default function SubscriptionScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width >= 768;
  const top = Math.max(insets.top, wide ? 24 : 16);
  const [selectedId, setSelectedId] = useState<SubscriptionPlanId>('monthly_25');
  const selected = SUBSCRIPTION_PLANS.find((p) => p.id === selectedId) ?? SUBSCRIPTION_PLANS[0];
  const close = () => router.canGoBack() ? router.back() : router.replace('/studio');

  const content = (
    <View style={[styles.overlay, {
      backgroundColor: c.scrim, justifyContent: wide ? 'center' : 'flex-end',
      paddingTop: top, paddingHorizontal: wide ? 24 : 0, paddingBottom: wide ? Math.max(insets.bottom, 24) : 0,
    }]}>
      <View testID="sub-backdrop" accessible={false} onStartShouldSetResponder={() => true}
        onResponderRelease={close} style={StyleSheet.absoluteFill} />
      <View testID="subscription-dialog" accessibilityViewIsModal
        style={[styles.sheet, {
          backgroundColor: c.background, maxHeight: height - top - (wide ? Math.max(insets.bottom, 24) : 0),
          borderBottomLeftRadius: wide ? 28 : 0, borderBottomRightRadius: wide ? 28 : 0,
        }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kicker, { color: c.primary }]}>ПОДПИСКА · ЕЖЕМЕСЯЧНО</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: c.foreground }]}>Выбери свой <Text style={{ color: c.violet }}>ритм</Text></Text>
          </View>
          <Bouncy testID="sub-back" accessibilityLabel="Закрыть тарифы" onPress={close}
            style={[styles.back, { borderColor: c.border, backgroundColor: c.card }]}>
            <Feather name="x" size={20} color={c.foreground} />
          </Bouncy>
        </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <View style={[styles.notice, { backgroundColor: c.sun, borderColor: c.border }]} accessibilityRole="alert">
          <Feather name="alert-circle" size={20} color={c.foreground} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.noticeTitle, { color: c.foreground }]}>Оплата пока не подключена</Text>
            <Text style={[styles.noticeText, { color: c.foreground }]}>
              Цены ориентировочные. Купить подписку сейчас нельзя: деньги не списываются, подписка не активируется и не продлевается.
            </Text>
          </View>
        </View>

        <View style={{ gap: 12, marginTop: 20 }} accessibilityRole="radiogroup">
          {SUBSCRIPTION_PLANS.map((p) => {
            const on = p.id === selectedId;
            return (
              <Bouncy key={p.id} testID={`plan-${p.id}`} scaleTo={0.97} onPress={() => setSelectedId(p.id)}
                style={[styles.plan, { borderColor: c.border, shadowColor: c.border, backgroundColor: on ? tone(c, p.color) : c.card },
                  on ? styles.planOn : null]}>
                <View accessible accessibilityRole="radio" accessibilityState={{ checked: on }}
                  accessibilityLabel={`${p.name}, ${formatRub(p.monthlyPriceRub)} в месяц, ${limitLabel(p)}`} style={styles.planRow}>
                  <View style={[styles.radio, { borderColor: c.border, backgroundColor: on ? c.foreground : c.card }]}>
                    {on && <Feather name="check" size={14} color={c.card} />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.planName, { color: c.foreground }]} numberOfLines={1}>{p.name}</Text>
                    <View style={styles.limitRow}>
                      <Feather name={p.dailyLimit === null ? 'zap' : 'film'} size={13} color={c.foreground} />
                      <Text style={[styles.limit, { color: c.foreground }]}>{limitLabel(p)}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.price, { color: c.foreground }]}>{formatRub(p.monthlyPriceRub)}</Text>
                    <Text style={[styles.per, { color: c.foreground }]}>в месяц</Text>
                  </View>
                </View>
              </Bouncy>
            );
          })}
        </View>

        <Text style={[styles.terms, { color: c.mutedForeground }]}>Сейчас это только просмотр тарифов: выбор не сохраняется и не даёт доступ к генерациям. Оплата и автопродление не включены. Статус действующей подписки доступен в разделе «Моё».</Text>
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.total}>
          <Text style={[styles.totalName, { color: c.foreground }]}>{selected.name}</Text>
          <Text style={[styles.price, { color: c.foreground }]}>{formatRub(selected.monthlyPriceRub)} / мес</Text>
        </View>
        <Text accessibilityLiveRegion="polite" style={[styles.terms, { color: c.mutedForeground, marginTop: 0 }]}>{limitLabel(selected)}</Text>
        <BigButton testID="sub-buy" label="Оплата скоро" icon="lock" disabled />
      </View>
      </View>
    </View>
  );

  // RN Web's Modal traps focus, handles Escape and restores focus on close.
  // Native already has a transparent stack modal and Android back handling.
  return Platform.OS === 'web'
    ? <Modal visible transparent animationType={wide ? 'fade' : 'slide'} onRequestClose={close}>{content}</Modal>
    : content;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1 },
  back: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  scroll: { flexShrink: 1 },
  scrollContent: { padding: 20 },
  footer: { padding: 20, gap: 10, borderTopWidth: 1 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  totalName: { fontFamily: F.bodyHeavy, fontSize: 16 },
  terms: { fontFamily: F.body, fontSize: 12, lineHeight: 18, marginTop: 18 },
  kicker: { fontFamily: F.bodyHeavy, fontSize: 12 },
  title: { fontFamily: F.display, fontSize: 24, letterSpacing: -1, marginTop: 4 },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 18, borderWidth: 1 },
  noticeTitle: { fontFamily: F.bodyHeavy, fontSize: 14 },
  noticeText: { fontFamily: F.body, fontSize: 13, lineHeight: 18 },
  plan: { borderRadius: 18, borderWidth: 1, padding: 14 },
  planOn: { borderWidth: 2, padding: 13 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  planName: { fontFamily: F.display, fontSize: 18 },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  limit: { fontFamily: F.bodyBold, fontSize: 13, flexShrink: 1 },
  price: { fontFamily: F.display, fontSize: 18 },
  per: { fontFamily: F.bodyBold, fontSize: 11, opacity: 0.8 },
});
