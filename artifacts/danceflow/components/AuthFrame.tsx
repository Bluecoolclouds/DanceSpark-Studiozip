import React from 'react';
import { Link } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { BigButton, DemoBadge } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/fonts';
import { useDanceAuth } from '@/lib/dance-auth';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

export function AuthFrame({ title, subtitle, children, other, href, recovery = false }: {
  title: string; subtitle: string; children: React.ReactNode; other: string; href: '/sign-in' | '/sign-up'; recovery?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { logtoEnabled } = useDanceAuth();
  return (
    <KeyboardAwareScrollViewCompat bottomOffset={20} style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 24, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 24, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <DemoBadge label="DANCEFLOW · АККАУНТ" />
        <AuthClose />
      </View>
      <Text style={{ fontFamily: F.display, fontSize: 33, color: c.foreground, lineHeight: 39 }}>{title}</Text>
      <Text style={{ fontFamily: F.body, color: c.mutedForeground, fontSize: 15 }}>{subtitle}</Text>
      {children}
      <Link href={logtoEnabled ? { pathname: href, params: { legacy: '1' } } : href} asChild>
        <Text accessibilityRole="link" style={{ fontFamily: F.body, color: c.primary, fontSize: 15, textAlign: 'center', paddingVertical: 15 }}>{other}</Text>
      </Link>
    </KeyboardAwareScrollViewCompat>
  );
}

export function AuthClose() {
  const c = useColors();
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <Pressable testID="auth-close" accessibilityRole="button" accessibilityLabel="Закрыть окно авторизации" onPress={close}
      hitSlop={8} style={{ width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name="x" size={21} color={c.foreground} />
    </Pressable>
  );
}

export function AuthInput({ label, ...props }: TextInputProps & { label: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.foreground, fontFamily: F.body, fontSize: 14 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        {...props}
        style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.foreground }]}
        placeholderTextColor={c.mutedForeground}
      />
    </View>
  );
}

export function AuthAction({ label, onPress, disabled, testID }: {
  label: string; onPress: () => void; disabled?: boolean; testID?: string;
}) {
  const c = useColors();
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={{ paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: c.primary, fontFamily: F.body, fontSize: 15, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export function AuthError({ message }: { message?: string }) {
  const c = useColors();
  return message ? <Text accessibilityRole="alert" style={{ color: c.primary, fontFamily: F.body, fontSize: 14 }}>{message}</Text> : null;
}

export { BigButton };

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 16, minHeight: 52, fontSize: 16 },
});
