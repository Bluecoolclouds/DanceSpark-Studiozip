import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAccountDeletion, requestAccountDeletion } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { Bouncy } from '@/components/ui';
import { useDanceAuth } from '@/lib/dance-auth';
import { useDance } from '@/context/DanceContext';
import { F } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';

export default function AccountDeletionScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { userId, isSignedIn, isLoaded, signOut } = useDanceAuth();
  const { eraseAccountData, ownerId } = useDance();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const currentOwner = useRef(userId);
  currentOwner.current = userId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const status = useQuery({
    queryKey: ['account-deletion', userId],
    queryFn: ({ signal }) => getAccountDeletion({ signal }),
    enabled: !!isSignedIn && isLoaded,
    retry: false,
    staleTime: 0,
  });
  const requested = accepted || (!!status.data && status.data.status !== 'not_requested');

  async function finishLocalCleanup(capturedOwner: string) {
    // The closure always cleans its original owner, even if authentication changes.
    await eraseAccountData();
    if (!mounted.current || currentOwner.current !== capturedOwner) return;
    await signOut();
    if (mounted.current && currentOwner.current === capturedOwner) router.replace('/studio');
  }
  async function submit() {
    if (!userId || ownerId !== userId || busy || (!requested && confirmation !== 'УДАЛИТЬ')) return;
    const capturedOwner = userId;
    setBusy(true); setError('');
    let serverAccepted = requested;
    try {
      if (!serverAccepted) {
        const result = await requestAccountDeletion({ confirmation: 'УДАЛИТЬ' });
        serverAccepted = result.status !== 'not_requested';
        if (!serverAccepted) throw new Error('unconfirmed');
        if (mounted.current && currentOwner.current === capturedOwner) setAccepted(true);
      }
      await finishLocalCleanup(capturedOwner);
    } catch (cause) {
      if (!mounted.current || currentOwner.current !== capturedOwner) return;
      const message = (cause as { data?: { error?: unknown } })?.data?.error;
      setError(serverAccepted
        ? 'Запрос принят сервером, но локальная очистка или выход не завершены. Нажми кнопку ещё раз. Сервер продолжит удаление самостоятельно.'
        : typeof message === 'string' ? message : 'Сервер не подтвердил запрос. Обнови статус; удаление могло уже начаться. Не считаем его завершённым.');
      void status.refetch();
    } finally {
      if (mounted.current && currentOwner.current === capturedOwner) setBusy(false);
    }
  }
  return (
    <ScrollView testID="account-deletion-screen" style={{ backgroundColor: c.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36, paddingHorizontal: 20, gap: 20, width: '100%', maxWidth: 560, alignSelf: 'center' }}
      keyboardShouldPersistTaps="handled">
      <Bouncy accessibilityLabel="Назад в Моё" disabled={busy} onPress={() => router.replace('/studio')} style={styles.back}>
        <Feather name="arrow-left" color={c.foreground} size={22} /><Text style={{ fontFamily: F.bodyBold, color: c.foreground }}>Моё</Text>
      </Bouncy>
      <Text style={[styles.title, { color: c.foreground }]}>Удаление аккаунта</Text>
      {!isLoaded ? <Text style={{ color: c.mutedForeground }}>Проверяем вход…</Text> : !isSignedIn ? <>
        <Text style={[styles.body, { color: c.foreground }]}>Для удаления нужен вход в свой аккаунт. Если ты уже отправил запрос, сервер продолжит очистку независимо от выхода из приложения. Выход сам по себе не подтверждает завершение удаления.</Text>
        <Bouncy onPress={() => router.push('/sign-in')} style={[styles.button, { backgroundColor: c.sun }]}>
          <Text style={[styles.buttonText, { color: c.foreground }]}>Войти</Text>
        </Bouncy>
      </> : <>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Feather name={requested ? 'clock' : 'alert-triangle'} size={25} color={c.foreground} />
          <Text style={[styles.heading, { color: c.foreground }]}>{requested ? 'Запрос принят, очистка продолжается' : 'Это нельзя отменить'}</Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>
            {requested
              ? 'Новые генерации отключены. Сервер удалит личные исходники из R2, записи заданий и аккаунт Clerk. При временной ошибке он повторит очистку; это ещё не подтверждение полного удаления.'
              : 'Будут удалены аккаунт Clerk, личные исходники в R2, задания и ссылки на результаты, избранное и локальные копии черновиков на этом устройстве. Доступ по подписке будет утрачен. Удаление не является возвратом платежа.'}
          </Text>
          <Text style={[styles.body, { color: c.mutedForeground }]}>Скачанные в галерею файлы остаются у тебя. Копии на других устройствах нужно очистить отдельно. Удаление уже переданных материалов у Higgsfield регулируется его правилами и не подтверждается этой кнопкой. Обезличенные дневные суммы расходов не содержат идентификаторов аккаунта.</Text>
          {!requested && <Text style={[styles.body, { color: c.mutedForeground }]}>Дождись завершения активных генераций. Задания с неизвестным результатом сначала нужно проверить через статус или поддержку. Последнему администратору сначала нужно назначить замену.</Text>}
        </View>
        {status.isError && !requested && <View accessibilityRole="alert" style={{ gap: 10 }}>
          <Text style={[styles.body, { color: c.foreground }]}>Не удалось проверить состояние удаления.</Text>
          <Bouncy disabled={busy || status.isFetching} onPress={() => { void status.refetch(); }} style={[styles.button, { backgroundColor: c.muted }]}>
            <Text style={[styles.buttonText, { color: c.foreground }]}>Обновить статус</Text>
          </Bouncy>
        </View>}
        {!requested && <>
          <Text style={[styles.body, { color: c.foreground }]}>Для подтверждения введи УДАЛИТЬ</Text>
          <TextInput testID="account-deletion-confirmation" accessibilityLabel="Введи УДАЛИТЬ для подтверждения"
            value={confirmation} onChangeText={setConfirmation} editable={!busy} autoCapitalize="characters" autoCorrect={false}
            placeholder="УДАЛИТЬ" placeholderTextColor={c.mutedForeground}
            style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]} />
        </>}
        {!!error && <Text testID="account-deletion-error" accessibilityRole="alert" style={[styles.body, { color: c.foreground }]}>{error}</Text>}
        <Bouncy testID="account-deletion-submit" accessibilityLabel={requested ? 'Очистить данные на устройстве и выйти' : 'Удалить мой аккаунт навсегда'}
          disabled={busy || (!requested && (confirmation !== 'УДАЛИТЬ' || status.isPending || status.isError))}
          onPress={submit} style={[styles.button, { backgroundColor: requested ? c.sun : c.foreground }]}>
          <Text style={[styles.buttonText, { color: requested ? c.foreground : c.card }]}>
            {busy ? 'Подтверждаем запрос…' : requested ? 'Очистить данные на устройстве и выйти' : 'Удалить аккаунт навсегда'}
          </Text>
        </Bouncy>
        <Text style={[styles.small, { color: c.mutedForeground }]}>Вопросы и контроль завершения: danceflow@meduha.app. Сервер повторяет незавершённую очистку автоматически. Оплата сейчас не подключена; перед её запуском удаление должно быть связано с отменой автопродления.</Text>
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, alignSelf: 'flex-start' },
  title: { fontFamily: F.display, fontSize: 23, lineHeight: 32 },
  heading: { fontFamily: F.bodyHeavy, fontSize: 17, lineHeight: 25 },
  body: { fontFamily: F.body, fontSize: 14, lineHeight: 22 },
  small: { fontFamily: F.body, fontSize: 12, lineHeight: 19 },
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 14 },
  input: { borderWidth: 1, borderRadius: 15, minHeight: 54, paddingHorizontal: 16, fontFamily: F.bodyBold, fontSize: 16 },
  button: { borderRadius: 22, minHeight: 54, padding: 16, justifyContent: 'center', alignItems: 'center' },
  buttonText: { fontFamily: F.bodyHeavy, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
