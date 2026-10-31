import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Film, Plus, Save, Upload, RotateCw, TriangleAlert, Check, Eye, EyeOff } from 'lucide-react';
import {
  useListAdminCatalogue,
  getListAdminCatalogueQueryKey,
  getListCatalogueQueryKey,
  useCreateCatalogueTemplate,
  useUpdateCatalogueTemplate,
  putCatalogueMedia,
  type CatalogueInput,
  type CatalogueTemplate,
  CatalogueInputCategory,
  CatalogueInputColor,
} from '@workspace/api-client-react';
import { PageHeader, Panel, ErrorState, EmptyState, SkeletonRows } from '@/components/states';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiMessage, POLL } from '@/lib/format';
import { cn } from '@/lib/utils';

type Asset = Parameters<typeof putCatalogueMedia>[1];

const ASSETS: { asset: Asset; label: string; mime: string; accept: string; need: string }[] = [
  { asset: 'video.mp4', label: 'Оригинал видео', mime: 'video/mp4', accept: 'video/mp4', need: 'обязательно' },
  { asset: 'poster.jpg', label: 'Постер', mime: 'image/jpeg', accept: 'image/jpeg', need: 'обязательно' },
  { asset: 'preview.mp4', label: 'Превью MP4', mime: 'video/mp4', accept: 'video/mp4', need: 'по желанию' },
  { asset: 'preview.webm', label: 'Превью WebM', mime: 'video/webm', accept: 'video/webm', need: 'по желанию' },
  { asset: 'reference-poster.jpg', label: 'Постер референса', mime: 'image/jpeg', accept: 'image/jpeg', need: 'если «постер видео»' },
  { asset: 'character-01.jpg', label: 'Персонаж 1', mime: 'image/jpeg', accept: 'image/jpeg', need: 'если референсов ≥ 1' },
  { asset: 'character-02.jpg', label: 'Персонаж 2', mime: 'image/jpeg', accept: 'image/jpeg', need: 'если референсов = 2' },
  { asset: 'result.mp4', label: 'Пример результата', mime: 'video/mp4', accept: 'video/mp4', need: 'если «есть пример»' },
  { asset: 'result-preview.mp4', label: 'Превью результата MP4', mime: 'video/mp4', accept: 'video/mp4', need: 'по желанию' },
  { asset: 'result.webm', label: 'Результат WebM', mime: 'video/webm', accept: 'video/webm', need: 'по желанию' },
];
const MAX_VIDEO = 100 * 1024 * 1024;
const MAX_JPEG = 10 * 1024 * 1024;

const CAT_LABEL: Record<string, string> = { kpop: 'K-pop', street: 'Стрит', disco: 'Диско', trend: 'Тренд' };
const COLOR_LABEL: Record<string, string> = { primary: 'Основной', secondary: 'Вторичный', accent: 'Акцент', violet: 'Фиолетовый', sun: 'Солнечный' };

type Form = {
  title: string; dancer: string; category: CatalogueInput['category']; tagline: string; description: string;
  bpm: string; energy: string; durations: string; moves: string; color: CatalogueInput['color']; isNew: boolean;
  sourceDurationSeconds: string; published: boolean; sortOrder: string; referenceCount: string;
  hasVideoPoster: boolean; hasExample: boolean; prompt: string;
};

const EMPTY: Form = {
  title: '', dancer: '', category: 'trend', tagline: '', description: '', bpm: '', energy: '', durations: '5, 10',
  moves: '', color: 'primary', isNew: true, sourceDurationSeconds: '', published: false, sortOrder: '0',
  referenceCount: '0', hasVideoPoster: false, hasExample: false, prompt: '',
};

const toForm = (t: CatalogueTemplate): Form => ({
  title: t.title, dancer: t.dancer, category: t.category, tagline: t.tagline, description: t.description,
  bpm: t.bpm === null ? '' : String(t.bpm), energy: t.energy === null ? '' : String(t.energy),
  durations: t.durations.join(', '), moves: t.moves.join('\n'), color: t.color, isNew: t.isNew,
  sourceDurationSeconds: t.sourceDurationSeconds === null ? '' : String(t.sourceDurationSeconds),
  published: t.published, sortOrder: String(t.sortOrder), referenceCount: String(t.referenceCount),
  hasVideoPoster: t.hasVideoPoster, hasExample: t.hasExample, prompt: t.prompt,
});

