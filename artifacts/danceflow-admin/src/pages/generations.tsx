import { useState } from 'react';
import { Clapperboard } from 'lucide-react';
import {
  useListAdminGenerations,
  getListAdminGenerationsQueryKey,
  type ListAdminGenerationsStatus,
} from '@workspace/api-client-react';
import { PageHeader, Panel, ErrorState, EmptyState, SkeletonRows, Pager, StatusPill } from '@/components/states';
import { fmtRub, fmtUtc, POLL } from '@/lib/format';
import { cn } from '@/lib/utils';

const FILTERS: { v: ListAdminGenerationsStatus; l: string }[] = [
  { v: 'all', l: 'Все' },
  { v: 'queued', l: 'В очереди' },
  { v: 'running', l: 'Выполняются' },
  { v: 'succeeded', l: 'Готово' },
  { v: 'failed', l: 'Ошибки' },
];

export default function Generations() {
  const [status, setStatus] = useState<ListAdminGenerationsStatus>('all');
  const [page, setPage] = useState(1);
  const params = { status, page };
  const q = useListAdminGenerations(params, {
    query: { queryKey: getListAdminGenerationsQueryKey(params), refetchInterval: POLL, placeholderData: (p) => p },
  });
  const d = q.data;

  return (
    <>
      <PageHeader kicker="очередь и история" title="Генерации" />
      <div className="df-rise mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.v} type="button" data-testid={`button-filter-${f.v}`}
            onClick={() => { setStatus(f.v); setPage(1); }}
            className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95',
              status === f.v ? 'border-foreground bg-foreground text-background' : 'border-border hover:border-foreground/40')}>
            {f.l}
          </button>
        ))}
      </div>
      <Panel>
        {q.isLoading && <SkeletonRows />}
        {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />}
        {d && d.items.length === 0 && (
          <EmptyState icon={<Clapperboard className="h-6 w-6" />} title="Генераций нет"
            hint={status === 'all' ? 'Шлюз ещё не записал ни одной задачи.' : 'С этим статусом сейчас ничего нет.'} />
        )}
        {d && d.items.length > 0 && (
          <>
            <div className={cn('overflow-x-auto transition-opacity', q.isPlaceholderData && 'opacity-60')}>
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Создана</th>
                    <th className="px-3 py-3 font-medium">Пользователь</th>
                    <th className="px-3 py-3 font-medium">Шаблон</th>
                    <th className="px-3 py-3 font-medium">Статус</th>
                    <th className="px-3 py-3 font-medium">Код ошибки</th>
                    <th className="px-5 py-3 text-right font-medium">Стоимость, оценка</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.items.map((g) => (
                    <tr key={g.id} className="transition-colors hover:bg-secondary/40" data-testid={`row-generation-${g.id}`}>
                      <td className="px-5 py-3 font-mono text-xs">
                        {fmtUtc(g.createdAt)}
                        {g.completedAt && <div className="text-muted-foreground">до {fmtUtc(g.completedAt)}</div>}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-3">{g.userEmail}</td>
                      <td className="px-3 py-3 font-mono text-xs">{g.templateId}</td>
                      <td className="px-3 py-3"><StatusPill status={g.status} /></td>
                      <td className="px-3 py-3 font-mono text-xs text-destructive" data-testid={`text-error-${g.id}`}>{g.errorCode ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className={cn('px-5 py-3 text-right font-mono text-xs', g.estimatedCostRub === null && 'text-muted-foreground italic')}>
                        {fmtRub(g.estimatedCostRub)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </Panel>
      <p className="mt-3 text-xs text-muted-foreground">Показываются только безопасные коды ошибок. Сообщения провайдера в пульт не передаются.</p>
    </>
  );
}
