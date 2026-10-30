import React, { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setBaseUrl } from '@workspace/api-client-react';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { ClerkLoaded, ClerkProvider, useAuth } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFonts } from 'expo-font';
import { Unbounded_700Bold, Unbounded_800ExtraBold } from '@expo-google-fonts/unbounded';
import { Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { StatusBar } from 'expo-status-bar';
import { DanceProvider } from '@/context/DanceContext';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
if (!clerkKey) throw new Error('CLERK_PUBLISHABLE_KEY is required for account authentication.');

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function AuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = useAuth();
  const [transportOwner, setTransportOwner] = useState<string | null | undefined>(undefined);
  // A separate cache per identity prevents late requests from an old session
  // from filling the next account's cache, including during sign-out.
  const queryClient = useMemo(() => new QueryClient(), [userId]);
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    setTransportOwner(userId);
    return () => setAuthTokenGetter(null);
  }, [getToken, userId]);
  useEffect(() => {
    return () => {
      void queryClient.cancelQueries();
      queryClient.clear();
    };
  }, [queryClient]);
  // Register the authenticated transport before mounting any account queries.
  if (transportOwner !== userId) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <DanceProvider key={userId ?? 'guest'} ownerId={userId ?? 'guest'}>{children}</DanceProvider>
    </QueryClientProvider>
  );
}

function RootLayoutNav() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, headerBackTitle: 'Назад' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="template/[id]" />
        <Stack.Screen name="draft/[id]" />
        <Stack.Screen name="subscription" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="forgot-password" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Unbounded_700Bold,
    Unbounded_800ExtraBold,
    Manrope_500Medium,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ClerkProvider
      publishableKey={clerkKey}
      tokenCache={tokenCache}
      proxyUrl={process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined}
    >
      <ClerkLoaded>
        <SafeAreaProvider>
          <ErrorBoundary>
              <GestureHandlerRootView>
                <KeyboardProvider>
                  <AuthBridge>
                    <RootLayoutNav />
                  </AuthBridge>
                </KeyboardProvider>
              </GestureHandlerRootView>
          </ErrorBoundary>
        </SafeAreaProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
