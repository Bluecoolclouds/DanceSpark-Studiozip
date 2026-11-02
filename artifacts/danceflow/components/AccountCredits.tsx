import { Feather } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import { AppState, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useGetAccountCredits } from '@workspace/api-client-react';
import { useDanceAuth } from '@/lib/dance-auth';
import { F } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';

export function AccountCredits() {
  const c = useColors();
  const { isLoaded, isSignedIn, userId } = useDanceAuth();
  const enabled = isLoaded && !!isSignedIn && !!userId;
  const query = useGetAccountCredits({
    query: {
      queryKey: ['account-credits', userId],
      enabled,
      retry: false,
      staleTime: 0,
      gcTime: 0,
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

  const credits = enabled && query.data?.accountId === userId ? query.data : null;
  return (
    <View testID="account-daily-credits" style={{
      backgroundColor: c.card, borderColor: c.border, borderWidth: 1,
      borderRadius: 22, padding: 16, gap: 10,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 14, backgroundColor: c.sun, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="zap" size={18} color={c.foreground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontFamily: F.display, fontSize: 16 }}>Дневные кредиты</Text>
          <Text style={{ color: c.mutedForeground, fontFamily: F.body, fontSize: 12 }}>1 кредит = 1 ₽ · обновление по UTC</Text>
        </View>
      </View>
      {!isLoaded ? (
        <Text style={{ color: c.mutedForeground, fontFamily: F.body }}>Проверяем аккаунт…</Text>
      ) : !isSignedIn ? (
        <Text style={{ color: c.mutedForeground, fontFamily: F.body, fontSize: 13, lineHeight: 19 }}>
          Ежедневная выдача доступна зарегистрированным аккаунтам. Гостям кредиты не начисляются.
        </Text>
      ) : query.isError ? (
        <Text accessibilityRole="alert" style={{ color: c.destructive, fontFamily: F.body, fontSize: 13 }}>
          Не удалось проверить баланс. Не запускай генерацию, пока статус не обновится.
        </Text>
      ) : !credits ? (
        <Text style={{ color: c.mutedForeground, fontFamily: F.body }}>Загружаем баланс…</Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <View>
              <Text style={{ color: c.mutedForeground, fontFamily: F.body, fontSize: 12 }}>Доступно сейчас</Text>
              <Text testID="credits-available" style={{ color: c.foreground, fontFamily: F.display, fontSize: 28 }}>
                {credits.availableCredits.toLocaleString('ru-RU')}
                <Text style={{ color: c.mutedForeground, fontFamily: F.bodyBold, fontSize: 13 }}> / {credits.grantedCredits.toLocaleString('ru-RU')} кр.</Text>
              </Text>
            </View>
            <Text style={{ color: c.mutedForeground, fontFamily: F.body, fontSize: 11 }}>
              {credits.utcDay}
            </Text>
          </View>
          <Text style={{ color: c.mutedForeground, fontFamily: F.body, fontSize: 12, lineHeight: 17 }}>
            {credits.reservedCredits > 0 ? `${credits.reservedCredits.toLocaleString('ru-RU')} кр. зарезервировано за незавершённые запросы. ` : ''}
            Неиспользованный остаток сгорит {new Date(credits.resetAt).toLocaleString('ru-RU')}. Подписчикам дневные кредиты тоже начисляются.
          </Text>
          <Text style={{ color: c.mutedForeground, fontFamily: F.body, fontSize: 11, lineHeight: 16 }}>
            Бесплатные единицы для генераций: не продаются, не передаются и не выводятся в деньги.
          </Text>
        </>
      )}
    </View>
  );
}
