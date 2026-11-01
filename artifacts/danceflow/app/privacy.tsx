import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Bouncy } from '@/components/ui';
import { F } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';

const SUPPORT_EMAIL = 'danceflow@meduha.app';
const OPERATOR_ADDRESS = 'г. Москва, Пресненская набережная, 6, стр. 2, башня «Империя», 3-й подъезд, офис 4315';

const sections = [
  {
    title: '1. Оператор',
    paragraphs: [
      'Наименование сервиса: DanceFlow.',
      `Адрес оператора: ${OPERATOR_ADDRESS}.`,
      'Полное официальное наименование юридического лица или ФИО и статус оператора, страна регистрации и ИНН не указаны. До публикации эти сведения нужно подтвердить и добавить.',
    ],
  },
  {
    title: '2. Какие данные обрабатываются',
    paragraphs: [
      '• Данные аккаунта: адрес электронной почты и идентификатор пользователя для входа и связи аккаунта с сервисом (Clerk).',
      '• Данные о работе сервиса: идентификаторы и статусы заданий, выбранная модель или стиль, время создания и завершения, оценка расходов и идентификатор запроса внешнего поставщика.',
      '• Материалы пользователя: выбранные фотографии, видео и текстовый запрос. Черновики и локальные копии сохраняются на устройстве. Материалы, необходимые для генерации, передаются Higgsfield.',
      '• Исходное видео, загруженное для Light Swapper, передаётся в Cloudflare R2, затем приложение читает его для передачи в Higgsfield. Срок автоматического удаления не установлен.',
      '• Результат и ссылка на него могут возвращаться поставщиком генерации; ссылка и статус задания сохраняются в записи задания.',
      '• Для подсчёта популярности карточек каталога приложение может отправлять случайный токен посетителя. Он меняется каждые 7 дней, не связан с аккаунтом, а сервер сохраняет его хеш.',
      '• Камера и медиатека используются с разрешения пользователя для съёмки, выбора фото и видео и сохранения готового видео.',
    ],
  },
  {
    title: '3. Цели обработки',
    paragraphs: [
      'Вход и поддержка аккаунта, сохранение и восстановление заданий, создание видео по запросу пользователя, отображение статуса и результата, контроль доступности генерации, подсчёт популярности карточек каталога и ответы на обращения в поддержку.',
    ],
  },
  {
    title: '4. Внешние поставщики',
    paragraphs: [
      '• Clerk обрабатывает данные для аутентификации.',
      '• Cloudflare R2 хранит исходные видео, отдельно загруженные пользователем для Light Swapper.',
      '• Higgsfield получает фото, видео и параметры генерации; сервис может вернуть результат и идентификатор задания.',
      '• Replit и используемая приложением база данных обеспечивают работу API и хранение аккаунтов и записей заданий.',
      'География хранения, возможная передача данных за пределы России и сроки хранения у этих поставщиков не подтверждены. Их нужно проверить по актуальным договорам и настройкам до публикации.',
    ],
  },
  {
    title: '5. Хранение и удаление',
    paragraphs: [
      'Черновики хранятся локально на устройстве. Удаление черновика удаляет его запись из списка приложения, но автоматическая очистка всех файлов фото и видео не подтверждена.',
      'Для загруженных видео в R2 и серверных записей заданий не подтверждён срок хранения; пользовательское удаление файлов из R2 не реализовано. До публикации оператору нужно установить сроки хранения и удаления, а также проверить очистку локальных файлов, записей базы данных, R2 и данных у поставщиков.',
      `Для доступа, исправления или удаления данных напишите на ${SUPPORT_EMAIL}. Возможность и сроки исполнения таких запросов оператору нужно подтвердить до публикации.`,
    ],
  },
  {
    title: '6. Материалы других людей',
    paragraphs: [
      'Загружайте только материалы, на использование которых у вас есть необходимые права и согласия. Не отправляйте материалы, которые не хотите передавать поставщику генерации.',
    ],
  },
  {
    title: '7. Изменения документа',
    paragraphs: [
      'При изменении состава данных, целей, поставщиков или порядка хранения оператор обновит этот документ и сообщит пользователям об изменениях подходящим способом.',
    ],
  },
] as const;

export default function PrivacyScreen() {
  const c = useColors();
  const { width } = useWindowDimensions();

  const contactSupport = () => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() =>
      Alert.alert('Не удалось открыть почту', `Напиши на ${SUPPORT_EMAIL}.`));
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Bouncy accessibilityLabel="Назад" onPress={() => router.back()} style={[styles.back, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="arrow-left" size={20} color={c.foreground} />
      </Bouncy>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: c.foreground, fontSize: width < 360 ? 21 : 25 }]}>
          Политика конфиденциальности
        </Text>
        <Text style={[styles.version, { color: c.mutedForeground }]}>DanceFlow · версия проекта от 01.11.2026</Text>
      </View>
      <View style={[styles.warning, { backgroundColor: c.sun, borderColor: c.border }]}>
        <Feather name="alert-circle" size={18} color={c.foreground} />
        <Text style={[styles.warningText, { color: c.foreground }]}>
          Проект документа. Название и адрес указаны по данным владельца. До публикации подтвердите полное юридическое имя, статус и ИНН оператора, сроки хранения и сведения о местах обработки данных.
        </Text>
      </View>

      {sections.map((section) => (
        <View key={section.title} style={[styles.sectionCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.sectionTitle, { color: c.foreground }]}>{section.title}</Text>
          {section.paragraphs.map((paragraph, index) => (
            <Text key={index} selectable style={[styles.text, { color: c.mutedForeground }]}>{paragraph}</Text>
          ))}
        </View>
      ))}

      <Bouncy accessibilityLabel={`Написать в поддержку: ${SUPPORT_EMAIL}`} onPress={contactSupport}
        style={[styles.support, { backgroundColor: c.card, borderColor: c.border }]}>
        <Feather name="mail" size={17} color={c.violet} />
        <Text style={[styles.supportText, { color: c.foreground }]}>Контакт для обращений: {SUPPORT_EMAIL}</Text>
        <Feather name="external-link" size={15} color={c.mutedForeground} />
      </Bouncy>
      <Text style={[styles.disclaimer, { color: c.mutedForeground }]}>
        Перед публикацией проверьте документ по фактическим настройкам сервиса и передайте его на юридическую проверку.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: Platform.OS === 'web' ? 67 : 18, paddingHorizontal: 18, paddingBottom: 40, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  back: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, borderWidth: 1 },
  heading: { gap: 5 },
  title: { fontFamily: F.display, letterSpacing: -0.8, lineHeight: 32 },
  version: { fontFamily: F.body, fontSize: 12 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1 },
  warningText: { flex: 1, fontFamily: F.bodyBold, fontSize: 13, lineHeight: 19 },
  sectionCard: { padding: 16, gap: 10, borderRadius: 18, borderWidth: 1 },
  sectionTitle: { fontFamily: F.display, fontSize: 17 },
  text: { fontFamily: F.body, fontSize: 14, lineHeight: 21 },
  support: { minHeight: 54, borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  supportText: { flex: 1, minWidth: 0, fontFamily: F.bodyBold, fontSize: 12 },
  disclaimer: { fontFamily: F.body, fontSize: 12, lineHeight: 18 },
});
