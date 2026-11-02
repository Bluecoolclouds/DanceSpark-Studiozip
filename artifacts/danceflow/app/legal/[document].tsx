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
      { title: 'Стороны и оператор', body: 'Оператор и продавец сервиса: индивидуальный предприниматель Давыдов Максим Александрович, Россия, ИНН 301711407379. Адрес, ранее сообщённый владельцем: г. Москва, Пресненская набережная, 6, стр. 2, башня «Империя», 3-й подъезд, офис 4315. Вид адреса (регистрации, места деятельности или для корреспонденции) нужно подтвердить до публикации.' },
      { title: 'Что предоставляет сервис', body: 'Danceflow помогает создавать танцевальные видео по выбранным пользователем материалам и параметрам. Сервис предназначен для лиц, достигших 18 лет. Точный состав платных возможностей, цены, ограничения и порядок предоставления результата должны быть утверждены до включения оплаты.' },
      { title: 'Материалы пользователя', body: 'Владелец сервиса подтвердил наличие прав на материалы каталога и используемую музыку. Пользователь должен иметь необходимые права и согласия на загружаемые фото и видео. Для жалобы на материал укажите по адресу поддержки ссылку или описание материала, затронутые права и желаемое действие; приложите подтверждение полномочий, если оно есть. Ответ на обращение предоставляется в течение 14 дней. Порядок обработки жалоб требует юридической проверки.' },
      { title: 'Данные и поставщики', body: 'Данные обрабатываются для входа, сохранения заданий и создания видео; материалы, необходимые для генерации, передаются Higgsfield, а исходное видео Light Swapper хранится в Cloudflare R2. Данные аккаунта для входа обрабатываются Clerk; API и записи заданий работают в инфраструктуре Replit и базе данных. Подробности и известные ограничения указаны в проекте политики конфиденциальности. География всех ресурсов и правовые основания ещё проверяются.' },
      { title: 'Поддержка и претензии', body: `По вопросам сервиса и жалобам: ${SUPPORT_EMAIL}. Оператор ответит в течение 14 дней. До публикации этот порядок должен пройти юридическую проверку.` },
    ],
  },
  offer: {
    title: 'Оферта и подписка',
    sections: [
      { title: 'Пока только проект', body: 'Оплата в приложении не подключена. Выбор тарифа не сохраняется, деньги не списываются, платный доступ не предоставляется.' },
      { title: 'Тарифы в приложении', body: SUBSCRIPTION_PLANS.map((plan) => `${plan.name} — ${formatRub(plan.monthlyPriceRub)} в месяц; ${limitLabel(plan)}.`).join('\n') + '\nЭти цены сейчас ознакомительные. Оператор должен подтвердить цены и лимиты до предложения к оплате.' },
      { title: 'Планируемая подписка', body: 'Выбрано направление: веб и Android в России, ежемесячное автопродление через ЮKassa. Платёжный сценарий не подключён, списания не выполняются, покупка и платный доступ через оплату Danceflow сейчас недоступны. Перед включением продавец должен утвердить точную сумму и дату каждого списания, начало и окончание доступа, отмену автопродления, отдельное согласие пользователя и порядок возврата. Эти условия пока не утверждены и не являются офертой.' },
      { title: 'Сведения продавца', body: 'Оператор и предполагаемый продавец: индивидуальный предприниматель Давыдов Максим Александрович, Россия, ИНН 301711407379. Вид ранее сообщённого адреса требует подтверждения. До публикации проверьте реквизиты и соответствие кабинету RuStore.' },
      { title: 'Возраст', body: 'Сервис предназначен только для лиц, достигших 18 лет. Перед выпуском необходимо подтвердить возрастную категорию и проверить ограничение доступа несовершеннолетних; текущая регистрация сама по себе возраст не проверяет.' },
    ],
  },
  refunds: {
    title: 'Отмена и возвраты',
    sections: [
      { title: 'Текущий статус', body: 'Поскольку оплата ещё не подключена, покупок и активного автопродления в приложении нет. Запросить возврат за подписку, оформленную через Danceflow, пока нельзя.' },
      { title: 'Что заполнить до запуска оплаты', body: 'Оплата и автопродление не подключены. До первой продажи продавец должен утвердить способ отключения автопродления, срок, до которого можно отменить следующее списание, и дату окончания доступа после отмены.' },
      { title: 'Порядок возврата', body: 'Покупок через Danceflow пока нет. Основания, способ подачи, сведения для поиска платежа и сроки рассмотрения и возврата должны быть утверждены продавцом и проверены юристом до включения оплаты.' },
      { title: 'Обращения', body: `Контакт: ${SUPPORT_EMAIL}. Оператор ответит в течение 14 дней. Для запроса укажите дату и сумму платежа, если он был совершён, и приложите доступные сведения для его поиска.` },
    ],
  },
  operator: {
    title: 'Реквизиты оператора',
    sections: [
      { title: 'Кто оказывает услугу', body: 'Индивидуальный предприниматель Давыдов Максим Александрович, Россия, ИНН 301711407379. Сведения предоставлены владельцем и требуют сверки с регистрационными документами и юридической проверки.' },
      { title: 'Адрес', body: 'Адрес, сообщённый владельцем: г. Москва, Пресненская набережная, 6, стр. 2, башня «Империя», 3-й подъезд, офис 4315. Не подтверждено, является ли он адресом регистрации, места деятельности или для корреспонденции; уточнить до публикации.' },
      { title: 'Контакты', body: `Поддержка и обращения: ${SUPPORT_EMAIL}. Срок ответа — в течение 14 дней.` },
      { title: 'Для публикации в RuStore', body: 'Сверьте сведения оператора с карточкой приложения и кабинетом разработчика RuStore. Актуальные ссылки на политику конфиденциальности и пользовательское соглашение должны быть доступны пользователям. Документ остаётся черновиком до проверки адреса, обработки данных, условий оплаты и юридических текстов.' },
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
          Черновик. Не считать готовым юридическим документом и не отправлять в RuStore до сверки реквизитов, проверки обработки данных и утверждения применимых условий.
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
