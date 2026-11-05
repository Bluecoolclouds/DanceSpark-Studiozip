import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useDanceAuth } from '@/lib/dance-auth';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/fonts';
import { AuthError, AuthFrame, AuthInput, AuthNotice, BigButton, EMAIL_RE, MIGRATION_NOTE, PASSWORD_MAX, PASSWORD_MIN, errorText } from '@/components/AuthFrame';

export default function SignUpScreen() {
  const auth = useDanceAuth();
  const c = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const create = async () => {
    if (locked.current) return;
    const address = email.trim();
    if (!EMAIL_RE.test(address)) return setMessage('Введи корректный адрес электронной почты.');
    if (password.length < PASSWORD_MIN) return setMessage(`Пароль должен быть не короче ${PASSWORD_MIN} символов.`);
    if (password.length > PASSWORD_MAX) return setMessage(`Пароль должен быть не длиннее ${PASSWORD_MAX} символов.`);
    if (password !== confirmation) return setMessage('Пароли не совпадают.');
    if (!consent) return setMessage('Чтобы создать аккаунт, прими условия и политику конфиденциальности.');
    locked.current = true; setBusy(true); setMessage('');
    try { await auth.signUp(address, password); router.replace('/studio'); }
    catch (e) { setMessage(errorText(e, 'Не удалось создать аккаунт. Проверь подключение и попробуй ещё раз.')); }
    finally { locked.current = false; setBusy(false); }
  };
  const link = { color: c.primary, fontFamily: F.body };
  return (
    <AuthFrame title="Твоя сцена ждёт" subtitle="Создай аккаунт, чтобы запускать танцевальные видео." other="Уже есть аккаунт? Войти" href="/sign-in">
      <View style={{ gap: 14 }}>
        <AuthInput label="Электронная почта" testID="signup-email" value={email} onChangeText={setEmail} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
        <AuthInput label={`Пароль (${PASSWORD_MIN}–${PASSWORD_MAX} символов)`} testID="signup-password" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoComplete="new-password" maxLength={PASSWORD_MAX} />
        <AuthInput label="Повтори пароль" testID="signup-confirm" value={confirmation} onChangeText={setConfirmation} editable={!busy} secureTextEntry autoCapitalize="none" autoComplete="new-password" maxLength={PASSWORD_MAX} />
        <Pressable testID="signup-consent" accessibilityRole="checkbox" accessibilityState={{ checked: consent, disabled: busy }} disabled={busy} onPress={() => setConsent((v) => !v)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: consent ? c.primary : c.border, backgroundColor: consent ? c.primary : c.card, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            {consent && <Feather name="check" size={15} color={c.primaryForeground} />}
          </View>
          <Text style={{ flex: 1, color: c.mutedForeground, fontFamily: F.body, fontSize: 13, lineHeight: 19 }}>
            Я принимаю <Text accessibilityRole="link" style={link} onPress={() => router.push('/legal/terms')}>пользовательское соглашение</Text> и <Text accessibilityRole="link" style={link} onPress={() => router.push('/privacy')}>политику конфиденциальности</Text>.
          </Text>
        </Pressable>
        <AuthError message={message} />
        <BigButton testID="signup-submit" label={busy ? 'Создаём аккаунт...' : 'Создать аккаунт'} onPress={create} disabled={busy || !email || !password || !confirmation || !consent} />
        <AuthNotice testID="signup-unverified" title="Почта не подтверждается" text="Письма пока не отправляются: адрес сохранится как неподтверждённый, а восстановить пароль по почте нельзя. Запомни пароль или сохрани его в менеджере паролей." />
        <AuthNotice title="Уже регистрировались раньше?" text={MIGRATION_NOTE} />
      </View>
    </AuthFrame>
  );
}
