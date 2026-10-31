/**
 * Shared browser authentication for Danceflow web surfaces (Expo web + admin).
 *
 * Legacy Clerk state arrives through props; this package never imports Clerk.
 * When Logto is enabled, the Logto identity is resolved to the canonical
 * Danceflow account (server accountId) before anything is exposed to the app.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { LogtoProvider, UserScope, useHandleSignInCallback, useLogto, type LogtoConfig } from '@logto/react';
import {
  getAuthConfig,
  getAuthSession,
  linkLogtoAccount,
  registerLogtoAccount,
  type DanceAuthSession,
  type WebAuthConfig,
} from '@workspace/api-client-react';
import { guardedToken } from './session-guards';
import { loadAuthConfigWithRetry } from './config-retry';

export type LegacyAuthSession = {
  loaded: boolean;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

export type DanceAuthPhase =
  | 'config-loading'
  | 'config-error'
  | 'loading'
  | 'signed-out'
  | 'resolving'
  | 'signed-in'
  | 'link-required'
  | 'blocked'
  | 'session-error'
  | 'signing-out';

export type DanceAuthActionError =
  | 'link-needs-legacy'
  | 'link-rejected'
  | 'already-linked'
  | 'email-taken'
  | 'email-unverified'
  | 'blocked'
  | 'expired'
  | 'network';

export type DanceAuthCallbackStatus = 'disabled' | 'none' | 'processing' | 'done' | 'error';

export type DanceAuthMigration = {
  logtoEmail: string | null;
  legacySignedIn: boolean;
  legacyEmail: string | null;
  busy: 'link' | 'register' | null;
  error: DanceAuthActionError | null;
  link: () => Promise<void>;
  register: () => Promise<void>;
};

export type DanceAuthState = {
  phase: DanceAuthPhase;
  /** True once the app may render identity-dependent UI (settled phase). */
  isLoaded: boolean;
  isSignedIn: boolean;
  /** Canonical Danceflow accountId. Never a provider subject. */
  userId: string | null;
  email: string | null;
  role: 'user' | 'admin' | null;
  source: 'logto' | 'clerk' | null;
  logtoEnabled: boolean;
  sessionError: 'expired' | 'network' | null;
  getToken: () => Promise<string | null>;
  signInWithLogto: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
  migration: DanceAuthMigration | null;
  callback: DanceAuthCallbackStatus;
};

const noopToken = async () => null;

function statusOf(e: unknown): number | null {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : null;
}
function codeOf(e: unknown): string | null {
  const d = (e as { data?: unknown } | null)?.data as { code?: unknown } | null | undefined;
  return d && typeof d.code === 'string' ? d.code : null;
}

/** Callback / logout URLs always derive from the live browser origin. */
export function authUrls(basePath: string) {
  const base = basePath.replace(/\/$/, '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    callbackPath: `${base}/auth/callback`,
    callbackUrl: `${origin}${base}/auth/callback`,
    logoutUrl: `${origin}${base}/`,
  };
}

const DanceAuthContext = createContext<DanceAuthState | null>(null);

export function useDanceAuth(): DanceAuthState {
  const ctx = useContext(DanceAuthContext);
  if (!ctx) throw new Error('useDanceAuth must be used inside DanceAuthProvider');
  return ctx;
}

type ProviderProps = {
  app: 'web' | 'admin';
  basePath?: string;
  legacy: LegacyAuthSession;
  /** Called after an explicit link/registration succeeds (route to studio / overview). */
  onMigrated?: () => void;
  children: ReactNode;
};

type ConfigState = { status: 'loading' } | { status: 'error' } | { status: 'ok'; config: WebAuthConfig };

export function DanceAuthProvider({ app, basePath = '', legacy, onMigrated, children }: ProviderProps) {
  const [cfg, setCfg] = useState<ConfigState>({ status: 'loading' });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setCfg({ status: 'loading' });
    // No Authorization header: avoid an unnecessary cross-origin preflight.
    loadAuthConfigWithRetry(
      (signal) => getAuthConfig({ skipAuth: true, cache: 'no-store', signal }),
      controller.signal,
    )
      .then((config) => { if (live) setCfg({ status: 'ok', config }); })
      .catch(() => { if (live) setCfg({ status: 'error' }); });
    return () => { live = false; controller.abort(); };
  }, [nonce]);
  const retryConfig = useCallback(() => setNonce((n) => n + 1), []);

  const pending = useMemo<DanceAuthState | null>(() => {
    if (cfg.status === 'ok') return null;
    return {
      phase: cfg.status === 'loading' ? 'config-loading' : 'config-error',
      isLoaded: false, isSignedIn: false, userId: null, email: null, role: null, source: null,
      logtoEnabled: false, sessionError: null, getToken: noopToken,
      signInWithLogto: async () => {}, signOut: async () => {}, retry: retryConfig,
      migration: null, callback: 'none',
    };
  }, [cfg.status, retryConfig]);

  if (pending) return <DanceAuthContext.Provider value={pending}>{children}</DanceAuthContext.Provider>;
  const config = (cfg as { config: WebAuthConfig }).config;
  if (!config.enabled) return <LegacyOnly legacy={legacy}>{children}</LegacyOnly>;
  return (
    <LogtoRoot app={app} basePath={basePath} config={config} legacy={legacy} onMigrated={onMigrated}>
      {children}
    </LogtoRoot>
  );
}

