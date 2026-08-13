"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { FC } from "react";
import { api } from "@/lib/api";
import type { GirDocument } from "@/lib/document";
import { childElements, childKey, localName } from "@/lib/document";
import { queryKeys } from "@/lib/query-keys";
import DocumentNode from "./document-node";
import ReturnHeader from "./return-header";

/**
 * The return as a readable document.
 *
 * The margin is phase 7. What this establishes is the tree and the node paths it walks,
 * because the annotations attach to those paths. The right column is reserved rather
 * than filled so the two-column reading measure is what gets reviewed now, not after
 * the annotations arrive and change every line length.
 */
const ReturnDocument: FC<{ returnId: string }> = ({ returnId }) => {
  const { data } = useSuspenseQuery({
    queryKey: queryKeys.return(returnId),
    queryFn: () => api.getReturn(returnId),
  });

  const document = data.version?.document as GirDocument | undefined;

  return (
    <>
      <ReturnHeader record={data.return} />

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        {document === undefined ? (
          <div className="border-border border-t py-16 text-center">
            <p className="text-lg text-text-muted">No document saved yet.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-faint leading-relaxed">
              Save a GIR against this return and it appears here, with each errata correction marked
              against the element it changes.
            </p>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 border-border border-b pb-2">
                <span className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
                  Document
                </span>
                <span className="font-mono text-text-faint text-xs">
                  {localName(document.root.name)}
                </span>
                <span className="figure ml-auto text-text-faint text-xs">
                  v{data.version?.version}
                </span>
              </div>

              <div className="mt-2">
                {childElements(document.root).map((child, index) => (
                  <DocumentNode
                    depth={0}
                    element={child}
                    key={childKey(child, index)}
                    parentPath={localName(document.root.name)}
                  />
                ))}
              </div>
            </div>

            {/*
              The margin's column, held open deliberately.
              Reserving it now means the document's measure does not change when phase 7
              fills it, so the line length reviewed in this phase is the real one.
            */}
            <aside className="hidden lg:block">
              <div className="sticky top-6">
                <p className="border-border border-b pb-2 font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
                  Margin
                </p>
                <p className="mt-3 text-sm text-text-faint leading-relaxed">
                  Errata corrections and suppressed validation rules are annotated here against the
                  element each one changes.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  );
};

export default ReturnDocument;
