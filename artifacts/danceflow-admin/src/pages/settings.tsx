import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Pause, Play, TriangleAlert, Info, RotateCw } from 'lucide-react';
import {
  useGetAdminSettings,
  getGetAdminSettingsQueryKey,
  useUpdateAdminSettings,
  getGetAdminOverviewQueryKey,
  getListAdminAuditQueryKey,
  useGetAdminCreditEconomy,
  type AdminSettings,
} from '@workspace/api-client-react';
import { PageHeader, Panel, ErrorState } from '@/components/states';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiMessage, apiStatus, fmtUtc, POLL } from '@/lib/format';
import { cn } from '@/lib/utils';

const intIn = (min: number, max: number) =>
  z.string().trim().min(1, 'Обязательное поле').refine((v) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max, `Целое от ${min} до ${max}`);
const optNum = (min: number, max: number, msg: string) =>
  z.string().trim().refine((v) => v === '' || (Number.isFinite(Number(v.replace(',', '.'))) && Number(v.replace(',', '.')) >= min && Number(v.replace(',', '.')) <= max), msg);

const schema = z.object({
  paused: z.boolean(),
  maxConcurrent: intIn(1, 50),
  perUserConcurrent: intIn(1, 5),
  maxDailySpendRub: optNum(1, 1_000_000, 'От 1 до 1 000 000 ₽ или пусто'),
  dailyFreeCredits: intIn(0, 100_000),
  usdRubRate: z.string().trim().refine((v) => Number.isFinite(Number(v.replace(',', '.'))) && Number(v.replace(',', '.')) > 0 && Number(v.replace(',', '.')) <= 1_000_000, 'Положительный курс до 1 000 000'),
  usdRubSource: z.string().trim().min(1, 'Укажи источник курса').max(100, 'Не более 100 символов'),
  usdRubDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Укажи дату курса'),
});
type FormV = z.infer<typeof schema>;

const toForm = (s: AdminSettings): FormV => ({
  paused: s.paused,
  maxConcurrent: String(s.maxConcurrent),
  perUserConcurrent: String(s.perUserConcurrent),
  maxDailySpendRub: s.maxDailySpendRub === null ? '' : String(s.maxDailySpendRub),
  dailyFreeCredits: String(s.dailyFreeCredits),
  usdRubRate: String(s.usdRubRate),
  usdRubSource: s.usdRubSource,
  usdRubDate: s.usdRubDate,
});
const nul = (v: string) => (v.trim() === '' ? null : Number(v.trim().replace(',', '.')));