const num = (v: string) => Number(v.trim().replace(',', '.'));

function validate(f: Form): { input?: CatalogueInput; errors: Partial<Record<keyof Form, string>> } {
  const e: Partial<Record<keyof Form, string>> = {};
  const title = f.title.trim();
  if (!title) e.title = 'Обязательное поле';
  else if (title.length > 200) e.title = 'До 200 символов';
  if (f.dancer.length > 200) e.dancer = 'До 200 символов';
  if (f.tagline.length > 500) e.tagline = 'До 500 символов';
  if (f.description.length > 5000) e.description = 'До 5000 символов';
  if (f.prompt.length > 10000) e.prompt = 'До 10000 символов';
  const optInt = (k: keyof Form, v: string, min: number, max: number) => {
    if (v.trim() === '') return null;
    const n = num(v);
    if (!Number.isInteger(n) || n < min || n > max) { e[k] = `Целое от ${min} до ${max} или пусто`; return null; }
    return n;
  };
  const bpm = optInt('bpm', f.bpm, 1, 400);
  const energy = optInt('energy', f.energy, 1, 5);
  let src: number | null = null;
  if (f.sourceDurationSeconds.trim() !== '') {
    const n = num(f.sourceDurationSeconds);
    if (!Number.isFinite(n) || n < 0.1 || n > 300) e.sourceDurationSeconds = 'От 0,1 до 300 с или пусто';
    else src = n;
  }
  const durParts = f.durations.split(/[,\s]+/).filter(Boolean);
  const durations = durParts.map(num);
  if (durations.length < 1 || durations.length > 20 || durations.some((d) => !Number.isInteger(d) || d < 1 || d > 300))
    e.durations = 'От 1 до 20 целых чисел 1–300 через запятую';
  const moves = f.moves.split('\n').map((m) => m.trim()).filter(Boolean);
  if (moves.length > 50 || moves.some((m) => m.length > 500)) e.moves = 'До 50 строк по 500 символов';
  const sortOrder = num(f.sortOrder);
  if (f.sortOrder.trim() === '' || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) e.sortOrder = 'Целое 0–1 000 000';
  const referenceCount = num(f.referenceCount);
  if (![0, 1, 2].includes(referenceCount)) e.referenceCount = '0, 1 или 2';
  if (f.published && src === null && !e.sourceDurationSeconds) e.sourceDurationSeconds = 'Нужна для публикации';
  if (f.published && src !== null && durations.some(d => d > src)) e.durations = 'Варианты длительности не должны превышать исходное видео';
  if (Object.keys(e).length) return { errors: e };
  return {
    errors: e,
    input: {
      title, dancer: f.dancer.trim(), category: f.category, tagline: f.tagline.trim(), description: f.description.trim(),
      bpm, energy, durations, moves, color: f.color, isNew: f.isNew, sourceDurationSeconds: src, published: f.published,
      sortOrder, referenceCount, hasVideoPoster: f.hasVideoPoster, hasExample: f.hasExample, prompt: f.prompt,
    },
  };
}

type UploadState = { status: 'uploading' | 'done' | 'error'; name: string; size: number; message?: string };

const inputCls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-destructive">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Toggle({ label, checked, onChange, id, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; id: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} data-testid={`switch-${id}`} />
    </div>
  );
}

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);

