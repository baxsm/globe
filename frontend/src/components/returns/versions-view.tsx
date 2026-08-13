"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/utils";
import ReturnHeader from "./return-header";

/**
 * Version history, newest first.
 *
 * The list arrives ascending because that is the order the version numbers were
 * allocated in. Reversing here rather than asking the API to sort keeps the stored
 * order meaningful and puts the most recent save where a reader looks first.
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

  return (
    <>
      <ReturnHeader record={record.return} />

      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
        {newestFirst.length === 0 ? (
          <div className="border-border border-t py-16 text-center">
            <p className="text-lg text-text-muted">No versions saved yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-faint leading-relaxed">
              Saving the document writes an immutable version. Each one keeps the filer's original
              figures, and the export applies the errata on top of them.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[4rem_1fr_auto] gap-4 border-border border-b px-3 pb-2 font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
              <span>Version</span>
              <span>Saved</span>
              <span className="text-right">Export</span>
            </div>

            {newestFirst.map((version) => (
              <div
                className="grid grid-cols-[4rem_1fr_auto] items-baseline gap-4 border-border border-b px-3 py-3.5"
                key={version.id}
              >
                <span className="figure font-medium text-sm">v{version.version}</span>
                <span className="figure text-sm text-text-muted">
                  {formatTimestamp(version.createdAt)}
                </span>
                <span className="text-right text-xs">
                  {version.hasXml ? (
                    <span className="text-text-muted">XML generated</span>
                  ) : (
                    <span className="text-text-faint">Not generated</span>
                  )}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
};

export default VersionsView;
