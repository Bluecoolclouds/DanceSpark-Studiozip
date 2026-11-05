import type { IncomingHttpHeaders } from "node:http";
import { configuredWebOrigins } from "./auth-environment";

export function trustedWebOrigins(): string[] {
  return configuredWebOrigins(process.env);
}
export function allowedWebOrigin(_req: { headers: IncomingHttpHeaders }, origin: string): boolean {
  return trustedWebOrigins().includes(origin);
}
