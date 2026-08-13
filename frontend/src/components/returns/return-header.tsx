"use client";

import { Code2, FileText, History } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC } from "react";
import Measure, { type MeasureName } from "@/components/ui/measure";
import type { ReturnRecord } from "@/lib/api";
import { cn, formatPeriod } from "@/lib/utils";

/**
 * The header every return sub-page shares.
 *
 * The tabs are links rather than a tab component: each is a real route with its own
 * prefetch, so they have to be navigable, shareable and openable in a new tab. A
 * client-side tab widget would make three of the product's five surfaces unlinkable.
 */
const ReturnHeader: FC<{ record: ReturnRecord; measure?: MeasureName }> = ({
  record,
  measure = "document",
}) => {
  const pathname = usePathname();

  // Written as template literals so `typedRoutes` resolves them against the real route
  // tree. Building the base as a plain string first widens it to `string`, which the
  // typed `Link` rejects.
  const tabs = [
    { href: `/returns/${record.id}`, label: "Document", icon: FileText },
    { href: `/returns/${record.id}/xml`, label: "XML", icon: Code2 },
    { href: `/returns/${record.id}/versions`, label: "Versions", icon: History },
  ] as const;

  return (
    <header className="border-border border-b bg-surface">
      <Measure as={measure} className="pt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h1 className="min-w-0 font-normal text-2xl tracking-[-0.015em]">{record.name}</h1>

          <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
            <div className="flex items-baseline gap-2">
              <dt className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
                Period
              </dt>
              <dd className="figure text-text-muted">{formatPeriod(record.reportingPeriod)}</dd>
            </div>

            {record.mneGroupName !== null && record.mneGroupName.length > 0 && (
              <div className="flex items-baseline gap-2">
                <dt className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
                  Group
                </dt>
                <dd className="text-text-muted">{record.mneGroupName}</dd>
              </div>
            )}
          </dl>
        </div>

        <nav aria-label="Return sections" className="-mb-px mt-6 flex gap-1">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group -mb-px relative flex items-center gap-2 rounded-t-sheet px-3 pb-2.5 text-sm transition-colors duration-150",
                  active
                    ? "font-medium text-text"
                    : "text-text-muted hover:bg-sunk/50 hover:text-text",
                )}
                href={href}
                key={href}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0 transition-colors",
                    active ? "text-text" : "text-text-faint group-hover:text-text-muted",
                  )}
                  strokeWidth={1.75}
                />
                {label}

                {/*
                  The underline is its own element rather than a `border-b` on the link,
                  so it can animate its width from the centre. A border can only appear.
                */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-0.5 origin-center bg-text transition-transform duration-200 ease-out",
                    active ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </Link>
            );
          })}
        </nav>
      </Measure>
    </header>
  );
};

export default ReturnHeader;