function LegacyOnly({ legacy, children }: { legacy: LegacyAuthSession; children: ReactNode }) {
  const ref = useRef(legacy);
  ref.current = legacy;
  const [leaving, setLeaving] = useState(false);
  const logoutEpoch = useRef(0);
  const userId = legacy.signedIn ? legacy.userId : null;
  const getToken = useMemo(() => {
    if (!userId) return noopToken;
    const expectedEpoch = logoutEpoch.current;
    return guardedToken(() => ref.current.getToken(),
      () => !leaving && ref.current.signedIn && ref.current.userId === userId && logoutEpoch.current === expectedEpoch);
  }, [userId, leaving]);
  const signOut = useCallback(async () => {
    logoutEpoch.current++;
    setLeaving(true);
    try { await ref.current.signOut(); } finally { setLeaving(false); }
  }, []);
  const value = useMemo<DanceAuthState>(() => {
    const phase: DanceAuthPhase = leaving ? 'signing-out' : !legacy.loaded ? 'loading' : userId ? 'signed-in' : 'signed-out';
    return {
      phase,
      isLoaded: phase === 'signed-in' || phase === 'signed-out',
      isSignedIn: phase === 'signed-in',
      userId: phase === 'signed-in' ? userId : null,
      email: phase === 'signed-in' ? legacy.email : null,
      role: null,
      source: phase === 'signed-in' ? 'clerk' : null,
      logtoEnabled: false,
      sessionError: null,
      getToken,
      signInWithLogto: async () => {},
      signOut,
      retry: () => {},
      migration: null,
      callback: 'disabled',
    };
  }, [leaving, legacy.loaded, legacy.email, userId, getToken, signOut]);
  return <DanceAuthContext.Provider value={value}>{children}</DanceAuthContext.Provider>;
}

function LogtoRoot({ app, basePath, config, legacy, onMigrated, children }: {
  app: 'web' | 'admin'; basePath: string; config: WebAuthConfig; legacy: LegacyAuthSession; onMigrated?: () => void; children: ReactNode;
}) {
  const [sdkVersion, setSdkVersion] = useState(0);
  const resetSdk = useCallback(() => setSdkVersion(n => n + 1), []);
  const logtoConfig = useMemo<LogtoConfig>(() => ({
    endpoint: config.endpoint,
    appId: app === 'admin' ? config.adminAppId : config.webAppId,
    resources: [config.resource],
    scopes: [UserScope.Email],
  }), [app, config.endpoint, config.adminAppId, config.webAppId, config.resource]);
  return (
    <LogtoProvider key={sdkVersion} config={logtoConfig}>
      <LogtoBridge basePath={basePath} resource={config.resource} legacy={legacy} onMigrated={onMigrated} resetSdk={resetSdk}>
        {children}
      </LogtoBridge>
    </LogtoProvider>
  );
}

function CallbackRunner({ onState }: { onState: (s: 'processing' | 'done' | 'error') => void }) {
  const { isLoading, isAuthenticated, error } = useHandleSignInCallback();
  const ref = useRef(onState);
  ref.current = onState;
  useEffect(() => {
    if (error) ref.current('error');
    else if (!isLoading && isAuthenticated) ref.current('done');
    else ref.current('processing');
  }, [isLoading, isAuthenticated, error]);
  return null;
}

type Resolution =
  | { status: 'idle' }
  | { status: 'resolving' }
  | { status: 'ok'; session: DanceAuthSession }
  | { status: 'link-required'; logtoEmail: string | null }
  | { status: 'blocked' }
  | { status: 'error'; kind: 'expired' | 'network' };

