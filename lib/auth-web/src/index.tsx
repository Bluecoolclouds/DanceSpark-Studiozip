import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createAuthClient } from "better-auth/react";

export type AuthIdentity = { user: { id: string }; session: { token: string } };
type Result<T> = { data: T | null; error: { message?: string; status?: number; code?: string } | null };
export type AuthClient = {
  getSession: () => Promise<Result<AuthIdentity>>;
  signIn: { email: (body: { email: string; password: string }) => Promise<Result<unknown>> };
  signUp: { email: (body: { email: string; password: string; name: string }) => Promise<Result<unknown>> };
  signOut: () => Promise<Result<unknown>>;
};
export type AccountSession = { accountId: string; email: string; role: "user" | "admin" };
export type DanceAuthPhase = "loading" | "signed-out" | "signed-in" | "blocked" | "session-error" | "signing-out";
export type DanceAuthState = {
  phase: DanceAuthPhase; isLoaded: boolean; isSignedIn: boolean;
  userId: string | null; email: string | null; role: "user" | "admin" | null;
  getToken: () => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>; retry: () => void;
};
const Context = createContext<DanceAuthState | null>(null);
export function useDanceAuth(): DanceAuthState {
  const value = useContext(Context);
  if (!value) throw new Error("DanceAuthProvider required");
  return value;
}
// Tokens stay in memory on web. HttpOnly cookies restore sessions after reload.
const browserClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
  basePath: "/api/auth",
});
async function browserSession(token: string): Promise<AccountSession> {
  const response = await fetch("/api/auth/session", {
    // The workspace preview proxy also needs its own same-origin access cookie.
    // Identity still comes from this request's explicitly captured bearer token.
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", credentials: "same-origin",
  });
  if (!response.ok) throw Object.assign(new Error("Не удалось проверить доступ к аккаунту."), { status: response.status });
  return response.json();
}
function actionError(error: { status?: number; code?: string; message?: string }): Error {
  if (error.status === 429) return new Error("Слишком много попыток. Подожди и повтори позже.");
  if (error.status === 409) return new Error("Аккаунт уже существует. Для старого аккаунта нужен перенос доступа через оператора.");
  if (error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return new Error("Этот адрес уже используется.");
  if (error.code === "INVALID_EMAIL_OR_PASSWORD" || error.status === 401) return new Error("Неверная почта или пароль.");
  if (error.code === "PASSWORD_TOO_SHORT") return new Error("Пароль должен содержать не менее 10 символов.");
  if (error.status === 403) return new Error("Вход отклонён. Проверь адрес сайта и повтори попытку.");
  return new Error("Не удалось выполнить вход. Проверь соединение и повтори попытку.");
}
export function DanceAuthProvider({ children, client = browserClient, loadSession = browserSession }: {
  children: ReactNode; client?: AuthClient; loadSession?: (token: string) => Promise<AccountSession>;
}) {
  const [state, setState] = useState<{ phase: DanceAuthPhase; account?: AccountSession; token?: string }>({ phase: "loading" });
  const current = useRef(state); current.current = state;
  const epoch = useRef(0);
  const action = useRef(false);
  const refresh = useCallback(async (expected: number) => {
    try {
      const result = await client.getSession();
      if (expected !== epoch.current) return;
      if (result.error) throw actionError(result.error);
      if (!result.data) { setState({ phase: "signed-out" }); return; }
      const token = result.data.session.token;
      const account = await loadSession(token);
      if (expected !== epoch.current) return;
      setState({ phase: "signed-in", account, token });
    } catch (error) {
      if (expected !== epoch.current) return;
      const status = (error as { status?: number }).status;
      setState({ phase: status === 403 ? "blocked" : status === 401 ? "signed-out" : "session-error" });
      throw error;
    }
  }, [client, loadSession]);
  const retry = useCallback(() => {
    const expected = ++epoch.current;
    setState({ phase: "loading" });
    void refresh(expected).catch(() => {});
  }, [refresh]);
  useEffect(() => {
    retry();
    const check = () => { if (!action.current) void refresh(++epoch.current).catch(() => {}); };
    const timer = setInterval(check, 30000);
    if (typeof window !== "undefined") window.addEventListener("focus", check);
    return () => {
      epoch.current++; clearInterval(timer);
      if (typeof window !== "undefined") window.removeEventListener("focus", check);
    };
  }, [retry, refresh]);
  const authenticate = useCallback(async (kind: "in" | "up", email: string, password: string) => {
    if (action.current) throw new Error("Дождись завершения текущего запроса.");
    action.current = true;
    const expected = ++epoch.current;
    try {
      const body = { email: email.trim().toLowerCase(), password };
      const result = kind === "in" ? await client.signIn.email(body)
        : await client.signUp.email({ ...body, name: "Танцор" });
      if (expected !== epoch.current) throw new Error("Сессия изменилась. Войди ещё раз.");
      if (result.error) { setState({ phase: "signed-out" }); throw actionError(result.error); }
      await refresh(expected);
    } catch (error) {
      if (expected === epoch.current) setState(s => s.phase === "loading" ? { phase: "signed-out" } : s);
      throw error instanceof Error ? error : new Error("Не удалось связаться с сервером.");
    } finally { action.current = false; }
  }, [client, refresh]);
  const signOut = useCallback(async () => {
    if (action.current) throw new Error("Дождись завершения текущего запроса.");
    action.current = true; const expected = ++epoch.current;
    // Invalidate credential getters immediately, before React commits the update.
    current.current = { phase: "signing-out" };
    setState({ phase: "signing-out" });
    try {
      const result = await client.signOut();
      if (result.error) throw actionError(result.error);
      if (expected === epoch.current) setState({ phase: "signed-out" });
    } catch (error) {
      if (expected === epoch.current) setState({ phase: "session-error" });
      throw error;
    } finally { action.current = false; }
  }, [client]);
  const account = state.phase === "signed-in" ? state.account : undefined;
  const token = state.token;
  const owner = account?.accountId;
  const getToken = useCallback(async () => {
    const latest = current.current;
    if (!token || latest.phase !== "signed-in" || latest.account?.accountId !== owner || latest.token !== token) {
      // Guest requests may be public; stale signed-in requests must never borrow another identity.
      if (token) throw new Error("Сессия изменилась. Запрос отменён.");
      return null;
    }
    return token;
  }, [token, owner]);
  return <Context.Provider value={{
    phase: state.phase, isLoaded: state.phase !== "loading" && state.phase !== "signing-out",
    isSignedIn: state.phase === "signed-in", userId: account?.accountId ?? null,
    email: account?.email ?? null, role: account?.role ?? null, getToken, retry, signOut,
    signIn: (email, password) => authenticate("in", email, password),
    signUp: (email, password) => authenticate("up", email, password),
  }}>{children}</Context.Provider>;
}
