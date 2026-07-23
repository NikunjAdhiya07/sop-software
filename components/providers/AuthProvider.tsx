"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

/**
 * NextAuth session client. Keep `basePath` on the App Router auth catch-all
 * (`/api/auth`). If `/api/auth/session` ever returns HTML (compile/runtime
 * error page), next-auth logs CLIENT_FETCH_ERROR — that is a symptom of the
 * app being broken, not a missing login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth" refetchOnWindowFocus refetchInterval={0}>
      {children}
    </SessionProvider>
  );
}
