import { useAuth, useSignIn } from '@clerk/expo';
import { Redirect, router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AuthAction, AuthError, AuthFrame, AuthInput, BigButton } from '@/components/AuthFrame';
import { recoveryError } from '@/lib/recovery-errors';

type Step = 'email' | 'code' | 'password' | 'mfa' | 'complete';
type Factor = 'email_code' | 'totp' | 'backup_code';

export default function ForgotPasswordScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const { isSignedIn } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [factor, setFactor] = useState<Factor>('totp');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const locked = useRef(false);
  const working = busy || fetchStatus === 'fetching';

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Clerk Core v3 returns errors instead of necessarily throwing them.
  const checked = async (operation: Promise<{ error: unknown }>) => {
    const result = await operation;
    if (result.error) throw result.error;
  };
  const run = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    setNotice('');
    try { await action(); }
    catch (error) { setMessage(recoveryError(error)); }
    finally { locked.current = false; setBusy(false); }
  };

  const finalize = async () => {
    await checked(signIn.finalize({
      navigate: ({ session }) => {
        if (session?.currentTask) {
          setMessage('Пароль изменён, но аккаунт требует дополнительной проверки. Вернись на экран входа, чтобы продолжить.');
          return;
        }
        router.replace('/studio');
      },
    }));
  };

  const afterPassword = async () => {
    if (signIn.status === 'complete') {
      setStep('complete');
      await finalize();
    } else if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
      setStep('mfa');
      const factors = signIn.supportedSecondFactors;
      if (factors.some((f) => f.strategy === 'email_code')) {
        setFactor('email_code');
        await checked(signIn.mfa.sendEmailCode());
        setCooldown(60);
        setNotice('Для завершения входа отправлен дополнительный код из письма.');
      } else if (factors.some((f) => f.strategy === 'totp')) {
        setFactor('totp');
      } else if (factors.some((f) => f.strategy === 'backup_code')) {
        setFactor('backup_code');
      } else {
        setMessage('Пароль изменён. Для дополнительной проверки используй привычный способ входа. Проверка не отключена.');
      }
    } else {
      setStep('complete');
      setMessage('Пароль изменён, но вход не завершён. Вернись на экран входа и используй новый пароль.');
    }
  };

  const send = () => run(async () => {
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setMessage('Введи корректный адрес электронной почты.');
      return;
    }
    await checked(signIn.reset());
    await checked(signIn.create({ identifier: address }));
    await checked(signIn.resetPasswordEmailCode.sendCode());
    setEmail(address);
    setCode('');
    setStep('code');
    setCooldown(60);
    setNotice('Код отправлен на почту аккаунта. Проверь также папку «Спам».');
  });
  const resend = () => run(async () => {
    if (cooldown) return;
    if (step === 'mfa') await checked(signIn.mfa.sendEmailCode());
    else await checked(signIn.resetPasswordEmailCode.sendCode());
    setCode('');
    setCooldown(60);
    setNotice('Новый код отправлен. Используй последнее письмо.');
  });
  const verify = () => run(async () => {
    await checked(signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() }));
    if (signIn.status !== 'needs_new_password') {
      setMessage('Код не подтверждён. Начни восстановление заново.');
      return;
    }
    setCode('');
    setStep('password');
  });
  const save = () => run(async () => {
    if (password !== confirmation) { setMessage('Пароли не совпадают. Введи одинаковый пароль в обоих полях.'); return; }
    if (password.length < 8) { setMessage('Используй пароль не короче 8 символов.'); return; }
    // Only reset the existing sign-in identity. Never sign up or send email to our API.
    await checked(signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true }));
    setPassword('');
    setConfirmation('');
    await afterPassword();
  });
  const verifyMfa = () => run(async () => {
    if (factor === 'email_code') await checked(signIn.mfa.verifyEmailCode({ code: code.trim() }));
    else if (factor === 'backup_code') await checked(signIn.mfa.verifyBackupCode({ code: code.trim() }));
    else await checked(signIn.mfa.verifyTOTP({ code: code.trim() }));
    if (signIn.status === 'complete') { setCode(''); setStep('complete'); await finalize(); }
    else setMessage('Дополнительная проверка не завершена. Проверь код.');
  });
  const restart = () => run(async () => {
    await checked(signIn.reset());
    setStep('email');
    setCode('');
    setPassword('');
    setConfirmation('');
  });

  if (isSignedIn) return <Redirect href="/studio" />;
  const subtitle = {
    email: 'Укажи почту своего аккаунта. Подписка останется привязана к нему. Если входили через Google, пароль восстанавливать не нужно.',
    code: `Введи код из письма для ${email}. Никому его не сообщай.`,
    password: 'Придумай новый пароль. После смены пароля другие устройства выйдут из аккаунта.',
    mfa: 'Пароль изменён. Подтверди дополнительную проверку аккаунта.',
    complete: 'Пароль изменён. Заверши вход в свой прежний аккаунт.',
  }[step];
  return (
    <AuthFrame title="Восстановить доступ" subtitle={subtitle} recovery other="Вернуться ко входу" href="/sign-in">
      <View style={{ gap: 14 }}>
        {step === 'email' && <>
          <AuthInput label="Электронная почта" testID="recovery-email" value={email} onChangeText={setEmail} editable={!working} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
          <BigButton label={working ? 'Отправляем...' : 'Получить код'} onPress={send} disabled={working || !email.trim()} />
        </>}
        {step === 'code' && <>
          <AuthInput label="Код из письма" testID="recovery-code" value={code} onChangeText={setCode} editable={!working} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
          <BigButton label={working ? 'Проверяем...' : 'Подтвердить код'} onPress={verify} disabled={working || !/^\d{6}$/.test(code.trim())} />
        </>}
        {step === 'password' && <>
          <AuthInput label="Новый пароль" testID="recovery-password" value={password} onChangeText={setPassword} editable={!working} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" />
          <AuthInput label="Повтори новый пароль" testID="recovery-confirm" value={confirmation} onChangeText={setConfirmation} editable={!working} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" />
          <BigButton label={working ? 'Сохраняем...' : 'Сохранить пароль и войти'} onPress={save} disabled={working || !password || !confirmation} />
        </>}
        {step === 'mfa' && <>
          <AuthInput label={factor === 'email_code' ? 'Дополнительный код из письма' : factor === 'backup_code' ? 'Резервный код' : 'Код из приложения-аутентификатора'} value={code} onChangeText={setCode} editable={!working} autoCapitalize="none" autoCorrect={false} autoComplete="one-time-code" />
          <BigButton label={working ? 'Проверяем...' : 'Завершить вход'} onPress={verifyMfa} disabled={working || !code.trim()} />
          {factor !== 'backup_code' && signIn.supportedSecondFactors.some((f) => f.strategy === 'backup_code') &&
            <AuthAction label="Использовать резервный код" disabled={working} onPress={() => { setFactor('backup_code'); setCode(''); setMessage(''); }} />}
        </>}
        {step === 'complete' && signIn.status === 'complete' &&
          <BigButton label={working ? 'Входим...' : 'Завершить вход'} onPress={() => run(finalize)} disabled={working} />}
        <AuthError message={message} />
        <AuthError message={notice} />
        {(step === 'code' || (step === 'mfa' && factor === 'email_code')) &&
          <AuthAction label={cooldown ? `Отправить снова через ${cooldown} с` : 'Отправить код снова'} testID="recovery-resend" onPress={resend} disabled={working || cooldown > 0} />}
        {step !== 'email' && step !== 'complete' &&
          <AuthAction label="Начать заново" testID="recovery-restart" onPress={restart} disabled={working} />}
      </View>
    </AuthFrame>
  );
}