function LogtoBridge({ basePath, resource, legacy, onMigrated, resetSdk, children }: {
  basePath: string; resource: string; legacy: LegacyAuthSession; onMigrated?: () => void; resetSdk: () => void; children: ReactNode;
}) {
  const logto = useLogto();
  const logtoRef = useRef(logto);
  logtoRef.current = logto;
  const legacyRef = useRef(legacy);
  legacyRef.current = legacy;
  const migratedRef = useRef(onMigrated);
  migratedRef.current = onMigrated;

  const urls = useMemo(() => authUrls(basePath), [basePath]);

  // Callback is detected once at mount so later navigation never re-runs it.
  const [callbackActive] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (window.location.pathname.replace(/\/$/, '') !== urls.callbackPath) return false;
    const q = new URLSearchParams(window.location.search);
    return q.has('code') || q.has('error');
  });
  const [callback, setCallback] = useState<DanceAuthCallbackStatus>(() => {
    if (!callbackActive) return 'none';
    return new URLSearchParams(window.location.search).get('state') ? 'processing' : 'error';
  });
  useEffect(() => {
    if (callback !== 'processing') return;
    // SDK callbacks with missing/unknown state can otherwise remain pending forever.
    const deadline = window.setTimeout(() => setCallback('error'), 20000);
    return () => window.clearTimeout(deadline);
  }, [callback]);
  useEffect(() => {
    if (callback !== 'done' && callback !== 'error') return;
    if (window.location.pathname.replace(/\/$/, '') === urls.callbackPath) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, [callback, urls.callbackPath]);

  const [initialized, setInitialized] = useState(false);
  useEffect(() => { if (!logto.isLoading) setInitialized(true); }, [logto.isLoading]);

  const [res, setRes] = useState<Resolution>({ status: 'idle' });
  const [nonce, setNonce] = useState(0);
  const epoch = useRef(0);

  useEffect(() => {
    const my = ++epoch.current;
    if (!logto.isAuthenticated) { setRes({ status: 'idle' }); return; }
    setRes({ status: 'resolving' });
    void (async () => {
      try {
        const token = await logtoRef.current.getAccessToken(resource);
        if (!token) throw Object.assign(new Error('expired'), { status: 401 });
        const session = await getAuthSession({ headers: { Authorization: `Bearer ${token}` } });
        if (my !== epoch.current) return;
        setRes({ status: 'ok', session });
      } catch (e) {
        if (my !== epoch.current) return;
        const st = statusOf(e);
        if (st === 409 && codeOf(e) === 'account_link_required') {
          let email: string | null = null;
          try {
            const claims = await logtoRef.current.getIdTokenClaims();
            email = typeof claims?.email === 'string' ? claims.email : null;
          } catch { /* identity email is display-only */ }
          if (my !== epoch.current) return;
          setRes({ status: 'link-required', logtoEmail: email });
        } else if (st === 403) setRes({ status: 'blocked' });
        else if (st === 401) setRes({ status: 'error', kind: 'expired' });
        else setRes({ status: 'error', kind: 'network' });
      }
    })();
    return () => { epoch.current++; };
  }, [logto.isAuthenticated, nonce, resource]);

  // Link / register actions are discarded when either identity changes.
  const actionEpoch = useRef(0);
  const [busy, setBusy] = useState<'link' | 'register' | null>(null);
  const [actionError, setActionError] = useState<DanceAuthActionError | null>(null);
  useEffect(() => {
    actionEpoch.current++;
    setBusy(null);
    setActionError(null);
  }, [legacy.userId, logto.isAuthenticated, nonce]);

  const runAction = useCallback(async (kind: 'link' | 'register') => {
    const myAction = ++actionEpoch.current;
    const myEpoch = epoch.current;
    const legacyUser = legacyRef.current.userId;
    const stale = () => myAction !== actionEpoch.current || myEpoch !== epoch.current ||
      legacyRef.current.userId !== legacyUser || !logtoRef.current.isAuthenticated;
    if (kind === 'link' && !legacyRef.current.signedIn) { setActionError('link-needs-legacy'); return; }
    setBusy(kind);
    setActionError(null);
    try {
      const accessToken = await logtoRef.current.getAccessToken(resource);
      if (stale()) return;
      const idToken = await logtoRef.current.getIdToken();
      if (stale()) return;
      if (!accessToken || !idToken) throw Object.assign(new Error('expired'), { status: 401, logto: true });
      let session: DanceAuthSession;
      if (kind === 'link') {
        const legacyToken = await legacyRef.current.getToken();
        if (stale()) return;
        if (!legacyToken) { if (!stale()) setActionError('link-needs-legacy'); return; }
        session = await linkLogtoAccount({ accessToken, idToken }, { headers: { Authorization: `Bearer ${legacyToken}` } });
      } else {
        session = await registerLogtoAccount({ idToken }, { headers: { Authorization: `Bearer ${accessToken}` } });
      }
      if (stale() || legacyRef.current.userId !== legacyUser) return;
      setRes({ status: 'ok', session });
      migratedRef.current?.();
    } catch (e) {
      if (stale()) return;
      const st = statusOf(e);
      if ((e as { logto?: boolean }).logto) setActionError('expired');
      else if (st === 422 && codeOf(e) === 'verified_email_required') setActionError('email-unverified');
      else if (st === 409) setActionError(kind === 'register' ? 'email-taken' : 'already-linked');
      else if (st === 403) setActionError('blocked');
      else if (st === 401) setActionError(kind === 'link' ? 'link-rejected' : 'expired');
      else setActionError('network');
    } finally {
      if (!stale()) setBusy(null);
    }
  }, [resource]);

  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    // React SDK v4 stores method failures in context instead of rejecting.
    if (logto.error) {
      epoch.current++;
      actionEpoch.current++;
      setLeaving(false);
      setBusy(null);
    }
  }, [logto.error]);
  const signOut = useCallback(async () => {
    epoch.current++;
    actionEpoch.current++;
    setLeaving(true);
    setRes({ status: 'idle' });
    try {
      // Clear the legacy session first so it cannot silently reappear.
      if (legacyRef.current.signedIn) await legacyRef.current.signOut();
      if (logtoRef.current.isAuthenticated) {
        await logtoRef.current.signOut(urls.logoutUrl);
        return; // browser navigates away
      }
      setLeaving(false);
    } catch (e) {
      setLeaving(false);
      setNonce((n) => n + 1);
      throw e;
    }
  }, [urls.logoutUrl]);

  const signInWithLogto = useCallback(async () => {
    await logtoRef.current.signIn(urls.callbackUrl);
  }, [urls.callbackUrl]);

  const retry = useCallback(() => {
    if (logtoRef.current.error) resetSdk();
    else setNonce((n) => n + 1);
  }, [resetSdk]);

  const legacyUserId = legacy.signedIn ? legacy.userId : null;
  const authed = logto.isAuthenticated;
  let phase: DanceAuthPhase;
  if (logto.error) phase = 'session-error';
  else if (leaving) phase = 'signing-out';
  else if (!initialized) phase = 'loading';
  else if (authed) {
    phase = res.status === 'ok' ? 'signed-in'
      : res.status === 'link-required' ? 'link-required'
      : res.status === 'blocked' ? 'blocked'
      : res.status === 'error' ? 'session-error'
      : 'resolving';
  } else if (callback === 'processing') phase = 'loading';
  else phase = !legacy.loaded ? 'loading' : legacyUserId ? 'signed-in' : 'signed-out';

  const source: DanceAuthState['source'] = phase !== 'signed-in' ? null : authed ? 'logto' : 'clerk';
  const userId = phase !== 'signed-in' ? null : authed ? (res as { session: DanceAuthSession }).session.accountId : legacyUserId;

  const getToken = useMemo(() => {
    if (!userId) return noopToken;
    const expectedEpoch = epoch.current;
    if (source === 'logto') return guardedToken(() => logtoRef.current.getAccessToken(resource),
      () => epoch.current === expectedEpoch && logtoRef.current.isAuthenticated && !logtoRef.current.error);
    return guardedToken(() => legacyRef.current.getToken(),
      () => epoch.current === expectedEpoch && legacyRef.current.signedIn && legacyRef.current.userId === userId);
  }, [source, userId, resource]);

  const sessionEmail = res.status === 'ok' ? res.session.email : null;
  const sessionRole = res.status === 'ok' ? res.session.role : null;
  const logtoEmail = res.status === 'link-required' ? res.logtoEmail : null;

  const value = useMemo<DanceAuthState>(() => ({
    phase,
    isLoaded: phase === 'signed-in' || phase === 'signed-out' || phase === 'link-required' || phase === 'blocked' || phase === 'session-error',
    isSignedIn: phase === 'signed-in',
    userId,
    email: phase !== 'signed-in' ? null : source === 'logto' ? sessionEmail : legacy.email,
    role: source === 'logto' ? sessionRole : null,
    source,
    logtoEnabled: true,
    sessionError: logto.error ? 'network' : res.status === 'error' ? res.kind : null,
    getToken,
    signInWithLogto,
    signOut,
    retry,
    migration: phase === 'link-required' ? {
      logtoEmail,
      legacySignedIn: !!legacyUserId,
      legacyEmail: legacyUserId ? legacy.email : null,
      busy,
      error: actionError,
      link: () => runAction('link'),
      register: () => runAction('register'),
    } : null,
    callback,
  }), [phase, userId, source, sessionEmail, sessionRole, legacy.email, res, getToken, signInWithLogto, signOut, retry,
    logtoEmail, legacyUserId, busy, actionError, runAction, callback, logto.error]);

  return (
    <DanceAuthContext.Provider value={value}>
      {callbackActive && callback === 'processing' && <CallbackRunner onState={setCallback} />}
      {children}
    </DanceAuthContext.Provider>
  );
}
