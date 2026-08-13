"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { FilePlus2, Plus } from "lucide-react";
import Link from "next/link";
import { type FC, useState } from "react";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Measure from "@/components/ui/measure";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatPeriod, formatTimestamp } from "@/lib/utils";
import CreateReturnDialog from "./create-return-dialog";

/**
 * The returns list, as a ledger rather than a grid of cards.
 *
 * Rows separated by rules, not boxes inside a box. The columns are what a filer sorts
 * by in their own records: the period, the version they are on, and when it last moved.
 */
const ReturnsList: FC = () => {
  const [creating, setCreating] = useState(false);

  const { data: returns } = useSuspenseQuery({
    queryKey: queryKeys.returns,
    queryFn: () => api.listReturns().then((data) => data.returns),
  });

  return (
    <Measure className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-normal text-3xl tracking-[-0.015em]">Returns</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            {returns.length === 0
              ? "No returns yet."
              : `${returns.length} return${returns.length === 1 ? "" : "s"}.`}
          </p>
        </div>

        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
          New return
        </Button>
      </div>

      {returns.length === 0 ? (
        <div className="mt-10">
          {/* The empty state carries the action, so it is not a dead end with the only
              control elsewhere on the page. */}
          <EmptyState
            body="Each return is pinned to the schema and guidance versions current when it was created, so reopening it later reads it against the same specification."
            icon={FilePlus2}
            title="Create a return to begin."
          >
            <Button onClick={() => setCreating(true)} variant="secondary">
              <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
              New return
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div className="mt-8">
          <div className="grid grid-cols-[1fr_auto] gap-4 border-border border-b px-3 pb-2 font-mono text-micro text-text-faint uppercase tracking-[0.14em] sm:grid-cols-[1fr_8rem_5rem_10rem]">
            <span>Return</span>
            <span className="hidden sm:block">Period</span>
            <span className="hidden text-right sm:block">Version</span>
            <span className="text-right">Updated</span>
          </div>

          {/*
            A row that opens a return is a link, not a div that listens for a click.
            The anchor brings keyboard activation, focus order, middle-click and
            open-in-new-tab for free; the div version had to reimplement the first two
            and could never offer the last two.
          */}
          {returns.map((item) => (
            <Link
              className="grid grid-cols-[1fr_auto] items-baseline gap-4 border-border border-b px-3 py-3.5 transition-colors duration-150 hover:bg-sunk/50 sm:grid-cols-[1fr_8rem_5rem_10rem]"
              href={`/returns/${item.id}`}
              key={item.id}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{item.name}</p>
                {item.mneGroupName !== null && item.mneGroupName.length > 0 && (
                  <p className="mt-0.5 truncate text-sm text-text-muted">{item.mneGroupName}</p>
                )}
                <p className="figure mt-1 text-text-faint text-xs sm:hidden">
                  {formatPeriod(item.reportingPeriod)}
                </p>
              </div>

              <span className="figure hidden text-sm text-text-muted sm:block">
                {formatPeriod(item.reportingPeriod)}
              </span>

              {/*
                A return with no saved version reports 0 from the query's coalesce. That is
                not "version zero", it is nothing saved yet, and it says so.
              */}
              <span className="figure hidden text-right text-sm text-text-muted sm:block">
                {item.latestVersion === 0 ? (
                  <span className="text-text-faint">&mdash;</span>
                ) : (
                  `v${item.latestVersion}`
                )}
              </span>

              <span className="figure text-right text-text-faint text-xs">
                {formatTimestamp(item.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}

      <CreateReturnDialog onOpenChange={setCreating} open={creating} />
    </Measure>
  );
};

export default ReturnsList;
