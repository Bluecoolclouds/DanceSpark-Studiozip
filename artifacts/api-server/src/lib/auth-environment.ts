type Environment = Readonly<Record<string, string | undefined>>;

function httpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value && !url.username && !url.password;
  } catch { return false; }
}

function releaseHost(origin: string): boolean {
  const host = new URL(origin).hostname.toLowerCase();
  return host.includes(".") && !host.includes("*") && !host.includes(":") &&
    !/^[\d.]+$/.test(host) &&
    !["localhost", "local", "internal", "replit.dev", "repl.co"].some(
      suffix => host === suffix || host.endsWith(`.${suffix}`));
}

export function configuredWebOrigins(env: Environment): string[] {
  const explicit = (env.DANCEFLOW_WEB_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (env.NODE_ENV === "production") {
    if (!explicit.length) throw new Error("Set DANCEFLOW_WEB_ORIGINS to the exact public HTTPS origin(s) before publishing.");
    if (explicit.some(origin => !httpsOrigin(origin) || !releaseHost(origin))) {
      throw new Error("DANCEFLOW_WEB_ORIGINS must contain public HTTPS origins only; development, local, wildcard and path URLs are forbidden in production.");
    }
    return [...new Set(explicit)];
  }
  const runtime = [env.REPLIT_DEV_DOMAIN, env.REPLIT_EXPO_DEV_DOMAIN,
    env.REPLIT_INTERNAL_APP_DOMAIN, ...(env.REPLIT_DOMAINS ?? "").split(",")]
    .filter(Boolean).map(host => `https://${host!.trim()}`).filter(httpsOrigin);
  // Imported .replit files can retain another workspace's preview domains.
  // Only current runtime preview origins are trusted, not those stale entries.
  const additional = explicit.filter(httpsOrigin).filter(origin =>
    releaseHost(origin) || runtime.includes(origin));
  return [...new Set([...runtime, ...additional])];
}

export function authReleaseProblems(env: Environment): string[] {
  const problems: string[] = [];
  try { configuredWebOrigins({ ...env, NODE_ENV: "production" }); }
  catch (error) { problems.push((error as Error).message); }
  const secret = env.BETTER_AUTH_SECRET || env.SESSION_SECRET;
  if (!secret || secret.length < 32) problems.push("A stable BETTER_AUTH_SECRET or SESSION_SECRET of at least 32 characters is required.");
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is required.");
  return problems;
}
