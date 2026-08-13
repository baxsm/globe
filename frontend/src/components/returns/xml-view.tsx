"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { type FC, useMemo } from "react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { markXml } from "@/lib/xml-marks";
import ReturnHeader from "./return-header";

/**
 * The wire format, with the errata-written regions marked.
 *
 * This is what makes the rest of the product checkable. A filer can be told that
 * `GIR2516` was substituted and a zero amount written beside it, or they can read the
 * bytes that leave the building and see it. Only the second is evidence.
 *
 * The export applies the errata, so this is not the stored document. That difference is
 * the point: the version keeps the filer's original figures and the export carries the
 * corrected ones.
 */
const XmlView: FC<{ returnId: string }> = ({ returnId }) => {
  const { data: record } = useSuspenseQuery({
    queryKey: queryKeys.return(returnId),
    queryFn: () => api.getReturn(returnId),
  });

  const version = record.version?.version ?? null;

  const { data: xml } = useSuspenseQuery({
    queryKey: queryKeys.xml(returnId, version ?? 0),
    queryFn: () => (version === null ? Promise.resolve("") : api.getXml(returnId, version)),
  });

  const { data: validation } = useSuspenseQuery({
    queryKey: queryKeys.validation(returnId, version),
    queryFn: () =>
      version === null
        ? Promise.resolve({ run: null, errata: [] })
        : api.getValidation(returnId, version),
  });

  const lines = useMemo(() => markXml(xml, validation.errata), [xml, validation.errata]);
  const markedCount = lines.filter((line) => line.issue !== null).length;

  if (version === null) {
    return (
      <>
        <ReturnHeader record={record.return} />
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
          <div className="border-border border-t py-16 text-center">
            <p className="text-lg text-text-muted">Nothing to export yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-faint leading-relaxed">
              Save a version and its GIR XML appears here, with the regions the errata rewrote
              marked against the filer's own.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <ReturnHeader record={record.return} />

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-border border-b pb-2">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
              Export
            </span>
            <span className="figure text-text-faint text-xs">v{version}</span>
            <span className="figure text-text-faint text-xs">
              {new Blob([xml]).size.toLocaleString("en-GB")} bytes
            </span>
          </div>

          <p className="text-text-muted text-xs">
            {markedCount === 0 ? (
              "No errata corrections were written into this export."
            ) : (
              <>
                <span className="text-ink-applied">{markedCount} lines</span> carry an errata
                correction rather than the filer's own value.
              </>
            )}
          </p>
        </div>

        {/*
          `overflow-x-auto` on the container, not on the page.
          A GIR has lines longer than any viewport, and letting them widen the document
          gives the whole page a horizontal scrollbar so the chrome slides away with the
          content.
        */}
        <div className="mt-4 overflow-x-auto rounded-sheet border border-border bg-surface">
          <pre className="w-max min-w-full py-2 font-mono text-xs leading-[1.7]">
            <code>
              {lines.map((line) => (
                <div
                  className={cn(
                    "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-4 px-3",
                    line.issue !== null && "bg-ink-applied/[0.06]",
                  )}
                  key={line.number}
                >
                  <span
                    className={cn(
                      "select-none text-right tabular-nums",
                      line.issue === null ? "text-text-faint/60" : "text-ink-applied",
                    )}
                  >
                    {line.number}
                  </span>

                  <span className="whitespace-pre">
                    {line.text}
                    {line.issue !== null && (
                      <span className="ml-3 select-none text-ink-applied">
                        issue {String(line.issue).padStart(2, "0")}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </>
  );
};

export default XmlView;
