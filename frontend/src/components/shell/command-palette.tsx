"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { BookMarked, FileText } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { type FC, useEffect } from "react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatPeriod } from "@/lib/utils";
import { setPaletteOpen, togglePalette, usePaletteOpen } from "./command-store";

/**
 * Jumping between returns without leaving the keyboard.
 *
 * `useQuery` rather than `useSuspenseQuery`: the layout has already prefetched the list
 * so this normally resolves from the cache, but the palette must not suspend the shell
 * if that cache is ever cold. Suspending here would blank the page behind the dialog.
 */
const CommandPalette: FC = () => {
  const router = useRouter();
  const open = usePaletteOpen();

  const { data: returns = [] } = useQuery({
    queryKey: queryKeys.returns,
    queryFn: () => api.listReturns().then((data) => data.returns),
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;

      // The browser binds ctrl+k to the address bar, so the default has to go for the
      // shortcut to reach the page at all.
      event.preventDefault();
      togglePalette();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * Generic over the literal it is called with.
   *
   * `typedRoutes` checks a destination against the route tree by inferring its literal
   * type. A parameter typed as the bare `Route` collapses that to a union and rejects
   * an interpolated dynamic segment, so the type variable has to reach the call site.
   */
  const go = <T extends string>(href: Route<T>) => {
    setPaletteOpen(false);
    router.push(href);
  };

  return (
    <Command.Dialog
      className="-translate-x-1/2 fixed top-[18vh] left-1/2 z-50 w-[min(92vw,34rem)] overflow-hidden rounded-sheet border border-border bg-surface shadow-sheet data-[state=closed]:animate-palette-out data-[state=open]:animate-palette-in"
      label="Jump to"
      onOpenChange={setPaletteOpen}
      open={open}
      overlayClassName="fixed inset-0 z-50 bg-text/25 backdrop-blur-[1px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in"
    >
      <Command.Input
        className="h-12 w-full border-border border-b bg-transparent px-4 font-serif text-base outline-none placeholder:text-text-faint"
        placeholder="Search returns"
      />

      <Command.List className="max-h-80 overflow-y-auto overscroll-contain p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-text-muted">
          Nothing matches that.
        </Command.Empty>

        {returns.length > 0 && (
          <Command.Group
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:text-text-faint [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em]"
            heading="Returns"
          >
            {returns.map((item) => (
              <Command.Item
                className="flex cursor-pointer items-center gap-3 rounded-sheet px-3 py-2.5 text-sm data-[selected=true]:bg-sunk"
                key={item.id}
                keywords={[item.mneGroupName ?? "", item.reportingPeriod]}
                onSelect={() => go(`/returns/${item.id}`)}
                value={`${item.name} ${item.mneGroupName ?? ""}`}
              >
                <FileText
                  aria-hidden="true"
                  className="size-4 shrink-0 text-text-faint"
                  strokeWidth={1.75}
                />
                <span className="min-w-0 truncate">{item.name}</span>
                <span className="figure ml-auto shrink-0 text-text-faint text-xs">
                  {formatPeriod(item.reportingPeriod)}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-micro [&_[cmdk-group-heading]]:text-text-faint [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em]"
          heading="Go to"
        >
          <Command.Item
            className="flex cursor-pointer items-center gap-3 rounded-sheet px-3 py-2.5 text-sm data-[selected=true]:bg-sunk"
            onSelect={() => go("/returns")}
            value="all returns list"
          >
            <FileText
              aria-hidden="true"
              className="size-4 shrink-0 text-text-faint"
              strokeWidth={1.75}
            />
            All returns
          </Command.Item>

          <Command.Item
            className="flex cursor-pointer items-center gap-3 rounded-sheet px-3 py-2.5 text-sm data-[selected=true]:bg-sunk"
            onSelect={() => go("/reference")}
            value="reference fourteen issues guidance schema"
          >
            <BookMarked
              aria-hidden="true"
              className="size-4 shrink-0 text-text-faint"
              strokeWidth={1.75}
            />
            Reference
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
};

export default CommandPalette;