function Field({ label, hint, error, children }: { label: string; hint: string; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-border px-5 py-4 md:grid-cols-[1fr_220px] md:items-center">
      <div>
        <div className="font-medium">{label}</div>
        <div className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{error ?? hint}</div>
      </div>
      {children}
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-right font-mono outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

export default function SettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetAdminSettings({ query: { queryKey: getGetAdminSettingsQueryKey(), refetchInterval: POLL } });
  const [calculatorSeconds, setCalculatorSeconds] = useState(15);
  const economy = useGetAdminCreditEconomy({ seconds: calculatorSeconds }, {
    query: { refetchInterval: POLL, retry: false },
  });
  const s = q.data;
  const baseVersion = useRef<number | null>(null);
  const [conflict, setConflict] = useState(false);

  const form = useForm<FormV>({
    resolver: zodResolver(schema),
    defaultValues: {
      paused: true, maxConcurrent: '', perUserConcurrent: '', maxDailySpendRub: '',
      dailyFreeCredits: '0', usdRubRate: '', usdRubSource: '', usdRubDate: '',
    },
  });

  useEffect(() => {
    if (s && baseVersion.current === null) {
      baseVersion.current = s.version;
      form.reset(toForm(s));
    }
  }, [s, form]);

  const mut = useUpdateAdminSettings({
    mutation: {
      onSuccess: (next) => {
        qc.setQueryData(getGetAdminSettingsQueryKey(), next);
        void qc.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
        void qc.invalidateQueries({ queryKey: getListAdminAuditQueryKey() });
        baseVersion.current = next.version;
        form.reset(toForm(next));
        setConflict(false);
        toast({ title: 'Настройки сохранены', description: `Версия ${next.version}` });
      },
      onError: (e) => {
        if (apiStatus(e) === 409) { setConflict(true); return; }
        toast({ title: 'Не сохранено', description: apiMessage(e), variant: 'destructive' });
      },
    },
  });

  const reloadFromServer = async () => {
    const r = await q.refetch();
    if (r.data) {
      baseVersion.current = r.data.version;
      form.reset(toForm(r.data));
      setConflict(false);
    }
  };

  const onSubmit = form.handleSubmit((v) => {
    if (baseVersion.current === null) return;
    mut.mutate({
      data: {
        version: baseVersion.current,
        paused: v.paused,
        maxConcurrent: Number(v.maxConcurrent),
        perUserConcurrent: Number(v.perUserConcurrent),
        maxDailySpendRub: nul(v.maxDailySpendRub),
        dailyFreeCredits: Number(v.dailyFreeCredits),
        usdRubRate: Number(v.usdRubRate.replace(',', '.')),
        usdRubSource: v.usdRubSource.trim(),
        usdRubDate: v.usdRubDate,
      },
    });
  });

  const errs = form.formState.errors;
  const paused = form.watch('paused');
  const stale = !!s && baseVersion.current !== null && s.version !== baseVersion.current;

  return (
    <>
      <PageHeader kicker="защита бюджета" title="Расход ИИ">
        {s && <span className="font-mono text-xs text-muted-foreground">версия {s.version} · {fmtUtc(s.updatedAt)}</span>}
      </PageHeader>

      {q.isLoading && <Panel><div className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}</div></Panel>}
      {q.isError && !s && <Panel><ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} /></Panel>}

      {s && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {(conflict || stale) && (
              <div className="df-rise flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm" data-testid="banner-conflict">
                <TriangleAlert className="h-4 w-4 text-destructive" />
                <span className="flex-1">
                  {conflict ? 'Сохранение отклонено: настройки уже изменил кто-то другой.' : 'На сервере появилась новая версия настроек.'} Ваши правки не применены. Загрузите актуальные значения и внесите изменения заново.
                </span>
                <button type="button" onClick={() => void reloadFromServer()} data-testid="button-reload-settings"
                  className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background">
                  <RotateCw className="h-3.5 w-3.5" /> Обновить
                </button>
              </div>
            )}

            <Controller control={form.control} name="paused" render={({ field }) => (
              <button type="button" onClick={() => field.onChange(!field.value)} data-testid="button-toggle-paused"
                className={cn('df-rise flex w-full items-center gap-5 rounded-xl border-2 px-6 py-5 text-left transition-all active:scale-[0.99]',
                  field.value ? 'border-foreground bg-foreground text-background' : 'border-accent bg-accent/25')}>
                <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-full', field.value ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground')}>
                  {field.value ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </span>
                <span className="flex-1">
                  <span className="font-display block text-xl font-bold">{field.value ? 'Генерации на паузе' : 'Генерации разрешены'}</span>
                  <span className="text-sm opacity-75">{field.value ? 'Шлюз отклоняет новые задачи. Нажмите, чтобы разрешить.' : 'Шлюз принимает задачи в пределах лимитов. Нажмите, чтобы остановить.'}</span>
                </span>
                <Switch checked={field.value} tabIndex={-1} className="pointer-events-none" />
              </button>
            )} />

            <Panel>
              <Field label="Параллельных задач всего" hint="От 1 до 50" error={errs.maxConcurrent?.message}>
                <input {...form.register('maxConcurrent')} inputMode="numeric" className={inputCls} data-testid="input-max-concurrent" />
              </Field>
              <Field label="Параллельных задач на человека" hint="От 1 до 5" error={errs.perUserConcurrent?.message}>
                <input {...form.register('perUserConcurrent')} inputMode="numeric" className={inputCls} data-testid="input-per-user-concurrent" />
              </Field>
              <Field label="Потолок расхода в сутки, ₽" hint="Оценочный, сутки по UTC. Без бюджета нельзя снять паузу." error={errs.maxDailySpendRub?.message}>
                <input {...form.register('maxDailySpendRub')} inputMode="decimal" placeholder="не задан" className={inputCls} data-testid="input-max-daily-spend" />
              </Field>
              <Field label="Ежедневные бесплатные кредиты" hint="На аккаунт по UTC. 0 — не выдавать; изменения действуют со следующей выдачи." error={errs.dailyFreeCredits?.message}>
                <input {...form.register('dailyFreeCredits')} inputMode="numeric" className={inputCls} data-testid="input-daily-free-credits" />
              </Field>
              <Field label="Курс USD/RUB" hint="Снимок курса для новых расчётов и бюджета." error={errs.usdRubRate?.message}>
                <input {...form.register('usdRubRate')} inputMode="decimal" className={inputCls} data-testid="input-usd-rub-rate" />
              </Field>
              <Field label="Источник курса" hint="Сохраняется вместе с каждой оценкой." error={errs.usdRubSource?.message}>
                <input {...form.register('usdRubSource')} className={inputCls} data-testid="input-usd-rub-source" />
              </Field>
              <Field label="Дата курса" hint="Дата, на которую указан курс." error={errs.usdRubDate?.message}>
                <input {...form.register('usdRubDate')} type="date" className={inputCls} data-testid="input-usd-rub-date" />
              </Field>
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <span className="text-xs text-muted-foreground">{form.formState.isDirty ? 'Есть несохранённые изменения' : 'Изменений нет'}{paused ? '' : ' · генерации активны'}</span>
                <div className="flex gap-2">
                  <button type="button" disabled={!form.formState.isDirty || mut.isPending} onClick={() => form.reset(toForm(s))} data-testid="button-reset-settings"
                    className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-40">Сбросить</button>
                  <button type="submit" disabled={!form.formState.isDirty || mut.isPending || conflict || stale} data-testid="button-save-settings"
                    className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-40">
                    {mut.isPending ? 'Сохраняем…' : 'Сохранить'}
                  </button>
                </div>
              </div>
            </Panel>
          </form>

          <aside className="space-y-4">
            <Panel className="p-5" data-testid="panel-credit-economy">
              <div className="font-display text-lg font-bold">Кредиты и экономика</div>
              {economy.data && (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Аккаунтов</span><b>{economy.data.registeredAccounts.toLocaleString('ru-RU')}</b></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Максимальная выдача / день</span><b>{economy.data.effectiveDailyCredits.toLocaleString('ru-RU')} кр. · {economy.data.maxDailyCreditValueRub.toLocaleString('ru-RU')} ₽</b></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Оценка максимальных затрат API</span><b>≈ {economy.data.estimatedMaxApiCostRub.toLocaleString('ru-RU')} ₽</b></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">API за сегодня</span><b>{economy.data.todayEstimatedApiCostRub.toLocaleString('ru-RU')} ₽</b></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Из генераций за кредиты</span><b>{economy.data.todayCreditApiCostRub.toLocaleString('ru-RU')} ₽</b></div>
                  <p className="text-xs text-muted-foreground">1 кредит = 1 ₽ клиентской цены. В цену заложена наценка 15%; оценка затрат API использует себестоимость без наценки. Не включает скидки Higgsfield, комиссии и налоги.</p>
                </div>
              )}
              {economy.isError && <p className="mt-3 text-sm text-destructive">Не удалось загрузить расчёт экономики.</p>}
              <div className="mt-4 flex items-center justify-between gap-3">
                <label htmlFor="calculator-seconds" className="text-sm font-medium">Длительность входа, сек.</label>
                <input id="calculator-seconds" type="number" min={4} max={300} step={1} value={calculatorSeconds}
                  onChange={(event) => setCalculatorSeconds(Math.max(4, Math.min(300, Number(event.target.value) || 4)))}
                  className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right font-mono" data-testid="input-credit-calculator-seconds" />
              </div>
              {economy.data && (
                <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-border">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="sticky top-0 bg-muted text-muted-foreground">
                      <tr><th className="p-2">Модель / качество</th><th className="p-2">Оплачиваемые сек.</th><th className="p-2">API ₽</th><th className="p-2">Цена ₽</th><th className="p-2">Кредиты</th></tr>
                    </thead>
                    <tbody>
                      {economy.data.rows.map((row) => (
                        <tr key={`${row.model}-${row.resolution}`} className="border-t border-border">
                          <td className="p-2"><span className="font-medium">{row.modelName}</span><br />{row.resolution}</td>
                          <td className="p-2">{row.billableSeconds}</td>
                          <td className="p-2">{row.providerCostRub.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2">{row.customerPriceRub.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2 font-semibold">{row.credits}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {economy.data && <p className="mt-2 text-xs text-muted-foreground">Тарифы до скидок: {economy.data.usdRubSource}, {economy.data.usdRubDate}; текущий курс {economy.data.usdRubRate}. Ссылки на официальные тарифы Higgsfield есть в таблице модели.</p>}
            </Panel>
            <Panel className="p-5">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"><KeyRound className="h-3.5 w-3.5" />Ключ провайдера</div>
              <div className="mt-3 flex items-center gap-2" data-testid="status-provider-key">
                <span className={cn('h-2.5 w-2.5 rounded-full', s.providerKeyConfigured ? 'bg-accent ring-1 ring-foreground/30' : 'bg-destructive')} />
                <span className="font-display font-bold">{s.providerKeyConfigured ? 'Настроен' : 'Не найден'}</span>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Провайдер</dt><dd className="font-mono">{s.provider}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Хранение</dt><dd className="font-mono">{s.keyStorage}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Квоты</dt><dd className="font-mono">{s.quotaTimezone}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Ключ хранится в секретах рабочего пространства, а не в базе. Пульт не может показать или заменить его — это делается в настройках секретов Replit.
              </p>
            </Panel>
            <Panel className="p-5">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground"><Info className="h-3.5 w-3.5" />Охват</div>
              {s.telemetryConnected ? (
                <p className="mt-3 text-sm">Телеметрия шлюза подключена. Суммы остаются оценкой по вашей ставке, а не счётом провайдера.</p>
              ) : (
                <p className="mt-3 text-sm" data-testid="text-telemetry-off">
                  <b>Счёт Higgsfield не подключён.</b> Расход API считается по опубликованным тарифам до скидок и подтверждённому курсу. Скидки аккаунта, фактическая тарификация и итоговый счёт могут отличаться; неподдерживаемые по цене модели не запускаются.
                </p>
              )}
            </Panel>
          </aside>
        </div>
      )}
    </>
  );
}
