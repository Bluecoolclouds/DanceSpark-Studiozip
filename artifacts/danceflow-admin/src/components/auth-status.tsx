import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { KeyRound, Link2, LogIn, LogOut, RotateCw, ShieldX, UserPlus } from 'lucide-react';
import { useDanceAuth, type DanceAuthState } from '@workspace/auth-web';

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-sidebar px-4 py-10">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative z-10 flex w-full flex-col items-center gap-6">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-sidebar-primary">danceflow · пульт владельца</div>
        {children}
      </div>
    </div>
  );
}

function Card({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div data-testid={testId} className="df-rise w-[440px] max-w-full rounded-2xl border border-card-border bg-card p-8 text-card-foreground shadow-[0_24px_60px_-30px_hsl(272_40%_11%/0.5)]">
      {children}
    </div>
  );
}

const primaryBtn = 'inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60';
const ghostBtn = 'inline-flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary disabled:opacity-60';

export function useAdminSignOut() {
  const auth = useDanceAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState('');
  const run = async () => {
    setError('');
    try { await auth.signOut(); setLocation('/'); } catch { setError('Не удалось выйти. Повторите.'); }
  };
  return { run, error };
}

/** Logto-first entry; the old Clerk forms stay at ?legacy=1. */
export function LogtoEntry({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const auth = useDanceAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    setBusy(true); setError('');
    try { await auth.signInWithLogto(); } catch { setBusy(false); setError('Не удалось открыть страницу входа. Проверьте подключение.'); }
  };
  return (
    <AuthFrame>
      <Card testId={`card-logto-${mode}`}>
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound className="h-6 w-6" /></div>
        <h1 className="font-display text-2xl font-bold">{mode === 'sign-in' ? 'Вход в пульт' : 'Новый аккаунт'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === 'sign-in'
            ? 'Единый вход Danceflow. Пароль и его сброс — на защищённой странице входа.'
            : 'Доступ к пульту выдаёт владелец на сервере. Уже есть аккаунт — войдите и привяжите его.'}
        </p>
        <div className="mt-6 space-y-2">
          <button type="button" onClick={start} disabled={busy} className={primaryBtn} data-testid="button-logto-signin">
            <LogIn className="h-4 w-4" /> {busy ? 'Открываем вход…' : 'Продолжить'}
          </button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Link href={`/${mode}?legacy=1`} className={ghostBtn} data-testid="link-legacy-signin">
            {mode === 'sign-in' ? 'Войти старым способом' : 'Старая регистрация'}
          </Link>
        </div>
      </Card>
    </AuthFrame>
  );
}

const actionErrors: Record<string, string> = {
  'link-needs-legacy': 'Сначала войдите в старый аккаунт — без этого привязка невозможна.',
  'link-rejected': 'Старый вход не подтверждён. Войдите в старый аккаунт ещё раз.',
  'already-linked': 'Один из аккаунтов уже привязан. Войдите тем способом, которым пользовались раньше.',
  'email-taken': 'Аккаунт с этой почтой уже существует. Войдите старым способом и привяжите его.',
  'email-unverified': 'Подтвердите email в Logto, затем войдите снова и повторите регистрацию.',
  blocked: 'Аккаунт заблокирован. Новый аккаунт создать нельзя.',
  expired: 'Новый вход истёк. Выйдите и войдите снова.',
  network: 'Сервер не ответил. Повторите.',
};

