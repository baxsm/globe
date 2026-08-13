"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { type FC, useState } from "react";
import EmptyState from "@/components/ui/empty-state";
import Measure from "@/components/ui/measure";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn, formatTimestamp } from "@/lib/utils";
import ReturnHeader from "./return-header";
import VersionDiff from "./version-diff";

/**
 * Version history, newest first, and the comparison between any two of them.
 *
 * The list arrives ascending because that is the order the version numbers were allocated
 * in. Reversing here rather than asking the API to sort keeps the stored order meaningful
 * and puts the most recent save where a reader looks first.
 */
const VersionsView: FC<{ returnId: string }> = ({ returnId }) => {
  const { data: record } = useSuspenseQuery({
    queryKey: queryKeys.return(returnId),
    queryFn: () => api.getReturn(returnId),
  });

  const { data: versions } = useSuspenseQuery({
    queryKey: queryKeys.versions(returnId),
    queryFn: () => api.listVersions(returnId).then((data) => data.versions),
  });

  const newestFirst = [...versions].reverse();

  /**
   * The pair being compared, defaulting to the two most recent.
   *
   * Held as numbers rather than as list positions so a save that adds a version does not
   * silently shift what is on screen to a different pair.
   */
  const [pair, setPair] = useState<{ from: number; to: number } | null>(() => {
    const [latest, previous] = newestFirst;
    if (latest === undefined || previous === undefined) return null;
    return { from: previous.version, to: latest.version };
  });

  return (
    <>
      <ReturnHeader record={record.return} />

      <Measure className="py-8">
        {newestFirst.length === 0 ? (
          <EmptyState
            body="Saving the document writes an immutable version. Each one keeps the filer's original figures, and the export applies the errata on top of them."
            icon={History}
            title="No versions saved yet."
          />
        ) : (
          <>
            <div className="grid grid-cols-[4rem_1fr_auto] gap-4 border-border border-b px-3 pb-2 font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
              <span>Version</span>
              <span>Saved</span>
              <span className="text-right">Export</span>
            </div>

            {/*
              Rules between rows, not under every one. A trailing rule under the last row
              sits directly above whatever follows and reads as a stray line rather than
              as the end of the list.
            */}
            {newestFirst.map((version) => (
              <div
                className="grid grid-cols-[4rem_1fr_auto] items-baseline gap-4 border-border border-b px-3 py-3.5 last:border-b-0"
                key={version.id}
              >
                <span className="figure font-medium text-sm">v{version.version}</span>
                <span className="figure text-sm text-text-muted">
                  {formatTimestamp(version.createdAt)}
                </span>
                {/*
                  Whether an export was cached, not whether one can be produced. Every
                  saved version exports on demand, so this says "stored" rather than
                  "generated": the latter reads as though the export does not exist yet.
                */}
                <span className="text-right text-xs">
                  {version.hasXml ? (
                    <span className="text-text-muted">Export stored</span>
                  ) : (
                    <span className="text-text-faint">Exports on demand</span>
                  )}
                </span>
              </div>
            ))}

            {pair === null ? (
              <p className="mt-10 text-sm text-text-faint leading-relaxed">
                Save a second version to compare it against this one.
              </p>
            ) : (
              <section className="mt-10">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                  <h2 className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
                    Compare
                  </h2>

                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <VersionPicker
                      label="from"
                      onChange={(from) => setPair({ ...pair, from })}
                      value={pair.from}
                      versions={versions.map((version) => version.version)}
                    />
                    <span className="text-text-faint">to</span>
                    <VersionPicker
                      label="to"
                      onChange={(to) => setPair({ ...pair, to })}
                      value={pair.to}
                      versions={versions.map((version) => version.version)}
                    />
                  </div>
                </div>

                {pair.from === pair.to ? (
                  <p className="mt-4 border-border border-t pt-4 text-sm text-text-faint">
                    Pick two different versions to compare.
                  </p>
                ) : (
                  <VersionDiff from={pair.from} returnId={returnId} to={pair.to} />
                )}
              </section>
            )}
          </>
        )}
      </Measure>
    </>
  );
};

interface VersionPickerProps {
  readonly label: string;
  readonly value: number;
  readonly versions: readonly number[];
  readonly onChange: (version: number) => void;
}

/**
 * A native select, deliberately.
 *
 * A custom listbox here would have to reimplement keyboard selection, typeahead and the
 * mobile picker for a control whose entire job is choosing one number from a short list.
 */
const VersionPicker: FC<VersionPickerProps> = ({ label, value, versions, onChange }) => (
  <label className="inline-flex items-baseline gap-1.5">
    <span className="sr-only">Compare {label}</span>
    <select
      className={cn(
        "figure cursor-pointer rounded-sheet border border-border bg-surface py-1 pr-2 pl-2 text-sm transition-colors",
        "hover:border-border-strong",
      )}
      onChange={(event) => onChange(Number(event.target.value))}
      value={value}
    >
      {versions.map((version) => (
        <option key={version} value={version}>
          v{version}
        </option>
      ))}
    </select>
  </label>
);

export default VersionsView;
