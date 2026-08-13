"use client";

import { useQuery } from "@tanstack/react-query";
import type { FC } from "react";
import Loader from "@/components/ui/loader";
import { api, type DocumentChange } from "@/lib/api";
import { localName } from "@/lib/document";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * What changed between two saved versions, at node level.
 *
 * The comparison is the engine's. It pairs repeated sections by their own identifier
 * rather than by position, so inserting a jurisdiction reports one addition instead of
 * rewriting every jurisdiction below it.
 */
interface VersionDiffProps {
  readonly returnId: string;
  readonly from: number;
  readonly to: number;
}

const KIND_INK: Record<DocumentChange["kind"], { rule: string; text: string; label: string }> = {
  added: { rule: "border-pos/40", text: "text-pos", label: "added" },
  removed: { rule: "border-ink-struck/40", text: "text-ink-struck", label: "removed" },
  changed: { rule: "border-ink-applied/40", text: "text-ink-applied", label: "changed" },
};

const VersionDiff: FC<VersionDiffProps> = ({ returnId, from, to }) => {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.diff(returnId, from, to),
    queryFn: () => api.diffVersions(returnId, from, to).then((result) => result.changes),
  });

  if (isPending) {
    return (
      <div className="flex justify-center py-12">
        <Loader />
      </div>
    );
  }

  // A failed comparison and an identical pair are different answers. Rendering the empty
  // state for both would tell a filer their versions match when the request never landed.
  if (isError) {
    return (
      <div className="border-border border-t py-12 text-center">
        <p className="text-sm text-text-muted">Could not compare these versions.</p>
        <button
          className="mt-3 cursor-pointer text-sm text-text underline decoration-border underline-offset-4 transition-colors hover:decoration-text-faint"
          onClick={() => refetch()}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="border-border border-t py-12 text-center">
        <p className="text-sm text-text-muted">
          v{from} and v{to} are identical.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <p className="border-border border-b pb-2 text-text-muted text-xs">
        <span className="figure">{data.length}</span> {data.length === 1 ? "change" : "changes"}{" "}
        between v{from} and v{to}
      </p>

      {data.map((change) => (
        <ChangeRow change={change} key={`${change.kind}-${change.xpath}`} />
      ))}
    </div>
  );
};

const ChangeRow: FC<{ change: DocumentChange }> = ({ change }) => {
  const { xpath, kind, before, after } = change;
  const ink = KIND_INK[kind];

  // The full path is the address, but the element is what a reader scans for. Both are
  // shown: the name in the reading size, the path beneath it in the small one.
  const segments = xpath.split("/").filter(Boolean);
  const name = localName(segments.at(-1) ?? xpath);

  return (
    <div className={cn("border-b border-l-2 border-border/60 py-2.5 pl-3", ink.rule)}>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-mono text-sm">{name}</span>
        <span className={cn("font-mono text-micro uppercase tracking-[0.14em]", ink.text)}>
          {ink.label}
        </span>
      </div>

      {/* `break-all`: a GIR path is one long unbroken token with nowhere to wrap. */}
      <p className="mt-1 break-all font-mono text-[0.6875rem] text-text-faint leading-relaxed">
        {xpath}
      </p>

      {(before !== null || after !== null) && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {before !== null && (
            <span className="figure text-ink-struck text-xs line-through decoration-ink-struck/60">
              {before}
            </span>
          )}
          {after !== null && <span className="figure text-ink-applied text-xs">{after}</span>}
        </div>
      )}
    </div>
  );
};

export default VersionDiff;