export default function CataloguePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListAdminCatalogue({ query: { queryKey: getListAdminCatalogueQueryKey(), refetchInterval: POLL } });
  const items = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)), [list.data]);

  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [baseline, setBaseline] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Record<string, UploadState>>({});
  const savingRef = useRef(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const current = selected && selected !== 'new' ? items.find((t) => t.id === selected) : undefined;
  const remoteForm = current ? toForm(current) : null;
  const remoteChanged = !!remoteForm && JSON.stringify(remoteForm) !== JSON.stringify(baseline);

  // Follow server changes only when the editor has no local edits.
  useEffect(() => {
    if (remoteForm && remoteChanged && !dirty) {
      setForm(remoteForm);
      setBaseline(remoteForm);
    }
  }, [remoteForm, remoteChanged, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: getListAdminCatalogueQueryKey() });
    void qc.invalidateQueries({ queryKey: getListCatalogueQueryKey() });
  };

  const create = useCreateCatalogueTemplate();
  const update = useUpdateCatalogueTemplate();
  const busy = create.isPending || update.isPending;

  const open = (id: string | 'new') => {
    if (id === selected) return;
    if (dirty && !window.confirm('Есть несохранённые изменения. Отбросить их?')) return;
    const t = id === 'new' ? null : items.find((x) => x.id === id);
    const f = t ? toForm(t) : EMPTY;
    setSelected(id); setForm(f); setBaseline(f); setErrors({}); setServerError(null);
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const save = () => {
    if (savingRef.current || busy) return;
    const { input, errors: e } = validate(form);
    setErrors(e); setServerError(null);
    if (!input) return;
    savingRef.current = true;
    const submitted = form;
    const done = (t: CatalogueTemplate) => {
      const f = toForm(t);
      setSelected(t.id); setForm(f); setBaseline(f);
      invalidate();
    };
    const fail = (err: unknown) => {
      const message = apiMessage(err, 'Публикация невозможна: загрузите исходное видео, постер и все указанные дополнительные файлы. Проверьте доступ к R2.');
      setServerError(message);
      toast({ title: 'Не сохранено', description: message, variant: 'destructive' });
    };
    const settle = () => { savingRef.current = false; };
    if (selected === 'new') {
      create.mutate({ data: { ...input, published: false } }, {
        onSuccess: (t) => { done(t); toast({ title: 'Черновик создан', description: `id: ${t.id}. Теперь загрузите видео и постер.` }); },
        onError: fail, onSettled: settle,
      });
    } else if (selected) {
      update.mutate({ id: selected, data: input }, {
        onSuccess: (t) => {
          done(t);
          toast({ title: 'Сохранено', description: submitted.published !== baseline.published ? (t.published ? 'Танец опубликован' : 'Танец снят с публикации') : undefined });
        },
        onError: fail, onSettled: settle,
      });
    }
  };

  const upload = async (id: string, a: (typeof ASSETS)[number], file: File) => {
    const key = `${id}/${a.asset}`;
    if (uploads[key]?.status === 'uploading') return;
    const isJpeg = a.mime === 'image/jpeg';
    const typeOk = isJpeg ? /^image\/jpe?g$/.test(file.type) || /\.jpe?g$/i.test(file.name) : file.type === a.mime || file.name.toLowerCase().endsWith(a.asset.split('.').pop()!);
    if (!typeOk) { setUploads((u) => ({ ...u, [key]: { status: 'error', name: file.name, size: file.size, message: `Нужен файл ${a.mime}` } })); return; }
    if (file.size > (isJpeg ? MAX_JPEG : MAX_VIDEO)) { setUploads((u) => ({ ...u, [key]: { status: 'error', name: file.name, size: file.size, message: `Больше ${isJpeg ? '10' : '100'} МБ` } })); return; }
    if (file.size === 0) { setUploads((u) => ({ ...u, [key]: { status: 'error', name: file.name, size: 0, message: 'Пустой файл' } })); return; }
    setUploads((u) => ({ ...u, [key]: { status: 'uploading', name: file.name, size: file.size } }));
    try {
      const res = await putCatalogueMedia(id, a.asset, file, { headers: { 'Content-Type': a.mime } });
      setUploads((u) => ({ ...u, [key]: { status: 'done', name: file.name, size: res.size ?? file.size } }));
      invalidate();
    } catch (err) {
      setUploads((u) => ({ ...u, [key]: { status: 'error', name: file.name, size: file.size, message: apiMessage(err) } }));
    }
  };

  const savedId = selected && selected !== 'new' ? selected : null;
  const anyUploading = Object.values(uploads).some((u) => u.status === 'uploading');

  return (
    <div>
      <PageHeader kicker="реальные загруженные танцы" title="Каталог">
        <button type="button" onClick={() => open('new')} data-testid="button-new-dance"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-95">
          <Plus className="h-4 w-4" /> Новый танец
        </button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Panel className="self-start">
          <div className="flex items-center justify-between px-4 pt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span>Все записи</span>
            {list.data && <span data-testid="text-catalogue-count">{list.data.length}</span>}
          </div>
          <div className="p-2">
            {list.isLoading ? <SkeletonRows rows={5} /> : list.isError ? (
              <ErrorState error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
            ) : items.length === 0 ? (
              <EmptyState icon={<Film className="h-5 w-5" />} title="Каталог пуст" hint="Создайте черновик, загрузите оригинал и постер, затем опубликуйте." />
            ) : (
              <ul className="space-y-1">
                {items.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => open(t.id)} data-testid={`button-dance-${t.id}`}
                      className={cn('w-full rounded-lg px-3 py-2.5 text-left transition-colors', selected === t.id ? 'bg-secondary' : 'hover:bg-secondary/60')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{t.title}</span>
                        {t.published
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background"><Eye className="h-3 w-3" />в эфире</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"><EyeOff className="h-3 w-3" />черновик</span>}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{t.id} · {CAT_LABEL[t.category] ?? t.category} · #{t.sortOrder}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {!selected ? (
          <Panel className="grid min-h-[320px] place-items-center p-8">
            <div className="max-w-sm text-center">
              <Film className="mx-auto h-8 w-8 text-primary" />
              <div className="font-display mt-3 text-lg font-bold">Выберите танец</div>
              <p className="mt-1 text-sm text-muted-foreground">Или создайте новый. Новый танец сохраняется черновиком с постоянным id, выданным сервером.</p>
            </div>
          </Panel>
        ) : (
          <div className="space-y-6">
            <Panel>
              <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-5 p-5" data-testid="form-catalogue">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">{savedId ? `id · ${savedId}` : 'новый черновик · id выдаст сервер'}</div>
                    <div className="font-display text-xl font-bold">{form.title || 'Без названия'}</div>
                  </div>
                  {dirty && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground" data-testid="text-unsaved">не сохранено</span>}
                </div>

                {remoteChanged && dirty && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm" data-testid="text-remote-changed">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span className="flex-1">Запись изменилась на сервере. Сохранение перезапишет её вашими правками.</span>
                    <button type="button" className="font-semibold text-primary hover:underline" onClick={() => { if (remoteForm) { setForm(remoteForm); setBaseline(remoteForm); } }}>
                      Загрузить серверную
                    </button>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Название" error={errors.title}><input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} data-testid="input-title" /></Field>
                  <Field label="Танцор" error={errors.dancer}><input className={inputCls} value={form.dancer} onChange={(e) => set('dancer', e.target.value)} data-testid="input-dancer" /></Field>
                  <Field label="Категория">
                    <select className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value as Form['category'])} data-testid="select-category">
                      {Object.values(CatalogueInputCategory).map((c) => <option key={c} value={c}>{CAT_LABEL[c] ?? c}</option>)}
                    </select>
                  </Field>
                  <Field label="Цвет карточки">
                    <select className={inputCls} value={form.color} onChange={(e) => set('color', e.target.value as Form['color'])} data-testid="select-color">
                      {Object.values(CatalogueInputColor).map((c) => <option key={c} value={c}>{COLOR_LABEL[c] ?? c}</option>)}
                    </select>
                  </Field>
                  <Field label="Подзаголовок" error={errors.tagline} className="sm:col-span-2"><input className={inputCls} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} data-testid="input-tagline" /></Field>
                  <Field label="Описание" error={errors.description} className="sm:col-span-2"><textarea rows={3} className={inputCls} value={form.description} onChange={(e) => set('description', e.target.value)} data-testid="input-description" /></Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="BPM" error={errors.bpm} hint="1–400, можно пусто"><input inputMode="numeric" className={inputCls} value={form.bpm} onChange={(e) => set('bpm', e.target.value)} data-testid="input-bpm" /></Field>
                  <Field label="Энергия" error={errors.energy} hint="1–5, можно пусто"><input inputMode="numeric" className={inputCls} value={form.energy} onChange={(e) => set('energy', e.target.value)} data-testid="input-energy" /></Field>
                  <Field label="Длительность оригинала, с" error={errors.sourceDurationSeconds} hint="нужна для публикации"><input inputMode="decimal" className={inputCls} value={form.sourceDurationSeconds} onChange={(e) => set('sourceDurationSeconds', e.target.value)} data-testid="input-source-duration" /></Field>
                  <Field label="Длительности ролика, с" error={errors.durations} hint="через запятую"><input className={inputCls} value={form.durations} onChange={(e) => set('durations', e.target.value)} data-testid="input-durations" /></Field>
                  <Field label="Порядок сортировки" error={errors.sortOrder}><input inputMode="numeric" className={inputCls} value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} data-testid="input-sort-order" /></Field>
                  <Field label="Референсов персонажа" error={errors.referenceCount}>
                    <select className={inputCls} value={form.referenceCount} onChange={(e) => set('referenceCount', e.target.value)} data-testid="select-reference-count">
                      {['0', '1', '2'].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Движения" error={errors.moves} hint="по одному на строку"><textarea rows={4} className={inputCls} value={form.moves} onChange={(e) => set('moves', e.target.value)} data-testid="input-moves" /></Field>
                <Field label="Промпт генерации" error={errors.prompt}><textarea rows={4} className={cn(inputCls, 'font-mono text-xs')} value={form.prompt} onChange={(e) => set('prompt', e.target.value)} data-testid="input-prompt" /></Field>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Toggle id="is-new" label="Метка «Новое»" checked={form.isNew} onChange={(v) => set('isNew', v)} />
                  <Toggle id="has-video-poster" label="Есть постер референса" checked={form.hasVideoPoster} onChange={(v) => set('hasVideoPoster', v)} />
                  <Toggle id="has-example" label="Есть пример результата" checked={form.hasExample} onChange={(v) => set('hasExample', v)} />
                  <Toggle id="published" label={selected === 'new' ? 'Опубликовать (после загрузки)' : 'Опубликовано'} checked={form.published} disabled={selected === 'new'} onChange={(v) => set('published', v)} />
                </div>

                {serverError && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" data-testid="text-save-error">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {serverError}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button type="submit" disabled={busy || (!dirty && selected !== 'new')} data-testid="button-save"
                    className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background transition-transform active:scale-95 disabled:opacity-50">
                    {busy ? <RotateCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {selected === 'new' ? 'Создать черновик' : 'Сохранить'}
                  </button>
                  {dirty && (
                    <button type="button" onClick={() => setForm(baseline)} disabled={busy} data-testid="button-reset"
                      className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">Отменить правки</button>
                  )}
                  <span className="text-xs text-muted-foreground">Сервер не опубликует без оригинала, постера, заявленных файлов и длительности.</span>
                </div>
              </form>
            </Panel>

            <Panel>
              <div className="flex items-center justify-between px-5 pt-4">
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Медиафайлы</span>
                {anyUploading && <span className="font-mono text-[11px] text-primary">идёт загрузка</span>}
              </div>
              {!savedId ? (
                <p className="px-5 pb-5 pt-3 text-sm text-muted-foreground" data-testid="text-save-first">Сначала создайте черновик — файлы привязываются к id, который выдаст сервер.</p>
              ) : (
                <ul className="divide-y divide-border px-5 pb-3 pt-2">
                  {ASSETS.map((a) => {
                    const u = uploads[`${savedId}/${a.asset}`];
                    return (
                      <li key={a.asset} className="flex flex-wrap items-center gap-3 py-3" data-testid={`row-asset-${a.asset}`}>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{a.label} <span className="font-mono text-[11px] text-muted-foreground">{a.asset}</span></div>
                          <div className="text-xs text-muted-foreground">
                            {u?.status === 'uploading' && `загрузка ${u.name} · ${fmtSize(u.size)}`}
                            {u?.status === 'done' && <span className="inline-flex items-center gap-1 text-foreground"><Check className="h-3 w-3 text-primary" />загружено в этой сессии: {u.name} · {fmtSize(u.size)}</span>}
                            {u?.status === 'error' && <span className="text-destructive">{u.name}: {u.message}</span>}
                            {!u && a.need}
                          </div>
                        </div>
                        <label className={cn('inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-secondary',
                          u?.status === 'uploading' && 'pointer-events-none opacity-50')}>
                          {u?.status === 'uploading' ? <RotateCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          {u?.status === 'done' ? 'Заменить' : 'Загрузить'}
                          <input type="file" accept={a.accept} className="sr-only" disabled={u?.status === 'uploading'} data-testid={`input-file-${a.asset}`}
                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(savedId, a, f); }} />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
