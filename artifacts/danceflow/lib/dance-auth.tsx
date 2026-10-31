/**
 * Native auth: forwards Clerk untouched. Must not import Logto browser code;
 * the type-only import below is erased at build time.
 */
import React, { useCallback, useMemo } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/expo';
import type { DanceAuthState } from '@workspace/auth-web';

export type { DanceAuthState };

export function DanceAuthBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useDanceAuth(): DanceAuthState {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const signOut = useCallback(async () => { await clerk.signOut(); }, [clerk]);
  const token = useCallback(() => getToken(), [getToken]);
  const email = user?.id === userId ? user?.primaryEmailAddress?.emailAddress ?? null : null;
  return useMemo<DanceAuthState>(() => ({
    phase: !isLoaded ? 'loading' : isSignedIn ? 'signed-in' : 'signed-out',
    isLoaded: !!isLoaded,
    isSignedIn: !!isSignedIn,
    userId: isSignedIn ? userId ?? null : null,
    email: isSignedIn ? email : null,
    role: null,
    source: isSignedIn ? 'clerk' : null,
    logtoEnabled: false,
    sessionError: null,
    getToken: token,
    signInWithLogto: async () => {},
    signOut,
    retry: () => {},
    migration: null,
    callback: 'disabled',
  }), [isLoaded, isSignedIn, userId, email, token, signOut]);
}
