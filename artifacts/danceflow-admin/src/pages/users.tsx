import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Users as UsersIcon, Pencil, Ban, CircleCheck } from 'lucide-react';
import {
  useListAdminUsers,
  getListAdminUsersQueryKey,
  useUpdateAdminUser,
  getGetAdminOverviewQueryKey,
  getListAdminAuditQueryKey,
  type AdminUser,
} from '@workspace/api-client-react';
import { PageHeader, Panel, ErrorState, EmptyState, SkeletonRows, Pager } from '@/components/states';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiMessage, fmtNum, fmtUtc, PLAN_LABEL, POLL } from '@/lib/format';
import { cn } from '@/lib/utils';

function useUserMutation(onDone?: () => void) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useUpdateAdminUser({
    mutation: {
      onSuccess: (u) => {
        void qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
        void qc.invalidateQueries({ queryKey: getListAdminAuditQueryKey() });
        toast({ title: 'Сохранено', description: `${u.email}: ${u.blocked ? 'заблокирован' : 'активен'}` });
        onDone?.();
      },
      onError: (e) => toast({ title: 'Не сохранено', description: apiMessage(e), variant: 'destructive' }),
    },
  });
}

function EditDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [blocked, setBlocked] = useState(false);
  const [limit, setLimit] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [creditErr, setCreditErr] = useState<string | null>(null);
  const m = useUserMutation(onClose);

  useEffect(() => {
    if (user) {
      setBlocked(user.blocked);
      setLimit(user.dailyLimitOverride === null ? '' : String(user.dailyLimitOverride));
      setCreditLimit(user.dailyCreditOverride === null ? '' : String(user.dailyCreditOverride));
      setErr(null);
      setCreditErr(null);
    }
  }, [user]);

  const submit = () => {
    if (!user) return;
    const t = limit.trim();
    let val: number | null = null;
    if (t !== '') {
      const n = Number(t);
      if (!Number.isInteger(n) || n < 0 || n > 10000) { setErr('Целое число от 0 до 10 000 или пусто'); return; }
      val = n;
    }
    const creditText = creditLimit.trim();
    let creditVal: number | null = null;
    if (creditText !== '') {
      const n = Number(creditText);
      if (!Number.isInteger(n) || n < 0 || n > 100000) { setCreditErr('Целое число от 0 до 100 000 или пусто'); return; }
      creditVal = n;
    }
    setErr(null);
    setCreditErr(null);
    m.mutate({ id: user.id, data: { blocked, dailyLimitOverride: val, dailyCreditOverride: creditVal } });
  };

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Доступ пользователя</DialogTitle>
          <DialogDescription className="break-all font-mono text-xs">{user?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <label className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <div className="font-medium">Заблокирован</div>
              <div className="text-xs text-muted-foreground">Новые генерации будут отклоняться</div>
            </div>
            <Switch checked={blocked} onCheckedChange={setBlocked} data-testid="switch-user-blocked" />
          </label>
          <div>
            <label htmlFor="limit" className="text-sm font-medium">Персональный дневной лимит</label>
            <input id="limit" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="пусто — лимит по тарифу"
              data-testid="input-daily-limit"
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-ring" />
            <p className={cn('mt-1 text-xs', err ? 'text-destructive' : 'text-muted-foreground')}>
              {err ?? 'Генераций в сутки по UTC. 0 — запретить. Пусто — сбросить к тарифу.'}
            </p>
          </div>
          <div>
            <label htmlFor="credit-limit" className="text-sm font-medium">Бесплатные кредиты в день</label>
            <input id="credit-limit" inputMode="numeric" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="пусто — общий лимит"
              data-testid="input-user-daily-credit-limit"
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 font-mono outline-none focus:ring-2 focus:ring-ring" />
            <p className={cn('mt-1 text-xs', creditErr ? 'text-destructive' : 'text-muted-foreground')}>
              {creditErr ?? '0 — отключить; пусто — общий лимит. Изменение действует со следующей выдачи по UTC.'}
            </p>
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm" data-testid="button-cancel-edit">Отмена</button>
          <button type="button" onClick={submit} disabled={m.isPending} data-testid="button-save-user"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60">
            {m.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [confirm, setConfirm] = useState<AdminUser | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onSearch = (v: string) => {
    setInput(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setQ(v.trim().slice(0, 120)); setPage(1); }, 350);
  };

  const params = q ? { q, page } : { page };
  const list = useListAdminUsers(params, {
    query: { queryKey: getListAdminUsersQueryKey(params), refetchInterval: POLL, placeholderData: (p) => p },
  });
  const toggle = useUserMutation(() => setConfirm(null));
  const d = list.data;

  return (
    <>
      <PageHeader kicker="аккаунты приложения" title="Пользователи">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={input} onChange={(e) => onSearch(e.target.value)} placeholder="Поиск по email или id" maxLength={120}
            data-testid="input-search-users"
            className="w-full rounded-full border border-input bg-card py-2 pl-9 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
        </div>
      </PageHeader>
      <Panel>
        {list.isLoading && <SkeletonRows />}
        {list.isError && <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />}
        {d && d.items.length === 0 && (
          <EmptyState icon={<UsersIcon className="h-6 w-6" />} title={q ? 'Никого не нашли' : 'Пользователей пока нет'}
            hint={q ? `По запросу «${q}» совпадений нет.` : 'Они появятся после первого входа в мобильное приложение.'} />
        )}
        {d && d.items.length > 0 && (
          <>
            <div className={cn('overflow-x-auto transition-opacity', list.isPlaceholderData && 'opacity-60')}>
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Пользователь</th>
                    <th className="px-3 py-3 font-medium">Тариф</th>
                    <th className="px-3 py-3 font-medium">Сегодня / всего</th>
                    <th className="px-3 py-3 font-medium">Лимит в сутки</th>
                    <th className="px-3 py-3 font-medium">Кредиты сегодня</th>
                    <th className="px-3 py-3 font-medium">Статус</th>
                    <th className="px-5 py-3 text-right font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.items.map((u) => (
                    <tr key={u.id} className={cn('transition-colors hover:bg-secondary/40', u.blocked && 'bg-destructive/[0.03]')} data-testid={`row-user-${u.id}`}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[240px] truncate font-medium">{u.email}</span>
                          {u.role === 'admin' && <span className="rounded bg-accent px-1.5 text-[10px] font-bold uppercase text-accent-foreground">admin</span>}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">с {fmtUtc(u.createdAt)}</div>
                      </td>
                      <td className="px-3 py-3">
                        {PLAN_LABEL[u.plan] ?? u.plan}
                        {u.subscriptionUntil && <div className="font-mono text-[11px] text-muted-foreground">до {fmtUtc(u.subscriptionUntil)}</div>}
                      </td>
                      <td className="px-3 py-3 font-mono tabular">{fmtNum(u.todayGenerations)} / {fmtNum(u.totalGenerations)}</td>
                      <td className="px-3 py-3 font-mono" data-testid={`text-limit-${u.id}`}>
                        {u.dailyLimitOverride === null ? <span className="text-muted-foreground">по тарифу</span> : <span className="text-primary">{u.dailyLimitOverride}</span>}
                      </td>
                      <td className="px-3 py-3 font-mono" data-testid={`text-credits-${u.id}`}>
                        <span>{fmtNum(u.todayCreditBalance)} / {fmtNum(u.todayCreditGrant)}</span>
                        {u.dailyCreditOverride !== null && <span className="ml-1 text-xs text-primary">персонально</span>}
                        {u.todayCreditReserved > 0 && <span className="block text-xs text-muted-foreground">резерв {fmtNum(u.todayCreditReserved)}</span>}
                      </td>
                      <td className="px-3 py-3">
                        {u.blocked
                          ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive"><Ban className="h-3.5 w-3.5" />блок</span>
                          : <span className="inline-flex items-center gap-1 text-xs font-semibold"><CircleCheck className="h-3.5 w-3.5 text-primary" />активен</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => setEditing(u)} data-testid={`button-edit-user-${u.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition hover:border-foreground/40">
                            <Pencil className="h-3 w-3" /> Лимит
                          </button>
                          <button type="button" onClick={() => setConfirm(u)} data-testid={`button-toggle-block-${u.id}`}
                            className={cn('rounded-md px-2.5 py-1 text-xs font-semibold transition-transform active:scale-95',
                              u.blocked ? 'bg-foreground text-background' : 'bg-destructive/10 text-destructive hover:bg-destructive/15')}>
                            {u.blocked ? 'Разблокировать' : 'Заблокировать'}
                          </button>
                        </div>
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

      <EditDialog user={editing} onClose={() => setEditing(null)} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">{confirm?.blocked ? 'Разблокировать?' : 'Заблокировать?'}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{confirm?.email}</span>
              {confirm?.blocked ? ' снова сможет запускать генерации.' : ' не сможет запускать новые генерации. Действие попадёт в журнал.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-block">Отмена</AlertDialogCancel>
            <AlertDialogAction data-testid="button-confirm-block" disabled={toggle.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirm) toggle.mutate({
                  id: confirm.id,
                  data: {
                    blocked: !confirm.blocked,
                    dailyLimitOverride: confirm.dailyLimitOverride,
                    dailyCreditOverride: confirm.dailyCreditOverride,
                  },
                });
              }}>
              {toggle.isPending ? 'Сохраняем…' : 'Подтвердить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
