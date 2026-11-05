import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Info, KeyRound, LogIn, LogOut, RotateCw, ShieldX, UserPlus } from 'lucide-react';
import { useDanceAuth } from '@workspace/auth-web';

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

const inputCls = 'w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60';
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Notice({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="flex gap-3 rounded-md border border-border bg-secondary/60 px-3 py-2.5">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="text-xs leading-relaxed text-muted-foreground"><div className="mb-0.5 font-semibold text-foreground">{title}</div>{children}</div>
    </div>
  );
}

const MIGRATION = 'Пароли из прежней системы входа не переносятся автоматически. Если аккаунт был создан раньше, обратитесь к оператору — он перенесёт аккаунт и роль вручную.';

/** Own email/password form for /sign-in and /sign-up. */
export function AdminAuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const auth = useDanceAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const signUp = mode === 'sign-up';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked.current) return;
    const address = email.trim();
    if (!EMAIL_RE.test(address)) return setError('Введите корректный адрес электронной почты.');
    if (signUp) {
      if (password.length < PASSWORD_MIN) return setError(`Пароль должен быть не короче ${PASSWORD_MIN} символов.`);
      if (password.length > PASSWORD_MAX) return setError(`Пароль должен быть не длиннее ${PASSWORD_MAX} символов.`);
      if (password !== confirm) return setError('Пароли не совпадают.');
      if (!consent) return setError('Примите соглашение и политику конфиденциальности.');
    }
    locked.current = true; setBusy(true); setError('');
    try {
      if (signUp) await auth.signUp(address, password); else await auth.signIn(address, password);
      setLocation('/overview', { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Сервер не ответил. Повторите.');
    } finally { locked.current = false; setBusy(false); }
  };
  return (
    <AuthFrame>
      <Card testId={`card-${mode}`}>
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">{signUp ? <UserPlus className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}</div>
        <h1 className="font-display text-2xl font-bold">{signUp ? 'Новый аккаунт' : 'Вход в пульт'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{signUp ? 'Доступ к пульту выдаёт владелец на сервере. Новый аккаунт начинается без роли администратора.' : 'Только для администраторов Danceflow.'}</p>
        <form className="mt-6 space-y-3" onSubmit={submit} noValidate>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Электронная почта</span>
            <input className={inputCls} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} data-testid="input-email" />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Пароль{signUp && <span className="font-normal text-muted-foreground"> · {PASSWORD_MIN}–{PASSWORD_MAX} символов</span>}</span>
            <input className={inputCls} type="password" autoComplete={signUp ? 'new-password' : 'current-password'} maxLength={PASSWORD_MAX} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} data-testid="input-password" />
          </label>
          {signUp && <>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Повторите пароль</span>
              <input className={inputCls} type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} data-testid="input-password-confirm" />
            </label>
            <label className="flex items-start gap-2.5 pt-1 text-xs leading-relaxed text-muted-foreground">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} data-testid="checkbox-consent" />
              <span>Я принимаю <a className="font-semibold text-primary underline-offset-2 hover:underline" href="/legal/terms" target="_blank" rel="noreferrer">пользовательское соглашение</a> и <a className="font-semibold text-primary underline-offset-2 hover:underline" href="/privacy" target="_blank" rel="noreferrer">политику конфиденциальности</a>.</span>
            </label>
          </>}
          {error && <p role="alert" className="text-sm text-destructive" data-testid="text-auth-error">{error}</p>}
          <button type="submit" className={primaryBtn} disabled={busy || !email || !password || (signUp && (!confirm || !consent))} data-testid={`button-${mode}`}>
            {signUp ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {busy ? (signUp ? 'Создаём…' : 'Входим…') : (signUp ? 'Создать аккаунт' : 'Войти')}
          </button>
        </form>
        <div className="mt-5 space-y-2">
          {signUp
            ? <Notice title="Почта не подтверждается" testId="notice-unverified">Письма не отправляются: адрес останется неподтверждённым, сброс пароля по почте недоступен.</Notice>
            : <Notice title="Забыли пароль?" testId="notice-reset">Сброс по почте недоступен — письма не отправляются. Обратитесь к владельцу пульта.</Notice>}
          <Notice title="Аккаунт из старой системы входа">{MIGRATION}</Notice>
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          {signUp ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
          <Link href={signUp ? '/sign-in' : '/sign-up'} className="font-semibold text-primary" data-testid="link-switch-auth">{signUp ? 'Войти' : 'Зарегистрироваться'}</Link>
        </p>
      </Card>
    </AuthFrame>
  );
}

function StatusScreen({ auth }: { auth: ReturnType<typeof useDanceAuth> }) {
  const signOut = useAdminSignOut();
  if (auth.phase === 'blocked' || auth.phase === 'session-error') {
    const blocked = auth.phase === 'blocked';
    return (
      <AuthFrame>
        <Card testId={`state-auth-${auth.phase}`}>
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl bg-destructive/10 text-destructive"><ShieldX className="h-6 w-6" /></div>
          <h1 className="font-display text-2xl font-bold">{blocked ? 'Доступ закрыт' : 'Не удалось проверить аккаунт'}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{blocked ? 'Этот аккаунт заблокирован.' : 'Не удалось проверить вход. Повторите или выйдите и войдите снова.'}</p>
          <div className="mt-6 space-y-2">
            {!blocked && <button type="button" className={primaryBtn} onClick={auth.retry} data-testid="button-auth-retry"><RotateCw className="h-4 w-4" /> Повторить</button>}
            <button type="button" className={ghostBtn} onClick={() => void signOut.run()} data-testid="button-auth-signout"><LogOut className="h-4 w-4" /> Выйти</button>
            {signOut.error && <p role="alert" className="text-sm text-destructive">{signOut.error}</p>}
          </div>
        </Card>
      </AuthFrame>
    );
  }
  return <AuthLoader label={auth.phase === 'signing-out' ? 'выходим из аккаунта' : 'проверяем аккаунт'} />;
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

/** Blocks routes until identity is settled. */
export function AuthPhaseGate({ children }: { children: ReactNode }) {
  const auth = useDanceAuth();
  if (auth.phase === 'signed-in' || auth.phase === 'signed-out') return <>{children}</>;
  return <StatusScreen auth={auth} />;
}

/** Old external-login return URL; kept so stale links land somewhere honest. */
export function AuthCallbackPage() {
  const auth = useDanceAuth();
  const [, setLocation] = useLocation();
  const done = auth.phase === 'signed-in';
  useEffect(() => { if (done) setLocation('/overview', { replace: true }); }, [done, setLocation]);
  if (done) return <AuthLoader label="открываем пульт" />;
  return (
    <AuthFrame>
      <Card testId="state-callback-error">
        <h1 className="font-display text-2xl font-bold">Ссылка устарела</h1>
        <p className="mt-2 text-sm text-muted-foreground">Вход теперь выполняется по почте и паролю прямо в пульте.</p>
        <div className="mt-6 space-y-2">
          <Link href="/sign-in" className={primaryBtn} data-testid="link-signin"><LogIn className="h-4 w-4" /> Войти</Link>
          <Link href="/" className={ghostBtn} data-testid="link-home">На главную</Link>
        </div>
      </Card>
    </AuthFrame>
  );
}
