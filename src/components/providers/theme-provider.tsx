"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Default light for first visit; stored preference in `dreamos-theme` wins on return.
 * `<html suppressHydrationWarning>` covers the class attribute itself.
 * Components reading `useTheme()` synchronously must guard with `useHydrated()`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="dreamos-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
