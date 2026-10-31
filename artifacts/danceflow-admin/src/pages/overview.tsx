import { Link } from 'wouter';
import { Info, ArrowUpRight } from 'lucide-react';
import { useGetAdminOverview, getGetAdminOverviewQueryKey } from '@workspace/api-client-react';
import { PageHeader, Panel, ErrorState } from '@/components/states';
import { fmtNum, fmtRub, fmtUtc, POLL } from '@/lib/format';
import { cn } from '@/lib/utils';

function Stat({ label, value, sub, tone, id }: { label: string; value: string; sub?: string; tone?: 'hot' | 'lime'; id: string }) {
  return (
    <div className="group bg-card px-5 py-5 transition-colors hover:bg-secondary/50">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn('font-display tabular mt-2 text-3xl font-bold', tone === 'hot' && 'text-primary')} data-testid={`stat-${id}`}>
        {tone === 'lime' && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-accent align-middle" />}
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const q = useGetAdminOverview({ query: { queryKey: getGetAdminOverviewQueryKey(), refetchInterval: POLL } });
  const o = q.data;

  return (
    <>
      <PageHeader kicker="живые счётчики" title="Обзор">
        <Link href="/catalogue" data-testid="link-overview-catalogue" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          каталог танцев <ArrowUpRight className="h-3 w-3" />
        </Link>
        {o && <span className="font-mono text-xs text-muted-foreground" data-testid="text-generated-at">срез: {fmtUtc(o.generatedAt)}</span>}
      </PageHeader>

      {q.isLoading && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4" data-testid="state-loading">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card px-5 py-5">
              <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}
      {q.isError && <Panel><ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} /></Panel>}

      {o && (
        <div className="space-y-6">
          {!o.telemetryConnected && (
            <div className="df-rise flex gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 text-sm" data-testid="banner-telemetry">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <b>Телеметрия провайдера не подключена.</b> Цифры отражают только записи серверного шлюза. Существующие отдельные маршруты генерации ещё не инструментированы и сюда не попадают.
              </div>
            </div>
          )}

          <Panel>
            <div className="px-5 pt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Сегодня · UTC</div>
            <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-3">
              <Stat id="today-generations" label="Генераций за сутки" value={fmtNum(o.todayGenerations)} tone="hot" />
              <Stat id="today-cost" label="Оценка расхода за сутки" value={fmtRub(o.todayEstimatedCostRub)} sub="оценка по ставке, не счёт" />
              <Stat id="unpriced" label="Без цены" value={fmtNum(o.unpricedGenerations)} sub="стоимость неизвестна" />
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Panel>
              <div className="flex items-center justify-between px-5 pt-4">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Генерации по статусам · всего</span>
                <Link href="/generations" data-testid="link-overview-generations" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  список <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="px-5 pb-5 pt-3">
                <div className="font-display tabular text-5xl font-extrabold" data-testid="stat-generations">{fmtNum(o.generations)}</div>
                <dl className="mt-5 divide-y divide-border border-y border-border">
                  {[
                    ['queued', 'В очереди', o.queued],
                    ['running', 'Выполняется', o.running],
                    ['succeeded', 'Готово', o.succeeded],
                    ['failed', 'Ошибка', o.failed],
                  ].map(([k, l, v]) => (
                    <div key={k as string} className="flex items-center justify-between py-2.5 text-sm">
                      <dt className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 rounded-full', k === 'running' ? 'df-pulse bg-accent ring-1 ring-foreground/30' : k === 'failed' ? 'bg-destructive' : k === 'succeeded' ? 'bg-foreground' : 'bg-muted-foreground/40')} />
                        {l}
                      </dt>
                      <dd className="font-mono tabular" data-testid={`stat-status-${k}`}>{fmtNum(v as number)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">Оценка расхода за всё время</span>
                  <span className="font-mono" data-testid="stat-total-cost">{fmtRub(o.estimatedCostRub)}</span>
                </div>
              </div>
            </Panel>

            <Panel>
              <div className="flex items-center justify-between px-5 pt-4">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Аудитория</span>
                <Link href="/users" data-testid="link-overview-users" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  люди <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-px bg-border">
                <Stat id="users" label="Пользователей" value={fmtNum(o.users)} />
                <Stat id="subscriptions" label="Активных подписок" value={fmtNum(o.activeSubscriptions)} tone="lime" />
                <Stat id="blocked" label="Заблокировано" value={fmtNum(o.blockedUsers)} />
              </div>
            </Panel>
          </div>

          {o.generations === 0 && o.users === 0 && (
            <p className="text-center text-sm text-muted-foreground" data-testid="text-empty-db">
              База пока пуста — это настоящие нули, а не ошибка загрузки.
            </p>
          )}
        </div>
      )}
    </>
  );
}
