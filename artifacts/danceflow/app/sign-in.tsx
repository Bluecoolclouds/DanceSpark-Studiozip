import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { useDanceAuth } from '@/lib/dance-auth';
import { AuthAction, AuthError, AuthFrame, AuthInput, AuthNotice, BigButton, EMAIL_RE, MIGRATION_NOTE, errorText } from '@/components/AuthFrame';

export default function SignInScreen() {
  const auth = useDanceAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const login = async () => {
    if (locked.current) return;
    const address = email.trim();
    if (!EMAIL_RE.test(address)) { setMessage('Введи корректный адрес электронной почты.'); return; }
    locked.current = true; setBusy(true); setMessage('');
    try { await auth.signIn(address, password); router.replace('/studio'); }
    catch (e) { setMessage(errorText(e, 'Не удалось войти. Проверь подключение и попробуй ещё раз.')); }
    finally { locked.current = false; setBusy(false); }
  };
  return (
    <AuthFrame title="Войди в танец" subtitle="Вход защищает твои видео и баланс генераций." other="Нет аккаунта? Зарегистрироваться" href="/sign-up">
      <View style={{ gap: 14 }}>
        <AuthInput label="Электронная почта" testID="signin-email" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
        <AuthInput label="Пароль" testID="signin-password" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoComplete="password" maxLength={128} onSubmitEditing={login} />
        <AuthError message={message} />
        <BigButton testID="signin-submit" label={busy ? 'Входим...' : 'Войти'} onPress={login} disabled={busy || !email || !password || auth.isSignedIn} />
        <AuthAction label="Забыли пароль?" testID="forgot-password" disabled={busy} onPress={() => router.push('/forgot-password')} />
        <AuthNotice testID="signin-migration" title="Пользовались Danceflow раньше?" text={MIGRATION_NOTE} />
      </View>
    </AuthFrame>
  );
}
