import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BigButton, Bouncy, tone } from '@/components/ui';
import { F } from '@/constants/fonts';
import { SUBSCRIPTION_PLANS, SubscriptionPlanId, formatRub, limitLabel } from '@/constants/subscriptions';
import { useColors } from '@/hooks/useColors';
import { AccountSubscription } from '@/components/AccountSubscription';

export default function SubscriptionScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom;
  const [selectedId, setSelectedId] = useState<SubscriptionPlanId>('monthly_25');
  const selected = SUBSCRIPTION_PLANS.find((p) => p.id === selectedId) ?? SUBSCRIPTION_PLANS[0];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ paddingTop: top + 10, paddingBottom: bottom + 40, paddingHorizontal: 20, maxWidth: 600, width: '100%', alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
        <Bouncy testID="sub-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/studio'))}
          style={[styles.back, { borderColor: c.border, backgroundColor: c.card }]}>
          <Feather name="arrow-left" size={20} color={c.foreground} accessibilityLabel="Назад" />
        </Bouncy>

        <Text style={[styles.kicker, { color: c.primary }]}>ПОДПИСКА · ЕЖЕМЕСЯЧНО</Text>
        <Text style={[styles.title, { color: c.foreground }]}>Выбери свой <Text style={{ color: c.violet }}>ритм</Text></Text>
        <Text style={[styles.lead, { color: c.mutedForeground }]}>Тарифы отличаются только дневным лимитом генераций.</Text>
        <AccountSubscription />

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

        <View style={[styles.summary, { backgroundColor: c.stage, borderColor: c.border }]}>
          <Text style={[styles.sumKicker, { color: c.accent }]}>ВЫБРАННЫЙ ТАРИФ</Text>
          <Text style={[styles.sumName, { color: c.stageForeground }]}>{selected.name}</Text>
          <View style={[styles.sumLine, { borderColor: c.stageForeground }]}>
            <Text style={[styles.sumLabel, { color: c.stageForeground }]}>Лимит</Text>
            <Text style={[styles.sumVal, { color: c.stageForeground }]}>{limitLabel(selected)}</Text>
          </View>
          <View style={[styles.sumLine, { borderColor: c.stageForeground }]}>
            <Text style={[styles.sumLabel, { color: c.stageForeground }]}>Цена</Text>
            <Text style={[styles.sumVal, { color: c.stageForeground }]}>{formatRub(selected.monthlyPriceRub)} / мес</Text>
          </View>
          <Text style={[styles.sumNote, { color: c.stageForeground }]}>Это только просмотр предложения. Выбор не сохраняется и не даёт доступ к тарифу.</Text>
        </View>

        <View style={{ marginTop: 18 }}>
          <BigButton testID="sub-buy" label="Оплата скоро" icon="lock" disabled />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  kicker: { fontFamily: F.bodyHeavy, fontSize: 12 },
  title: { fontFamily: F.display, fontSize: 30, letterSpacing: -1, marginTop: 4 },
  lead: { fontFamily: F.body, fontSize: 14, lineHeight: 20, marginTop: 6 },
  notice: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 8, borderWidth: 1, marginTop: 18 },
  noticeTitle: { fontFamily: F.bodyHeavy, fontSize: 14 },
  noticeText: { fontFamily: F.body, fontSize: 13, lineHeight: 18 },
  plan: { borderRadius: 8, borderWidth: 1, padding: 14, shadowOffset: { width: 2, height: 3 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 2 },
  planOn: { borderWidth: 1, shadowOffset: { width: 4, height: 5 }, transform: [{ rotate: '-1deg' }] },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  planName: { fontFamily: F.display, fontSize: 18 },
  limitRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  limit: { fontFamily: F.bodyBold, fontSize: 13, flexShrink: 1 },
  price: { fontFamily: F.display, fontSize: 18 },
  per: { fontFamily: F.bodyBold, fontSize: 11, opacity: 0.8 },
  summary: { marginTop: 22, borderRadius: 8, borderWidth: 1, padding: 16, gap: 8 },
  sumKicker: { fontFamily: F.bodyHeavy, fontSize: 11 },
  sumName: { fontFamily: F.display, fontSize: 24 },
  sumLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, paddingTop: 8 },
  sumLabel: { fontFamily: F.bodyBold, fontSize: 13, opacity: 0.75 },
  sumVal: { fontFamily: F.bodyHeavy, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  sumNote: { fontFamily: F.body, fontSize: 12, lineHeight: 17, opacity: 0.8, marginTop: 4 },
});
