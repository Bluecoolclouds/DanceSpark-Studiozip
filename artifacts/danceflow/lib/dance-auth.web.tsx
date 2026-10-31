/** Web auth: shared Danceflow provider with Clerk as the legacy session. */
import React, { useCallback, useMemo } from 'react';
import { useAuth, useClerk, useUser } from '@clerk/expo';
import { router } from 'expo-router';
import { DanceAuthProvider, useDanceAuth, type DanceAuthState, type LegacyAuthSession } from '@workspace/auth-web';

export type { DanceAuthState };
export { useDanceAuth };

export function DanceAuthBoundary({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  const email = user?.id === userId ? user?.primaryEmailAddress?.emailAddress ?? null : null;
  const legacy = useMemo<LegacyAuthSession>(() => ({
    loaded: !!isLoaded,
    signedIn: !!isSignedIn,
    userId: userId ?? null,
    email,
    getToken: () => getToken(),
    signOut: async () => { await clerk.signOut(); },
  }), [isLoaded, isSignedIn, userId, email, getToken, clerk]);
  const onMigrated = useCallback(() => router.replace('/studio'), []);
  return <DanceAuthProvider app="web" basePath="" legacy={legacy} onMigrated={onMigrated}>{children}</DanceAuthProvider>;
}
