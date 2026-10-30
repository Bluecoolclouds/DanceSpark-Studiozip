import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useListAdminAudit, getListAdminAuditQueryKey } from '@workspace/api-client-react';
import { PageHeader, Panel, ErrorState, EmptyState, SkeletonRows, Pager } from '@/components/states';
import { fmtUtc, POLL } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Audit() {
  const [page, setPage] = useState(1);
  const params = { page };
  const q = useListAdminAudit(params, {
    query: { queryKey: getListAdminAuditQueryKey(params), refetchInterval: POLL, placeholderData: (p) => p },
  });
  const d = q.data;
  return (
    <>
      <PageHeader kicker="кто и что менял" title="Журнал" />
      <Panel>
        {q.isLoading && <SkeletonRows />}
        {q.isError && <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />}
        {d && d.items.length === 0 && (
          <EmptyState icon={<ScrollText className="h-6 w-6" />} title="Журнал пуст" hint="Действия администраторов появятся здесь сразу после первого изменения." />
        )}
        {d && d.items.length > 0 && (
          <>
            <ol className={cn('divide-y divide-border transition-opacity', q.isPlaceholderData && 'opacity-60')}>
              {d.items.map((e) => (
                <li key={e.id} className="grid gap-1 px-5 py-4 transition-colors hover:bg-secondary/40 md:grid-cols-[170px_1fr]" data-testid={`row-audit-${e.id}`}>
                  <div className="font-mono text-xs text-muted-foreground">{fmtUtc(e.createdAt)}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-foreground px-2 py-0.5 font-mono text-[11px] text-background">{e.action}</span>
                      {e.targetId && <span className="font-mono text-xs text-muted-foreground">→ {e.targetId}</span>}
                    </div>
                    {e.details && <p className="mt-1.5 break-words text-sm">{e.details}</p>}
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">актор {e.actorId}</div>
                  </div>
                </li>
              ))}
            </ol>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </>
  );
}
