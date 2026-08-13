"use client";

import { BookMarked, FileText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC } from "react";
import { cn } from "@/lib/utils";

/**
 * Navigation is two destinations, so it is two links.
 *
 * There is no collapse control and no icon-only mode: a rail that hides two labels
 * saves nothing and adds a state to get wrong. On narrow viewports it becomes a
 * horizontal strip above the content rather than disappearing behind a trigger.
 */
const DESTINATIONS = [
  { href: "/returns", label: "Returns", icon: FileText },
  { href: "/reference", label: "Reference", icon: BookMarked },
] as const;

const Rail: FC = () => {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="sticky top-0 z-40 flex shrink-0 gap-1 border-border border-b bg-surface px-3 py-2 sm:h-dvh sm:w-52 sm:flex-col sm:gap-0.5 sm:border-r sm:border-b-0 sm:px-3 sm:py-4"
    >
      <Link className="mb-0 hidden items-baseline gap-2 px-3 py-2 sm:mb-4 sm:flex" href="/returns">
        <span className="font-medium text-lg tracking-[-0.01em]">globe</span>
        <span className="font-mono text-micro text-text-faint">GIR</span>
      </Link>

      {DESTINATIONS.map(({ href, label, icon: Icon }) => {
        // `startsWith` so a nested route such as /returns/:id keeps its section marked,
        // but guarded against /reference matching a future /reference-something.
        const active = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-sheet px-3 py-2 text-sm transition-colors duration-150",
              active
                ? "bg-sunk font-medium text-text"
                : "text-text-muted hover:bg-sunk/60 hover:text-text",
            )}
            href={href}
            key={href}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0 transition-colors duration-150",
                active ? "text-text" : "text-text-faint group-hover:text-text-muted",
              )}
              strokeWidth={1.75}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
};

export default Rail;
