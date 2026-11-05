import React from "react";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { DanceAuthProvider, type AccountSession } from "@workspace/auth-web";
import { nativeApiOrigin } from "./api-origin";
export { useDanceAuth, type DanceAuthState } from "@workspace/auth-web";

const origin = nativeApiOrigin({ development: __DEV__,
  productionOrigin: process.env.EXPO_PUBLIC_API_ORIGIN,
  developmentDomain: process.env.EXPO_PUBLIC_DOMAIN });
const client = createAuthClient({
  baseURL: origin, basePath: "/api/auth",
  plugins: [expoClient({ scheme: "danceflow", storagePrefix: "danceflow-auth",
    storage: SecureStore, disableCache: true })],
});
async function loadSession(token: string): Promise<AccountSession> {
  const response = await fetch(`${origin}/api/auth/session`, {
    headers: { Authorization: `Bearer ${token}` }, credentials: "omit",
  });
  if (!response.ok) throw Object.assign(new Error("Не удалось проверить доступ к аккаунту."), { status: response.status });
  return response.json();
}
export function DanceAuthBoundary({ children }: { children: React.ReactNode }) {
  return <DanceAuthProvider client={client} loadSession={loadSession}>{children}</DanceAuthProvider>;
}
