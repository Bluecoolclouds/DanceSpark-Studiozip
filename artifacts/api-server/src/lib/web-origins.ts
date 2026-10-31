import type { IncomingHttpHeaders } from "node:http";
import { getClerkProxyHost } from "../middlewares/clerkProxyMiddleware";

export function allowedWebOrigin(req: { headers: IncomingHttpHeaders }, origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.origin !== origin) return false;
    const hosts = [getClerkProxyHost(req), process.env.REPLIT_DEV_DOMAIN,
      process.env.REPLIT_EXPO_DEV_DOMAIN, process.env.REPLIT_INTERNAL_APP_DOMAIN].filter(Boolean);
    const explicitOrigins = (process.env.DANCEFLOW_WEB_ORIGINS ?? "").split(",").map(value => value.trim());
    return hosts.includes(parsed.host) || explicitOrigins.includes(parsed.origin);
  } catch { return false; }
}
