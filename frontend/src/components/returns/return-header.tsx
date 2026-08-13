"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC } from "react";
import type { ReturnRecord } from "@/lib/api";
import { cn, formatPeriod } from "@/lib/utils";

/**
 * The header every return sub-page shares.
 *
 * The tabs are links rather than a tab component: each is a real route with its own
 * prefetch, so they have to be navigable, shareable and openable in a new tab. A
 * client-side tab widget would make three of the product's five surfaces unlinkable.
 */
const ReturnHeader: FC<{ record: ReturnRecord }> = ({ record }) => {
  const pathname = usePathname();

  // Written as template literals so `typedRoutes` resolves them against the real route
  // tree. Building the base as a plain string first widens it to `string`, which the
  // typed `Link` rejects.
  const tabs = [
    { href: `/returns/${record.id}`, label: "Document" },
    { href: `/returns/${record.id}/versions`, label: "Versions" },
  ] as const;

  return (
    <header className="border-border border-b bg-surface">
      <div className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-8">
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

        <nav aria-label="Return sections" className="-mb-px mt-6 flex gap-6">
          {tabs.map((tab) => {
            const active = pathname === tab.href;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "border-b-2 pb-2.5 text-sm transition-colors",
                  active
                    ? "border-text font-medium text-text"
                    : "border-transparent text-text-muted hover:text-text",
                )}
                href={tab.href}
                key={tab.href}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

export default ReturnHeader;
