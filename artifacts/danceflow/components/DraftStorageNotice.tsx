import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { F } from '@/constants/fonts';
import { useDance } from '@/context/DanceContext';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function DraftStorageNotice() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const {
    draftStorageIssue,
    retryDraftRead,
    retryDraftSave,
    replaceCorruptDrafts,
  } = useDance();
  const [busy, setBusy] = useState(false);

  if (!draftStorageIssue) return null;

  const message = draftStorageIssue === 'write'
    ? 'Не удалось сохранить черновики. Изменения могут пропасть после перезапуска.'
    : draftStorageIssue === 'corrupt'
      ? 'Данные черновиков повреждены. Исходные данные не изменены.'
      : 'Не удалось прочитать черновики. Исходные данные не изменены.';

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (draftStorageIssue === 'write') await retryDraftSave();
      else await retryDraftRead();
    } finally {
      setBusy(false);
    }
  };

  const confirmReplacement = () => {
    const replace = () => {
      setBusy(true);
      void replaceCorruptDrafts().finally(() => setBusy(false));
    };
    const title = 'Заменить повреждённые данные?';
    const text = 'Сохранённые на устройстве данные черновиков будут заменены текущим списком. Это действие нельзя отменить.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`${title}\n\n${text}`)) replace();
      return;
    }
    Alert.alert(title, text, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Заменить', style: 'destructive', onPress: replace },
    ]);
  };

  return (
    <View
      accessibilityRole="alert"
      testID="draft-storage-notice"
      style={[
        styles.notice,
        {
          top: Platform.OS === 'web' ? 70 : insets.top + 8,
          backgroundColor: c.sun,
          borderColor: c.border,
          shadowColor: c.border,
        },
      ]}
    >
      <Text style={[styles.message, { color: c.foreground }]}>{message}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          testID="retry-draft-storage"
          disabled={busy}
          onPress={() => void retry()}
          style={[styles.button, { backgroundColor: c.card, borderColor: c.border }]}
        >
          <Text style={[styles.buttonText, { color: c.foreground }]}>
            {draftStorageIssue === 'write' ? 'Повторить сохранение' : 'Повторить чтение'}
          </Text>
        </Pressable>
        {draftStorageIssue === 'corrupt' && (
          <Pressable
            accessibilityRole="button"
            testID="confirm-replace-damaged-drafts"
            disabled={busy}
            onPress={confirmReplacement}
            style={[styles.button, { backgroundColor: c.primary, borderColor: c.border }]}
          >
            <Text style={[styles.buttonText, { color: c.primaryForeground }]}>Заменить данные</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: 'absolute',
    zIndex: 1000,
    left: 14,
    right: 14,
    padding: 12,
    borderWidth: 2,
    borderRadius: 14,
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 8,
    gap: 8,
  },
  message: { fontFamily: F.bodyBold, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  buttonText: { fontFamily: F.bodyHeavy, fontSize: 12 },
});
