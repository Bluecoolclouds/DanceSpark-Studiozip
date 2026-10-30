import { useSignIn, useAuth } from '@clerk/expo';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { AuthError, AuthFrame, AuthInput, BigButton } from '@/components/AuthFrame';

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { isSignedIn } = useAuth();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const working = fetchStatus === 'fetching';
  const finish = async () => {
    await signIn.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) {
          setMessage('Заверши дополнительную проверку аккаунта и повтори вход.');
          return;
        }
        router.replace('/studio');
      },
    });
  };
  const login = async () => {
    setMessage('');
    try {
      const { error } = await signIn.password({ emailAddress, password });
      if (error) {
        setMessage('Не удалось войти. Проверь почту, пароль и сообщение проверки.');
        return;
      }
      if (signIn.status === 'complete') await finish();
      else if (signIn.status === 'needs_client_trust') {
        const emailCode = signIn.supportedSecondFactors.find((x) => x.strategy === 'email_code');
        if (emailCode) await signIn.mfa.sendEmailCode();
        else setMessage('Для этого аккаунта требуется дополнительная проверка, которая пока недоступна.');
      } else {
        setMessage('Для этого аккаунта требуется дополнительная проверка, которая пока недоступна.');
      }
    } catch {
      setMessage('Не удалось войти. Проверь подключение и попробуй ещё раз.');
    }
  };
  const verify = async () => {
    setMessage('');
    try {
      await signIn.mfa.verifyEmailCode({ code });
      if (signIn.status === 'complete') await finish();
      else setMessage('Проверка не завершена. Попробуй ещё раз.');
    } catch {
      setMessage('Не удалось проверить код.');
    }
  };
  return (
    <AuthFrame title="Войди в танец" subtitle="Вход защищает твои видео и баланс генераций." other="Нет аккаунта? Зарегистрироваться" href="/sign-up">
      {signIn.status === 'needs_client_trust' ? (
        <View style={{ gap: 14 }}>
          <AuthInput label="Код из письма" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" />
          <AuthError message={errors.fields.code?.message || message} />
          <BigButton label={working ? 'Проверяем...' : 'Подтвердить код'} onPress={verify} disabled={working || !code} />
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          <AuthInput label="Электронная почта" value={emailAddress} onChangeText={setEmailAddress} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <AuthInput label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          <AuthError message={errors.fields.identifier?.message || errors.fields.password?.message || message} />
          <BigButton label={working ? 'Входим...' : 'Войти'} onPress={login} disabled={working || !emailAddress || !password || !!isSignedIn} />
        </View>
      )}
    </AuthFrame>
  );
}
