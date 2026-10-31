import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export class AuthFailure extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export interface LogtoConfiguration {
  endpoint: string;
  issuer: string;
  resource: string;
  webAppId: string;
  adminAppId: string;
}

export interface LogtoPrincipal {
  subject: string;
  issuer: string;
  clientId: string;
}

export function logtoConfiguration(): LogtoConfiguration | null {
  if (process.env.LOGTO_AUTH_ENABLED !== "true") return null;
  try {
    const endpoint = new URL(process.env.LOGTO_ENDPOINT ?? "");
    const webAppId = process.env.LOGTO_WEB_APP_ID ?? "";
    const adminAppId = process.env.LOGTO_ADMIN_APP_ID ?? "";
    const resource = new URL(process.env.LOGTO_API_RESOURCE ?? "");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash || endpoint.pathname !== "/" ||
      !/^[A-Za-z0-9_-]{8,100}$/.test(webAppId) || !/^[A-Za-z0-9_-]{8,100}$/.test(adminAppId) ||
      resource.hash) throw new Error("Invalid configuration");
    return { endpoint: endpoint.href, issuer: new URL("oidc", endpoint).href,
      resource: resource.href, webAppId, adminAppId };
  } catch {
    throw new AuthFailure(503, "auth_not_configured", "Вход через Logto пока не настроен.");
  }
}

function requiredConfiguration(): LogtoConfiguration {
  const config = logtoConfiguration();
  if (!config) throw new AuthFailure(503, "logto_disabled", "Вход через Logto пока не включён.");
  return config;
}

const remoteKeys = new Map<string, JWTVerifyGetKey>();
function keyset(config: LogtoConfiguration): JWTVerifyGetKey {
  let keys = remoteKeys.get(config.issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${config.issuer}/jwks`), { timeoutDuration: 5000 });
    remoteKeys.set(config.issuer, keys);
  }
  return keys;
}

/** The key argument permits offline crypto tests, never a request-selected JWKS. */
export function createLogtoVerifier(config: LogtoConfiguration, keys = keyset(config)) {
  const common = {
    issuer: config.issuer,
    algorithms: ["RS256", "PS256", "ES256", "ES384", "ES512"],
    requiredClaims: ["sub", "iss", "aud", "exp", "iat"],
    clockTolerance: 5,
  };
  return {
    async accessToken(token: string): Promise<LogtoPrincipal> {
      try {
        const { payload } = await jwtVerify(token, keys, { ...common, audience: config.resource });
        if (!payload.sub || payload.sub.length > 255 ||
          typeof payload.client_id !== "string" ||
          ![config.webAppId, config.adminAppId].includes(payload.client_id)) throw new Error("Invalid subject or client");
        return { subject: payload.sub, issuer: config.issuer, clientId: payload.client_id };
      } catch {
        throw new AuthFailure(401, "invalid_access_token", "Сессия Logto недействительна. Войди снова.");
      }
    },
    async identityToken(token: string, principal: LogtoPrincipal): Promise<string | null> {
      try {
        const { payload } = await jwtVerify(token, keys, { ...common, audience: principal.clientId });
        if (payload.sub !== principal.subject || payload.iss !== principal.issuer) throw new Error("Identity mismatch");
        return payload.email_verified === true && typeof payload.email === "string" && payload.email.includes("@")
          ? payload.email.trim().toLowerCase() : null;
      } catch {
        throw new AuthFailure(401, "invalid_identity_token", "Не удалось подтвердить аккаунт Logto. Войди снова.");
      }
    },
  };
}

export const logtoVerifier = {
  accessToken: (token: string) => createLogtoVerifier(requiredConfiguration()).accessToken(token),
  identityToken: (token: string, principal: LogtoPrincipal) =>
    createLogtoVerifier(requiredConfiguration()).identityToken(token, principal),
};
