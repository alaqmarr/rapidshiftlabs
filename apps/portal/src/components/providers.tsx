"use client";

import type React from "react";
import { SessionProvider } from "next-auth/react";
import { AlertProvider } from "./ui/alert-popup";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AlertProvider>{children}</AlertProvider>
    </SessionProvider>
  );
}
