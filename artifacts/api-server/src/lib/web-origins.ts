import type { IncomingHttpHeaders } from "node:http";

export function trustedWebOrigins(): string[] {
  const hosts = [process.env.REPLIT_DEV_DOMAIN, process.env.REPLIT_EXPO_DEV_DOMAIN,
    process.env.REPLIT_INTERNAL_APP_DOMAIN, ...(process.env.REPLIT_DOMAINS ?? "").split(",")];
  const origins = [...hosts.filter(Boolean).map(host => `https://${host}`),
    ...(process.env.DANCEFLOW_WEB_ORIGINS ?? "").split(",")];
  return [...new Set(origins.map(value => value.trim()).filter(value => {
    try { return new URL(value).protocol === "https:" && new URL(value).origin === value; }
    catch { return false; }
  }))];
}
export function allowedWebOrigin(_req: { headers: IncomingHttpHeaders }, origin: string): boolean {
  return trustedWebOrigins().includes(origin);
}
