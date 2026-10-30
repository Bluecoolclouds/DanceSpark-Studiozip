import { Link } from 'wouter';
import { ArrowRight, Wallet, ShieldCheck, Radio, KeyRound } from 'lucide-react';
import { Logo } from '@/components/admin-shell';

const POINTS = [
  { icon: Wallet, title: 'Бюджет ИИ под замком', text: 'Пауза, лимит параллельных задач и дневной потолок трат в рублях. По умолчанию генерации на паузе.' },
  { icon: Radio, title: 'Только настоящая активность', text: 'Счётчики и журнал читаются из базы. Если пусто — значит пусто, без демо-цифр.' },
  { icon: ShieldCheck, title: 'Точечный контроль людей', text: 'Блокировка и персональный дневной лимит. Без ролей и раздачи подписок из браузера.' },
  { icon: KeyRound, title: 'Ключи вне браузера', text: 'Ключ провайдера живёт в секретах рабочего пространства. Пульт видит только факт его наличия.' },
];

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 md:px-10">
        <Logo />
        <Link href="/sign-in" data-testid="link-header-signin" className="rounded-full border border-foreground px-4 py-1.5 text-sm font-semibold transition hover:bg-foreground hover:text-background">
          Войти
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 md:px-10 md:pt-20">
        <div className="df-rise font-mono text-xs uppercase tracking-[0.25em] text-primary">Danceflow · служебный пульт</div>
        <h1 className="df-rise font-display mt-5 max-w-4xl text-[clamp(2.4rem,7vw,5.6rem)] font-extrabold leading-[0.95]" style={{ animationDelay: '80ms' }}>
          Танцы — в приложении.
          <br />
          <span className="relative inline-block">
            <span className="relative z-10">Расходы — здесь.</span>
            <span className="absolute inset-x-0 bottom-[0.08em] z-0 h-[0.32em] bg-accent" />
          </span>
        </h1>
        <p className="df-rise mt-8 max-w-xl text-lg text-muted-foreground" style={{ animationDelay: '160ms' }}>
          Пульт владельца Danceflow: кто пользуется, сколько видео в работе, во что это обходится по оценке — и рычаг, чтобы остановить всё одним переключателем.
        </p>
        <div className="df-rise mt-10 flex flex-wrap gap-3" style={{ animationDelay: '240ms' }}>
          <Link href="/sign-in" data-testid="link-hero-signin"
            className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground transition-transform active:scale-95">
            Войти в пульт <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link href="/sign-up" data-testid="link-hero-signup"
            className="inline-flex items-center rounded-full border border-border px-6 py-3 font-medium transition hover:bg-secondary">
            Создать аккаунт
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Доступ получают только аккаунты с ролью администратора на сервере.</p>
      </section>

      <div className="overflow-hidden border-y border-foreground bg-foreground py-3 text-background">
        <div className="df-marquee flex w-max gap-10 whitespace-nowrap font-display text-sm uppercase tracking-wide">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-10">
              {['пауза по умолчанию', 'квоты по UTC', 'стоимость — оценка', 'журнал действий', 'ключ не покидает сервер', 'опрос каждые 30 секунд'].map((t) => (
                <span key={t} className="flex items-center gap-10">{t}<span className="h-2 w-2 rounded-full bg-accent" /></span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <section className="mx-auto grid max-w-6xl gap-px overflow-hidden px-5 py-16 md:grid-cols-2 md:px-10">
        {POINTS.map(({ icon: Icon, title, text }, i) => (
          <div key={title} className="df-rise border-b border-border py-8 md:odd:pr-10 md:even:pl-10 md:even:border-l" style={{ animationDelay: `${i * 70}ms` }}>
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-xs text-primary">0{i + 1}</span>
              <div>
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-bold">{title}</h2>
                <p className="mt-2 text-muted-foreground">{text}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20 md:px-10">
        <div className="rounded-2xl bg-sidebar p-8 text-sidebar-foreground md:p-12">
          <div className="font-mono text-xs uppercase tracking-[0.2em] text-sidebar-primary">честно о данных</div>
          <p className="font-display mt-4 max-w-3xl text-2xl leading-snug md:text-3xl">
            Суммы в рублях — оценка по вашей ставке за генерацию, а не баланс провайдера и не счёт к оплате.
          </p>
          <Link href="/sign-in" data-testid="link-footer-signin" className="mt-8 inline-flex items-center gap-2 rounded-full bg-sidebar-primary px-5 py-2.5 font-semibold text-sidebar-primary-foreground transition-transform active:scale-95">
            Открыть пульт <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
