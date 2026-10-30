import type { ReactNode } from 'react';
import { Link, Redirect, useLocation } from 'wouter';
import { useAuth, useClerk } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Gauge, Users, Clapperboard, SlidersHorizontal, ScrollText, LogOut, ShieldX, RotateCw } from 'lucide-react';
import {
  useGetAdminSession,
  getGetAdminSessionQueryKey,
  useHealthCheck,
  getHealthCheckQueryKey,
  type AdminSession,
} from '@workspace/api-client-react';
import { apiStatus, apiMessage, POLL } from '@/lib/format';
import { cn } from '@/lib/utils';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

const NAV = [
  { href: '/overview', label: 'Обзор', icon: Gauge },
  { href: '/users', label: 'Пользователи', icon: Users },
  { href: '/generations', label: 'Генерации', icon: Clapperboard },
  { href: '/settings', label: 'Расход ИИ', icon: SlidersHorizontal },
  { href: '/audit', label: 'Журнал', icon: ScrollText },
];

function Logo({ dark }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={`${basePath}/logo.svg`} alt="" className="h-8 w-8" />
      <div className="leading-none">
        <div className={cn('font-display text-[15px] font-bold', dark ? 'text-sidebar-foreground' : 'text-foreground')}>danceflow</div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-primary">пульт</div>
      </div>
    </div>
  );
}

export { Logo };

function useSignOut() {
  const { signOut } = useClerk();
  const qc = useQueryClient();
  return () => {
    qc.clear();
    void signOut({ redirectUrl: basePath || '/' });
  };
}

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-sidebar text-sidebar-foreground" data-testid="state-auth-loading">
      <div className="flex flex-col items-center gap-5">
        <Logo dark />
        <div className="h-0.5 w-40 overflow-hidden rounded bg-sidebar-accent">
          <div className="h-full w-1/3 animate-[df-marquee_1.2s_linear_infinite] bg-sidebar-primary" />
        </div>
        <div className="font-mono text-xs text-sidebar-foreground/60">{label}</div>
      </div>
    </div>
  );
}

function Denied({ title, text, email, onRetry }: { title: string; text: string; email?: string; onRetry?: () => void }) {
  const signOut = useSignOut();
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-background px-5">
      <div className="df-rise w-full max-w-md rounded-2xl border border-card-border bg-card p-8" data-testid="state-access-denied">
        <div className="mb-6 grid h-12 w-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <ShieldX className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">{text}</p>
        {email && <p className="mt-4 rounded-md bg-secondary px-3 py-2 font-mono text-sm" data-testid="text-denied-email">{email}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={signOut} data-testid="button-signout-denied"
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background transition-transform active:scale-95">
            <LogOut className="h-4 w-4" /> Выйти и сменить аккаунт
          </button>
          {onRetry && (
            <button type="button" onClick={onRetry} data-testid="button-retry-session"
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
              <RotateCw className="h-4 w-4" /> Повторить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HealthDot() {
  const { data, isError } = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: POLL } });
  const ok = !isError && data?.status === 'ok';
  return (
    <div className="flex items-center gap-2 font-mono text-[11px]" data-testid="status-health">
      <span className={cn('h-2 w-2 rounded-full', ok ? 'df-pulse bg-sidebar-primary' : isError ? 'bg-destructive' : 'bg-sidebar-foreground/40')} />
      <span className="text-sidebar-foreground/70">{ok ? 'API на связи' : isError ? 'API недоступен' : 'проверка API'}</span>
    </div>
  );
}

function Shell({ session, children }: { session: AdminSession; children: ReactNode }) {
  const [location] = useLocation();
  const signOut = useSignOut();
  return (
    <div className="min-h-[100dvh] bg-background md:flex">
      <aside className="sticky top-0 z-30 flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:h-[100dvh] md:w-60">
        <div className="flex items-center justify-between px-5 py-4 md:py-6">
          <Logo dark />
          <button type="button" onClick={signOut} className="md:hidden text-sidebar-foreground/70" data-testid="button-signout-mobile" aria-label="Выйти">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} href={href} data-testid={`link-nav-${href.slice(1)}`}
                className={cn('group relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/50')}>
                <span className={cn('absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-sidebar-primary transition-transform', active ? 'scale-y-100' : 'scale-y-0')} />
                <Icon className={cn('h-4 w-4 transition-transform group-hover:scale-110', active && 'text-sidebar-primary')} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden space-y-4 border-t border-sidebar-border px-5 py-5 md:block">
          <HealthDot />
          <div>
            <div className="truncate text-sm" data-testid="text-admin-email">{session.email}</div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/50" data-testid="text-environment">
              среда · {session.environment}
            </div>
          </div>
          <button type="button" onClick={signOut} data-testid="button-signout"
            className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-sm text-sidebar-foreground/80 transition hover:border-sidebar-primary hover:text-sidebar-foreground">
            <LogOut className="h-4 w-4" /> Выйти
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b border-border px-5 py-2 font-mono text-[11px] text-muted-foreground md:px-10">
          <Activity className="h-3.5 w-3.5 text-primary" />
          обновление каждые 30 с · квоты считаются по UTC · стоимость — оценка, не счёт провайдера
        </div>
        <div className="mx-auto max-w-6xl px-5 py-8 md:px-10">{children}</div>
      </main>
    </div>
  );
}

export function AdminGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const ready = isLoaded && !!isSignedIn;
  const session = useGetAdminSession({
    query: { queryKey: getGetAdminSessionQueryKey(), enabled: ready, retry: false, refetchInterval: POLL },
  });

  if (!isLoaded) return <FullScreenLoader label="подключаем авторизацию" />;
  if (!isSignedIn) return <Redirect to="/" />;
  if (session.isLoading) return <FullScreenLoader label="проверяем права администратора" />;
  if (session.isError) {
    const st = apiStatus(session.error);
    if (st === 403 || st === 401)
      return <Denied title="Доступ закрыт" text="Этот аккаунт не входит в список администраторов Danceflow. Данные пульта не показываются." />;
    return <Denied title="Не удалось проверить доступ" text={apiMessage(session.error)} onRetry={() => void session.refetch()} />;
  }
  const s = session.data;
  if (!s) return <FullScreenLoader label="проверяем права администратора" />;
  if (!s.isAdmin)
    return <Denied title="Доступ закрыт" text="Вы вошли, но у аккаунта нет роли администратора. Попросите владельца выдать доступ на сервере." email={s.email} />;
  return <Shell session={s}>{children}</Shell>;
}
