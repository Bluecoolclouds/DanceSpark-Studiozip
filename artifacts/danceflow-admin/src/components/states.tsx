import type { ReactNode } from 'react';
import { RotateCw, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiMessage } from '@/lib/format';
import { cn } from '@/lib/utils';

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border" data-testid="state-loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="h-3 w-40 rounded bg-muted animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
          <div className="h-3 flex-1 rounded bg-muted/70 animate-pulse" style={{ animationDelay: `${i * 80 + 40}ms` }} />
          <div className="h-3 w-16 rounded bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3 border-l-4 border-destructive bg-destructive/5 px-5 py-5" data-testid="state-error">
      <div className="flex items-center gap-2 font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" /> {apiMessage(error)}
      </div>
      <p className="text-sm text-muted-foreground">Данные не загружены. Ничего не подставлено вместо них.</p>
      <button
        type="button"
        onClick={onRetry}
        data-testid="button-retry"
        className="inline-flex items-center gap-2 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background transition-transform active:scale-95"
      >
        <RotateCw className={cn('h-3.5 w-3.5', retrying && 'animate-spin')} /> Повторить
      </button>
    </div>
  );
}

export function EmptyState({ title, hint, icon }: { title: string; hint: string; icon: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center" data-testid="state-empty">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border-2 border-dashed border-primary/40 text-primary">{icon}</div>
      <div className="font-display text-lg">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  return (
    <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm">
      <span className="font-mono text-xs text-muted-foreground" data-testid="text-page-info">
        стр. {page} / {pages} · всего {total}
      </span>
      <div className="flex gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="button-page-prev"
          className="grid h-8 w-8 place-items-center rounded-md border border-border transition hover:bg-secondary disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid="button-page-next"
          className="grid h-8 w-8 place-items-center rounded-md border border-border transition hover:bg-secondary disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function PageHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="df-rise mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{kicker}</div>
        <h1 className="font-display mt-1 text-3xl font-bold md:text-4xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('df-rise overflow-hidden rounded-xl border border-card-border bg-card', className)}>{children}</section>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued: 'bg-secondary text-foreground',
    running: 'bg-accent text-accent-foreground',
    succeeded: 'bg-foreground text-background',
    failed: 'bg-destructive/12 text-destructive',
  };
  const labels: Record<string, string> = { queued: 'В очереди', running: 'Выполняется', succeeded: 'Готово', failed: 'Ошибка' };
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', map[status] ?? 'bg-muted')}>
      {status === 'running' && <span className="df-pulse h-1.5 w-1.5 rounded-full bg-current" />}
      {labels[status] ?? status}
    </span>
  );
}
