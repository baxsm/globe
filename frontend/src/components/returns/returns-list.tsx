"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { FilePlus2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { type FC, useState } from "react";
import { toast } from "sonner";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Measure from "@/components/ui/measure";
import { ApiError, api, type ReturnSummary } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatPeriod, formatTimestamp } from "@/lib/utils";
import ConfirmDialog from "./confirm-dialog";
import CreateReturnDialog from "./create-return-dialog";

/**
 * The returns list, as a ledger rather than a grid of cards.
 *
 * Rows separated by rules, not boxes inside a box. The columns are what a filer sorts
 * by in their own records: the period, the version they are on, and when it last moved.
 */
const ReturnsList: FC = () => {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ReturnSummary | null>(null);

  const { data: returns } = useSuspenseQuery({
    queryKey: queryKeys.returns,
    queryFn: () => api.listReturns().then((data) => data.returns),
  });

  const { mutate: remove, isPending: removing } = useMutation({
    mutationFn: (id: string) => api.deleteReturn(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.returns });
      toast.success("Return deleted");
      setPendingDelete(null);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not delete the return.");
      setPendingDelete(null);
    },
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
          {/* Mirrors the row's outer grid so the labels line up with the cells beneath. */}
          <div className="grid grid-cols-[1fr_2rem] border-border border-b pb-2 font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
            <div className="grid grid-cols-[1fr_auto] gap-4 pl-3 sm:grid-cols-[1fr_8rem_5rem_10rem]">
              <span>Return</span>
              <span className="hidden sm:block">Period</span>
              <span className="hidden text-right sm:block">Version</span>
              <span className="text-right">Updated</span>
            </div>
            <span className="sr-only">Actions</span>
          </div>

          {/*
            The row is a grid, and the link and the delete control are two of its cells
            rather than one stacked over the other. Overlapping them means the link takes
            clicks meant for the button wherever the row is taller than one line, and no
            amount of z-index fixes that: the anchor is simply under the cursor.

            The link stays an anchor so keyboard activation, focus order, middle-click and
            open-in-new-tab all come for free.
          */}
          {returns.map((item) => (
            <div
              className="group grid grid-cols-[1fr_2rem] items-center border-border border-b transition-colors duration-150 last:border-b-0 hover:bg-sunk/50"
              key={item.id}
            >
              <Link
                className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-3.5 pl-3 sm:grid-cols-[1fr_8rem_5rem_10rem]"
                href={`/returns/${item.id}`}
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
                  A return with no saved version reports 0 from the query's coalesce. That
                  is not "version zero", it is nothing saved yet, and it says so.
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

              {/*
                Always present, faint until the row is hovered, rather than revealed by it.
                A touch device has no hover state, so hiding it that way puts the only
                delete control out of reach on a phone.
              */}
              <Button
                aria-label={`Delete ${item.name}`}
                className="justify-self-center text-text-faint/50 transition-colors hover:bg-transparent hover:text-ink-struck group-hover:text-text-faint"
                onClick={() => setPendingDelete(item)}
                size="icon"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <CreateReturnDialog onOpenChange={setCreating} open={creating} />

      <ConfirmDialog
        body={
          pendingDelete === null
            ? ""
            : `${pendingDelete.name} and every version and validation run saved against it are removed. This cannot be undone.`
        }
        confirmLabel={removing ? "Deleting" : "Delete"}
        onConfirm={() => pendingDelete !== null && remove(pendingDelete.id)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        open={pendingDelete !== null}
        pending={removing}
        title="Delete this return?"
      />
    </Measure>
  );
};

export default ReturnsList;
