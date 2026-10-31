import { useEffect, useMemo, type ComponentType, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useAuth } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AdminGate } from '@/components/admin-shell';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import Overview from '@/pages/overview';
import UsersPage from '@/pages/users';
import Generations from '@/pages/generations';
import SettingsPage from '@/pages/settings';
import Audit from '@/pages/audit';
import CataloguePage from '@/pages/catalogue';

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(331 78% 50%)',
    colorForeground: 'hsl(272 38% 13%)',
    colorMutedForeground: 'hsl(272 12% 40%)',
    colorDanger: 'hsl(6 76% 48%)',
    colorBackground: 'hsl(40 60% 98%)',
    colorInput: 'hsl(38 45% 95%)',
    colorInputForeground: 'hsl(272 38% 13%)',
    colorNeutral: 'hsl(272 20% 30%)',
    fontFamily: "'Golos Text', system-ui, sans-serif",
    borderRadius: '0.625rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[hsl(40_60%_98%)] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[hsl(36_22%_83%)] shadow-[0_24px_60px_-30px_hsl(272_40%_11%/0.5)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: "text-[hsl(272_38%_13%)] font-bold [font-family:'Unbounded',sans-serif]",
    headerSubtitle: 'text-[hsl(272_12%_40%)]',
    socialButtonsBlockButtonText: 'text-[hsl(272_38%_13%)] font-medium',
    formFieldLabel: 'text-[hsl(272_38%_13%)] font-medium',
    footerActionLink: 'text-[hsl(331_78%_45%)] font-semibold',
    footerActionText: 'text-[hsl(272_12%_40%)]',
    dividerText: 'text-[hsl(272_12%_40%)]',
    identityPreviewEditButton: 'text-[hsl(331_78%_45%)]',
    formFieldSuccessText: 'text-[hsl(150_50%_28%)]',
    alertText: 'text-[hsl(272_38%_13%)]',
    logoBox: 'h-12 justify-center',
    logoImage: 'h-12 w-12',
    socialButtonsBlockButton: 'border border-[hsl(36_22%_80%)] bg-[hsl(40_60%_98%)]',
    formButtonPrimary: 'bg-[hsl(331_78%_50%)] text-[hsl(40_60%_98%)] font-semibold shadow-none',
    formFieldInput: 'bg-[hsl(38_45%_95%)] border border-[hsl(36_20%_78%)] text-[hsl(272_38%_13%)]',
    footerAction: 'justify-center',
    dividerLine: 'bg-[hsl(36_22%_83%)]',
    alert: 'border border-[hsl(6_76%_48%/0.3)] bg-[hsl(6_76%_48%/0.06)]',
    otpCodeFieldInput: 'border border-[hsl(36_20%_78%)] text-[hsl(272_38%_13%)]',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

function AuthFrame({ children }: { children: ReactNode }) {
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

function SignInPage() {
  return (
    <AuthFrame>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthFrame>
  );
}

function SignUpPage() {
  return (
    <AuthFrame>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthFrame>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/overview" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function protect(Page: ComponentType) {
  return function Protected() {
    return (
      <AdminGate>
        <Page />
      </AdminGate>
    );
  };
}

const OverviewRoute = protect(Overview);
const UsersRoute = protect(UsersPage);
const GenerationsRoute = protect(Generations);
const SettingsRoute = protect(SettingsPage);
const AuditRoute = protect(Audit);
const CatalogueRoute = protect(CataloguePage);

function AccountQueryProvider({ children }: { children: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  // Never render the next identity with the previous account's cached session.
  // Late responses and mutations remain attached to the discarded client.
  const qc = useMemo(() => new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 10_000 } },
  }), [userId]);
  useEffect(() => {
    return () => {
      void qc.cancelQueries();
      qc.clear();
    };
  }, [qc]);
  if (!isLoaded) return null;
  return (
    <QueryClientProvider client={qc} key={userId ?? 'guest'}>
      {children}
    </QueryClientProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/overview`}
      signUpFallbackRedirectUrl={`${basePath}/overview`}
      localization={{
        signIn: {
          start: {
            title: 'Вход в пульт',
            subtitle: 'Только для администраторов Danceflow',
          },
        },
        signUp: {
          start: {
            title: 'Новый аккаунт',
            subtitle: 'Доступ к пульту выдаёт владелец на сервере',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <AccountQueryProvider>
        <TooltipProvider>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/overview" component={OverviewRoute} />
              <Route path="/users" component={UsersRoute} />
              <Route path="/generations" component={GenerationsRoute} />
              <Route path="/settings" component={SettingsRoute} />
              <Route path="/audit" component={AuditRoute} />
              <Route path="/catalogue" component={CatalogueRoute} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </AccountQueryProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
