import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { ReactNode } from "react";
import CommandPalette from "@/components/shell/command-palette";
import Rail from "@/components/shell/rail";
import Topbar from "@/components/shell/topbar";
import { api } from "@/lib/api";
import { getQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { requireUser, sessionCookie } from "@/lib/server-session";

/**
 * The authenticated shell.
 *
 * The guard runs here rather than in each page so a route added later is protected by
 * being in this segment, not by remembering to call the guard.
 *
 * The schema reference and the returns list are prefetched at the layout because both
 * the topbar and the palette read them on every authenticated page. Prefetching them
 * per-page would refetch on each navigation and flash the version out of the topbar.
 */
const AppLayout = async ({ children }: { children: ReactNode }) => {
  const user = await requireUser();
  const cookie = await sessionCookie();

  const queryClient = getQueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.referenceSchema,
      queryFn: () => api.referenceSchema(cookie),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.returns,
      queryFn: () => api.listReturns(cookie).then((data) => data.returns),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {/*
        Column on a phone, row from `sm` up.
        A plain `flex` is a row at every width, which puts the rail beside the content on
        a 412px screen and leaves the page about 160px to render in. The rail styles
        itself as a horizontal strip at the same breakpoint, so the two have to agree.
      */}
      <div className="flex min-h-dvh flex-col sm:flex-row">
        <Rail />

        {/*
          The content sits on the surface and the rail on the ground, which is what
          separates them. The alternative is a rule down the full height of every route,
          and that reads as a frame drawn around the document rather than as chrome.
        */}
        <div className="flex min-w-0 flex-1 flex-col bg-surface">
          <Topbar email={user.email} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>

        <CommandPalette />
      </div>
    </HydrationBoundary>
  );
};

export default AppLayout;
