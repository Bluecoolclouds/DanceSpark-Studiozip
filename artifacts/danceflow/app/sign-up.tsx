import { useSignUp } from '@clerk/expo';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { AuthError, AuthFrame, AuthInput, BigButton } from '@/components/AuthFrame';

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const working = fetchStatus === 'fetching';
  const create = async () => {
    setMessage('');
    try {
      const { error } = await signUp.password({ emailAddress, password });
      if (error) {
        setMessage('Не удалось создать аккаунт. Проверь введённые данные и сообщение проверки.');
        return;
      }
      await signUp.verifications.sendEmailCode();
    } catch {
      setMessage('Не удалось отправить код. Проверь подключение и попробуй ещё раз.');
    }
  };
  const verify = async () => {
    setMessage('');
    try {
      await signUp.verifications.verifyEmailCode({ code });
      if (signUp.status === 'complete') {
        await signUp.finalize({
          navigate: ({ session }) => {
            if (session?.currentTask) {
              setMessage('Заверши дополнительную проверку аккаунта.');
              return;
            }
            router.replace('/studio');
          },
        });
      } else setMessage('Регистрация не завершена. Проверь код.');
    } catch {
      setMessage('Не удалось подтвердить код.');
    }
  };
  const waitingForCode = signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields.includes('email_address') && signUp.missingFields.length === 0;
  return (
    <AuthFrame title={waitingForCode ? 'Подтверди почту' : 'Твоя сцена ждёт'} subtitle={waitingForCode ? 'Введи код из письма.' : 'Создай аккаунт, чтобы запускать танцевальные видео.'} other="Уже есть аккаунт? Войти" href="/sign-in">
      {waitingForCode ? (
        <View style={{ gap: 14 }}>
          <AuthInput label="Код из письма" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" />
          <AuthError message={errors.fields.code?.message || message} />
          <BigButton label={working ? 'Проверяем...' : 'Подтвердить'} onPress={verify} disabled={working || !code} />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <AuthInput label="Электронная почта" value={emailAddress} onChangeText={setEmailAddress} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <AuthInput label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <AuthError message={errors.fields.emailAddress?.message || errors.fields.password?.message || message} />
          <BigButton label={working ? 'Создаём аккаунт...' : 'Создать аккаунт'} onPress={create} disabled={working || !emailAddress || !password} />
          <View nativeID="clerk-captcha" />
        </View>
      )}
    </AuthFrame>
  );
}
