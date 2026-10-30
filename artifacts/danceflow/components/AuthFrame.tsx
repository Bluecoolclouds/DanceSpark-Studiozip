import React from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { BigButton, DemoBadge } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/fonts';
import { useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { router } from 'expo-router';

WebBrowser.maybeCompleteAuthSession();

function GoogleSignIn() {
  const { startSSOFlow } = useSSO();
  const [working, setWorking] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const login = async () => {
    setWorking(true);
    setMessage('');
    try {
      const result = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({ scheme: 'danceflow' }),
      });
      if (result.createdSessionId && result.setActive) {
        await result.setActive({
          session: result.createdSessionId,
          navigate: ({ session }) => {
            if (session?.currentTask) setMessage('Нужна дополнительная проверка аккаунта.');
            else router.replace('/create');
          },
        });
      } else setMessage('Вход не завершён. Попробуй войти по почте.');
    } catch {
      setMessage('Не удалось войти через Google. Используй почту или попробуй позже.');
    } finally { setWorking(false); }
  };
  return (
    <View style={{ gap: 8 }}>
      <BigButton label={working ? 'Открываем Google...' : 'Продолжить с Google'} onPress={login} disabled={working} />
      <AuthError message={message} />
    </View>
  );
}

export function AuthFrame({ title, subtitle, children, other, href }: {
  title: string; subtitle: string; children: React.ReactNode; other: string; href: '/sign-in' | '/sign-up';
}) {
  const c = useColors();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 90, paddingBottom: 80, gap: 18 }}>
      <DemoBadge label="DANCEFLOW · АККАУНТ" />
      <Text style={{ fontFamily: F.display, fontSize: 33, color: c.foreground, lineHeight: 39 }}>{title}</Text>
      <Text style={{ fontFamily: F.body, color: c.mutedForeground, fontSize: 15 }}>{subtitle}</Text>
      {children}
      <GoogleSignIn />
      <Link href={href} asChild>
        <Text accessibilityRole="link" style={{ fontFamily: F.body, color: c.primary, fontSize: 15, textAlign: 'center', paddingVertical: 15 }}>{other}</Text>
      </Link>
    </ScrollView>
  );
}

export function AuthInput({ label, ...props }: TextInputProps & { label: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.foreground, fontFamily: F.body, fontSize: 14 }}>{label}</Text>
      <TextInput
        {...props}
        style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]}
        placeholderTextColor={c.mutedForeground}
      />
    </View>
  );
}

export function AuthError({ message }: { message?: string }) {
  const c = useColors();
  return message ? <Text accessibilityRole="alert" style={{ color: c.primary, fontFamily: F.body, fontSize: 14 }}>{message}</Text> : null;
}

export { BigButton };

const styles = StyleSheet.create({
  input: { borderWidth: 2, borderRadius: 13, paddingHorizontal: 16, minHeight: 52, fontSize: 16 },
});
