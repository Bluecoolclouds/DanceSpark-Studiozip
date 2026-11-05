import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { DanceAuthProvider, useDanceAuth } from '@workspace/auth-web';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { AdminAuthForm, AuthLoader, AuthPhaseGate, AuthCallbackPage } from '@/components/auth-status';
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


const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function SignInPage() {
  return <AdminAuthForm mode="sign-in" />;
}

function SignUpPage() {
  return <AdminAuthForm mode="sign-up" />;
}

function HomeRedirect() {
  const { isSignedIn } = useDanceAuth();
  return isSignedIn ? <Redirect to="/overview" /> : <Landing />;
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
  const { userId, getToken } = useDanceAuth();
  const [transportOwner, setTransportOwner] = useState<string | null | undefined>(undefined);
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
  useEffect(() => {
    // Every API call (including the admin session) carries the canonical identity's token.
    setAuthTokenGetter(() => getToken());
    setTransportOwner(userId);
    return () => setAuthTokenGetter(null);
  }, [getToken, userId]);
  if (transportOwner !== userId) return <AuthLoader label="подключаем авторизацию" />;
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

function App() {
  return (
    <WouterRouter base={basePath}>
      <DanceAuthProvider>
        <AccountQueryProvider>
          <TooltipProvider>
            <RoutedErrorBoundary>
              <AuthPhaseGate>
                <Switch>
                  <Route path="/auth/callback" component={AuthCallbackPage} />
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
              </AuthPhaseGate>
            </RoutedErrorBoundary>
            <Toaster />
          </TooltipProvider>
        </AccountQueryProvider>
      </DanceAuthProvider>
    </WouterRouter>
  );
}

export default App;
