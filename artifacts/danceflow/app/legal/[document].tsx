import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bouncy } from '@/components/ui';
import { F } from '@/constants/fonts';
import { SUBSCRIPTION_PLANS, formatRub, limitLabel } from '@/constants/subscriptions';
import { useColors } from '@/hooks/useColors';

const SUPPORT_EMAIL = 'danceflow@meduha.app';

const docs = {
  terms: {
    title: 'Пользовательское соглашение',
    sections: [
      { title: 'Стороны и сведения об операторе', body: 'Укажите полное имя или наименование, организационно-правовой статус, страну регистрации, юридический и фактический адрес, ИНН и контакты оператора.' },
      { title: 'Что предоставляет сервис', body: 'Danceflow помогает создавать танцевальные видео по выбранным пользователем материалам и параметрам. Точный состав бесплатных и платных возможностей, ограничения и порядок предоставления результата требуют подтверждения оператором.' },
      { title: 'Материалы пользователя', body: 'Перед публикацией необходимо описать права пользователя на фото и видео, разрешённые способы использования материалов, правила удаления, жалоб и рассмотрения спорных случаев.' },
      { title: 'Данные и сторонние сервисы', body: 'Обработка персональных данных описывается в отдельной политике конфиденциальности. Укажите актуальные сведения о внешних поставщиках, целях передачи и сроках хранения.' },
      { title: 'Поддержка и претензии', body: `По вопросам сервиса: ${SUPPORT_EMAIL}. Сроки ответа, порядок подачи и рассмотрения претензий должен утвердить оператор.` },
    ],
  },
  offer: {
    title: 'Оферта и подписка',
    sections: [
      { title: 'Пока только проект', body: 'Оплата в приложении не подключена. Выбор тарифа не сохраняется, деньги не списываются, платный доступ не предоставляется.' },
      { title: 'Тарифы в приложении', body: SUBSCRIPTION_PLANS.map((plan) => `${plan.name} — ${formatRub(plan.monthlyPriceRub)} в месяц; ${limitLabel(plan)}.`).join('\n') + '\nЭти цены сейчас ознакомительные. Оператор должен подтвердить цены и лимиты до предложения к оплате.' },
      { title: 'Будущее автопродление', body: 'Планируется ежемесячное автопродление через ЮKassa, но оно пока не действует. До запуска укажите точный интервал и сумму каждого списания, момент начала подписки, способ отключения автопродления и момент прекращения доступа. Согласие на сохранение способа оплаты должно быть отдельным и явным.' },
      { title: 'Сведения продавца', body: 'Укажите данные продавца и юридические сведения до публикации оферты: полное имя/наименование, статус, адрес, страна регистрации, ИНН и контакты.' },
    ],
  },
  refunds: {
    title: 'Отмена и возвраты',
    sections: [
      { title: 'Текущий статус', body: 'Поскольку оплата ещё не подключена, покупок и активного автопродления в приложении нет. Запросить возврат за подписку, оформленную через Danceflow, пока нельзя.' },
      { title: 'Что заполнить до запуска оплаты', body: 'Опишите шаги отключения автопродления, срок, до которого нужно отменить следующее списание, и дату окончания доступа после отмены.' },
      { title: 'Порядок возврата', body: 'Укажите основания и способ подачи запроса, сведения для поиска платежа, сроки рассмотрения и возврата, а также случаи, когда применяются правила платёжного провайдера или законодательства.' },
      { title: 'Обращения', body: `Контакт поддержки: ${SUPPORT_EMAIL}. Подтвердите процедуру и сроки ответа до включения платежей.` },
    ],
  },
  operator: {
    title: 'Реквизиты оператора',
    sections: [
      { title: 'Кто оказывает услугу', body: 'Название сервиса: DanceFlow. Полное официальное наименование юридического лица или ФИО и статус оператора, а также страна регистрации — не указаны.' },
      { title: 'Адрес и налоговые сведения', body: 'Адрес оператора: г. Москва, Пресненская набережная, 6, стр. 2, башня «Империя», 3-й подъезд, офис 4315. ИНН и подтверждение вида адреса (юридический/фактический) нужно добавить.' },
      { title: 'Контакты', body: `Поддержка: ${SUPPORT_EMAIL}. Подтвердите, что этот адрес обслуживается и подходит для обращений пользователей.` },
      { title: 'Для публикации в RuStore', body: 'Сверьте сведения оператора с карточкой приложения и кабинетом разработчика RuStore. Актуальные ссылки на политику конфиденциальности и пользовательское соглашение должны быть доступны пользователям.' },
    ],
  },
} as const;

type LegalDocument = keyof typeof docs;

export default function LegalDocumentScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { document } = useLocalSearchParams<{ document?: string }>();
  const key = document as LegalDocument;
  const doc = docs[key];
  const top = Platform.OS === 'web' ? 67 : insets.top;

  if (!doc) {
    return (
      <View style={[styles.page, { backgroundColor: c.background, paddingTop: top + 12 }]}>
        <Text style={[styles.title, { color: c.foreground }]}>Документ не найден</Text>
        <Bouncy accessibilityLabel="Назад в Моё" onPress={() => router.back()} style={[styles.back, { backgroundColor: c.card, borderColor: c.border }]}>
          <Feather name="arrow-left" size={20} color={c.foreground} />
        </Bouncy>
      </View>
    );
  }

  const contactSupport = () => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() =>
      Alert.alert('Не удалось открыть почту', `Напиши на ${SUPPORT_EMAIL}.`));
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={[styles.page, { paddingTop: top + 12, paddingBottom: 48 }]}>
      <View style={styles.header}>
        <Bouncy accessibilityLabel="Назад в Моё" onPress={() => router.back()} style={[styles.back, { backgroundColor: c.card, borderColor: c.border }]}>
          <Feather name="arrow-left" size={20} color={c.foreground} />
        </Bouncy>
        <Text style={[styles.title, { color: c.foreground }]}>{doc.title}</Text>
      </View>
      <View style={[styles.draftNotice, { backgroundColor: c.sun, borderColor: c.border }]}>
        <Feather name="alert-circle" size={18} color={c.foreground} />
        <Text style={[styles.noticeText, { color: c.foreground }]}>
          Черновик. Не считать готовым юридическим документом и не отправлять в RuStore до заполнения реквизитов и проверки условий.
        </Text>
      </View>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        {doc.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.foreground }]}>{section.title}</Text>
            <Text selectable style={[styles.body, { color: c.mutedForeground }]}>{section.body}</Text>
          </View>
        ))}
      </View>
      <Bouncy accessibilityLabel="Написать в поддержку" onPress={contactSupport} style={[styles.support, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="mail" size={17} color={c.violet} />
        <Text style={[styles.supportText, { color: c.foreground }]}>Поддержка · {SUPPORT_EMAIL}</Text>
        <Feather name="external-link" size={16} color={c.mutedForeground} />
      </Bouncy>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, gap: 16, width: '100%', maxWidth: 680, alignSelf: 'center' },
  header: { gap: 12 },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, borderWidth: 1 },
  title: { fontFamily: F.display, fontSize: 28, letterSpacing: -0.8 },
  draftNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1 },
  noticeText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13, lineHeight: 19 },
  card: { padding: 16, gap: 18, borderRadius: 18, borderWidth: 1 },
  section: { gap: 6 },
  sectionTitle: { fontFamily: F.bodyHeavy, fontSize: 15 },
  body: { fontFamily: F.body, fontSize: 14, lineHeight: 21 },
  support: { minHeight: 54, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  supportText: { flex: 1, minWidth: 0, fontFamily: F.bodyBold, fontSize: 12 },
});