function StatusScreen({ auth }: { auth: DanceAuthState }) {
  const signOut = useAdminSignOut();
  const legacyHref = '/sign-in?legacy=1';
  if (auth.phase === 'link-required' && auth.migration) {
    const m = auth.migration;
    return (
      <AuthFrame>
        <Card testId="state-account-link">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><Link2 className="h-6 w-6" /></div>
          <h1 className="font-display text-2xl font-bold">Перенос аккаунта</h1>
          <p className="mt-2 text-sm text-muted-foreground">Новый вход ещё не связан с аккаунтом Danceflow. Роли и история сохраняются только при привязке.</p>
          <dl className="mt-5 space-y-2">
            <div className="rounded-md bg-secondary px-3 py-2">
              <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">новый вход</dt>
              <dd className="font-mono text-sm" data-testid="text-logto-email">{m.logtoEmail ?? 'почта не указана'}</dd>
            </div>
            <div className="rounded-md bg-secondary px-3 py-2">
              <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">старый аккаунт</dt>
              <dd className="font-mono text-sm" data-testid="text-legacy-email">{m.legacySignedIn ? (m.legacyEmail ?? 'аккаунт Danceflow') : 'вход не выполнен'}</dd>
            </div>
          </dl>
          {m.error && <p role="alert" className="mt-4 text-sm text-destructive" data-testid="text-link-error">{actionErrors[m.error]}</p>}
          <div className="mt-5 space-y-2">
            {m.legacySignedIn ? (
              <button type="button" className={primaryBtn} disabled={!!m.busy} onClick={() => void m.link()} data-testid="button-link-account">
                <Link2 className="h-4 w-4" /> {m.busy === 'link' ? 'Привязываем…' : 'Привязать старый аккаунт'}
              </button>
            ) : (
              <Link href={legacyHref} className={primaryBtn} data-testid="link-legacy-login"><LogIn className="h-4 w-4" /> Войти в старый аккаунт</Link>
            )}
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Уже есть аккаунт Danceflow? Привяжите его — не создавайте новый. Новый аккаунт начнётся с нуля, и этот вход потом нельзя будет перенести на старый аккаунт.</p>
            <button type="button" className={`${ghostBtn} mt-3`} disabled={!!m.busy} onClick={() => void m.register()} data-testid="button-register-account">
              <UserPlus className="h-4 w-4" /> {m.busy === 'register' ? 'Создаём…' : 'Я здесь впервые — создать новый'}
            </button>
            <button type="button" className={`${ghostBtn} mt-2`} disabled={!!m.busy} onClick={() => void signOut.run()} data-testid="button-cancel-link">
              <LogOut className="h-4 w-4" /> Отмена — выйти
            </button>
            {signOut.error && <p role="alert" className="mt-2 text-sm text-destructive">{signOut.error}</p>}
          </div>
        </Card>
      </AuthFrame>
    );
  }
  if (auth.phase === 'config-error' || auth.phase === 'blocked' || auth.phase === 'session-error') {
    const title = auth.phase === 'blocked' ? 'Доступ закрыт' : auth.phase === 'config-error' ? 'Вход недоступен' : 'Не удалось проверить аккаунт';
    const text = auth.phase === 'blocked' ? 'Этот аккаунт заблокирован.'
      : auth.phase === 'config-error' ? 'Не удалось загрузить настройки входа. Обход проверки не выполняется.'
      : auth.sessionError === 'expired' ? 'Сеанс входа истёк. Выйдите и войдите снова.' : 'Не удалось проверить вход. Повторите или выйдите, чтобы сменить способ входа.';
    return (
      <AuthFrame>
        <Card testId={`state-auth-${auth.phase}`}>
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-destructive/10 text-destructive"><ShieldX className="h-6 w-6" /></div>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{text}</p>
          <div className="mt-6 space-y-2">
            {auth.phase !== 'blocked' && (
              <button type="button" className={primaryBtn} onClick={auth.retry} data-testid="button-auth-retry"><RotateCw className="h-4 w-4" /> Повторить</button>
            )}
            {auth.phase !== 'config-error' && (
              <button type="button" className={ghostBtn} onClick={() => void signOut.run()} data-testid="button-auth-signout"><LogOut className="h-4 w-4" /> Выйти</button>
            )}
            {signOut.error && <p role="alert" className="text-sm text-destructive">{signOut.error}</p>}
          </div>
        </Card>
      </AuthFrame>
    );
  }
  return <AuthLoader label={auth.phase === 'signing-out' ? 'выходим из аккаунта' : auth.phase === 'resolving' ? 'проверяем аккаунт' : 'подключаем авторизацию'} />;
}

export function AuthLoader({ label }: { label: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-sidebar text-sidebar-foreground" data-testid="state-auth-loading">
      <div className="flex flex-col items-center gap-5">
        <div className="h-0.5 w-40 overflow-hidden rounded bg-sidebar-accent">
          <div className="h-full w-1/3 animate-[df-marquee_1.2s_linear_infinite] bg-sidebar-primary" />
        </div>
        <div className="font-mono text-xs text-sidebar-foreground/60">{label}</div>
      </div>
    </div>
  );
}

const PUBLIC_DURING_LINK = ['/sign-in', '/sign-up'];

/** Blocks routes until identity is settled; legacy login + callback stay public. */
export function AuthPhaseGate({ children }: { children: ReactNode }) {
  const auth = useDanceAuth();
  const [location] = useLocation();
  if (location.startsWith('/auth/callback')) return <>{children}</>;
  if (auth.phase === 'signed-in' || auth.phase === 'signed-out') return <>{children}</>;
  if (auth.phase === 'link-required' && PUBLIC_DURING_LINK.some((p) => location.startsWith(p))) return <>{children}</>;
  return <StatusScreen auth={auth} />;
}

export function AuthCallbackPage() {
  const auth = useDanceAuth();
  const [, setLocation] = useLocation();
  const [startError, setStartError] = useState('');
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    setStartError('');
    try { await auth.signInWithLogto(); }
    catch { setBusy(false); setStartError('Не удалось открыть вход. Проверьте подключение и повторите.'); }
  };
  const done = auth.phase === 'signed-in';
  useEffect(() => { if (done) setLocation('/overview', { replace: true }); }, [done, setLocation]);
  if (auth.phase === 'link-required' || auth.phase === 'blocked' || auth.phase === 'session-error' || auth.phase === 'config-error')
    return <StatusScreen auth={auth} />;
  const failed = auth.callback === 'error' || auth.phase === 'signed-out';
  if (!failed) return <AuthLoader label={done ? 'открываем пульт' : 'завершаем вход'} />;
  return (
    <AuthFrame>
      <Card testId="state-callback-error">
        <h1 className="font-display text-2xl font-bold">Вход не завершён</h1>
        <p className="mt-2 text-sm text-muted-foreground">Страница входа вернула ошибку или ссылка устарела.</p>
        <div className="mt-6 space-y-2">
          {auth.logtoEnabled && (
            <button type="button" className={primaryBtn} disabled={busy} onClick={start} data-testid="button-callback-retry"><RotateCw className="h-4 w-4" /> {busy ? 'Открываем вход…' : 'Войти снова'}</button>
          )}
          {startError && <p role="alert" className="text-sm text-destructive">{startError}</p>}
          <Link href="/sign-in?legacy=1" className={ghostBtn} data-testid="link-legacy-login">Войти старым способом</Link>
          <Link href="/" className={ghostBtn} data-testid="link-home">На главную</Link>
        </div>
      </Card>
    </AuthFrame>
  );
}
