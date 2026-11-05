import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { AuthAction, AuthFrame, AuthNotice, BigButton, MIGRATION_NOTE } from '@/components/AuthFrame';

/** Email reset is unavailable without SMTP. No fake success, only honest routes. */
export default function ForgotPasswordScreen() {
  return (
    <AuthFrame title="Сброс пароля" subtitle="Восстановление по почте сейчас недоступно." other="Нет аккаунта? Зарегистрироваться" href="/sign-up" recovery>
      <View style={{ gap: 14 }}>
        <AuthNotice testID="recovery-unavailable" title="Письма не отправляются" text="Мы не можем прислать ссылку или код для сброса пароля: почта в Danceflow пока не подтверждается. Если пароль утерян, обратись к оператору — он проверит аккаунт и поможет восстановить доступ." />
        <AuthNotice title="Аккаунт из старой системы входа" text={MIGRATION_NOTE} />
        <BigButton testID="recovery-operator" label="Реквизиты оператора" icon="briefcase" onPress={() => router.push('/legal/operator')} />
        <AuthAction label="Вернуться ко входу" testID="recovery-back" onPress={() => router.replace('/sign-in')} />
      </View>
    </AuthFrame>
  );
}
