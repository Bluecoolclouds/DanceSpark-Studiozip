import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { retryPendingLocalDeletions } from '@/lib/account-local-data';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/fonts';

export function LocalDeletionRecovery({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const retry = () => {
    setState('loading');
    void retryPendingLocalDeletions().then(() => setState('ready'), () => setState('error'));
  };
  useEffect(() => { retry(); }, []);
  if (state === 'ready') return <>{children}</>;
  return <View style={{ flex: 1, backgroundColor: c.background, justifyContent: 'center', padding: 28, gap: 16 }}>
    <Text style={{ fontFamily: F.bodyBold, color: c.foreground }}>
      {state === 'loading' ? 'Проверяем локальную очистку…' : 'Не удалось завершить удаление локальных данных. Освободи место или разреши доступ к хранилищу и повтори.'}
    </Text>
    {state === 'error' && <Pressable accessibilityRole="button" onPress={retry} style={{ backgroundColor: c.sun, borderRadius: 20, padding: 18 }}>
      <Text style={{ fontFamily: F.bodyBold, color: c.foreground }}>Повторить очистку</Text>
    </Pressable>}
  </View>;
}
