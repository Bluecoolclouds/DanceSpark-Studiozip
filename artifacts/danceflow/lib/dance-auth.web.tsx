import React from "react";
import { DanceAuthProvider } from "@workspace/auth-web";
export { useDanceAuth, type DanceAuthState } from "@workspace/auth-web";
export function DanceAuthBoundary({ children }: { children: React.ReactNode }) {
  return <DanceAuthProvider>{children}</DanceAuthProvider>;
}
