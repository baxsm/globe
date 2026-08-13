"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { getQueryClient } from "@/lib/query-client";

/**
 * `getQueryClient` is called during render rather than held in a `useState`.
 *
 * The function already returns the browser singleton, so calling it here cannot create
 * a second client. Wrapping it in state would instead pin the very first client for the
 * life of the tree, which is the same object anyway but hides where it comes from.
 */
const Providers = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={getQueryClient()}>
    {children}
    <Toaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!bg-surface !border !border-border !text-text !rounded-sheet !font-serif !shadow-none",
          description: "!text-text-muted",
          error: "!text-ink-struck",
        },
      }}
    />
  </QueryClientProvider>
);

export default Providers;
