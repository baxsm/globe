"use client";

import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { FileQuestion, RefreshCw, Upload } from "lucide-react";
import { type FC, useMemo, useState } from "react";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Measure from "@/components/ui/measure";
import { AnnotationIndex } from "@/lib/annotations";
import { api, type ErrataApplication, type SuppressionRecord } from "@/lib/api";
import type { GirDocument } from "@/lib/document";
import { allPaths, childElements, childKey, localName } from "@/lib/document";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import DocumentNode, { NODE_GRID } from "./document-node";
import JurisdictionFigures from "./jurisdiction-figures";
import { ErrataNote, SuppressionNote } from "./margin-note";
import ReturnHeader from "./return-header";
import SaveVersionDialog from "./save-version-dialog";

/**
 * The return as a marked-up document.
 *
 * Left is the filer's return, right is the margin. Every errata correction is annotated
 * against the element it changed, and every disapplied validation rule is named. If the
 * margin could be deleted and this still made sense, the product would have failed: a
 * schema-valid GIR is not a correct GIR, and this is where that is visible rather than
 * asserted.
 */
const ReturnDocument: FC<{ returnId: string }> = ({ returnId }) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data } = useSuspenseQuery({
    queryKey: queryKeys.return(returnId),
    queryFn: () => api.getReturn(returnId),
  });

  const version = data.version?.version ?? null;

  const { data: validation } = useSuspenseQuery({
    queryKey: queryKeys.validation(returnId, version),
    // A return with no saved version has nothing to validate, and asking would 404.
    queryFn: () =>
      version === null
        ? Promise.resolve({ run: null, errata: [] })
        : api.getValidation(returnId, version),
  });

  const { mutate: revalidate, isPending } = useMutation({
    mutationFn: () => {
      if (version === null) throw new Error("no version to validate");
      return api.runValidation(returnId, version);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.validation(returnId, version), result);
    },
  });

  const document = data.version?.document as GirDocument | undefined;

  const annotations = useMemo(
    () => new AnnotationIndex(validation.errata, validation.run?.findings ?? []),
    [validation],
  );

  if (document === undefined) {
    return (
      <>
        <ReturnHeader onSave={() => setSaving(true)} record={data.return} />
        <Measure className="py-8">
          <EmptyState
            body="Save a GIR against this return and it appears here, with each errata correction marked against the element it changes."
            icon={FileQuestion}
            title="No document saved yet."
          >
            <Button onClick={() => setSaving(true)}>
              <Upload aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Save a GIR
            </Button>
          </EmptyState>
        </Measure>

        <SaveVersionDialog onOpenChange={setSaving} open={saving} returnId={returnId} />
      </>
    );
  }

  const root = document.root;
  const suppressions = validation.run?.suppressions ?? [];
  const jurisdictions = validation.run?.computed.jurisdictions ?? [];

  return (
    <>
      <ReturnHeader record={data.return} />

      <Measure className="py-8">
        <div className={`${NODE_GRID} gap-x-8`}>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 border-border border-b pb-2">
            <span className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
              Document
            </span>
            <span className="font-mono text-text-faint text-xs">{localName(root.name)}</span>
            <span className="figure ml-auto text-text-faint text-xs">v{version}</span>
          </div>

          <div className="hidden items-baseline justify-between border-border border-b pb-2 lg:flex">
            <span className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
              Margin
            </span>

            {validation.run !== null && (
              <Button
                disabled={isPending}
                onClick={() => revalidate()}
                size="sm"
                variant="secondary"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn("size-3.5", isPending && "animate-spin")}
                  strokeWidth={1.75}
                />
                {isPending ? "Running" : "Re-run"}
              </Button>
            )}
          </div>
        </div>

        {validation.run === null ? (
          <UnvalidatedNotice onRun={() => revalidate()} pending={isPending} />
        ) : (
          <Suppressions records={suppressions} />
        )}

        <div className="mt-2">
          {childElements(root).map((child, index) => (
            <DocumentNode
              annotations={annotations}
              depth={0}
              element={child}
              key={childKey(child, index)}
              parentPath={localName(root.name)}
              siblings={root.children}
            />
          ))}
        </div>

        <Additions applications={annotations.unattached(allPaths(document))} />

        {jurisdictions.length > 0 && <JurisdictionFigures jurisdictions={jurisdictions} />}
      </Measure>
    </>
  );
};

/**
 * The four disapplied rules, stated before the document rather than inside it.
 *
 * They are not attached to any node: they describe rules that were not run over the whole
 * filing. Rendering them only when there are also findings would make a clean return show
 * nothing, and the product's entire thesis would vanish on exactly the happy path a filer
 * sees most often.
 */
const Suppressions: FC<{ records: readonly SuppressionRecord[] }> = ({ records }) => {
  if (records.length === 0) return null;

  return (
    <section className="mt-6 border-ink-suppressed/25 border-t border-b py-4">
      <p className="max-w-prose text-sm text-text-muted leading-relaxed">
        <span className="text-ink-suppressed">
          {records.length} validation rules were not applied to this return.
        </span>{" "}
        The guidance disapplies them because applying them rejects correct filings. They are
        reported on every run, including this one.
      </p>

      {/*
        Staggered by index so the four arrive in sequence rather than as one block.
        The delay is capped by the list being four long; a longer list would need it
        clamped, and this one cannot grow because the guidance disapplies exactly four.
      */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {records.map((record, index) => (
          <div
            className="animate-note-in"
            key={record.validationRule}
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <SuppressionNote suppression={record} />
          </div>
        ))}
      </div>
    </section>
  );
};

/**
 * Corrections that add an element the document does not contain.
 *
 * An augmentation writes something the filer never did, so there is no row in the tree
 * above to annotate. Issues 2, 4 and 6 are all this shape. They appear here, after the
 * document, because the alternative is showing them nowhere: they would be reported by
 * the engine, written into the export, and invisible on the one surface that exists to
 * show what the errata changed.
 */
const Additions: FC<{ applications: readonly ErrataApplication[] }> = ({ applications }) => {
  if (applications.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="border-border border-b pb-2 font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
        Added by the errata
      </h2>

      <p className="mt-3 max-w-prose text-balance text-sm text-text-muted leading-relaxed">
        These carry data the GIR requires and the schema has no element for. They are written into
        the export rather than the document above, so there is no line in the return to mark them
        against.
      </p>

      <div className="mt-4 space-y-3">
        {applications.map((application) => (
          <ErrataNote
            application={application}
            key={`${application.issueNumber}-${application.xpath}-${application.paragraph}`}
          />
        ))}
      </div>
    </section>
  );
};

/** A version that has never been validated. The margin has nothing to say until it is. */
const UnvalidatedNotice: FC<{ onRun: () => void; pending: boolean }> = ({ onRun, pending }) => (
  <section className="mt-6 flex flex-wrap items-center justify-between gap-4 border-border border-t border-b py-4">
    <p className="max-w-prose text-sm text-text-muted leading-relaxed">
      This version has not been validated. Run the engine to see which errata corrections apply and
      which validation rules were suppressed.
    </p>

    <Button disabled={pending} onClick={onRun} size="sm">
      {pending ? "Running" : "Validate"}
    </Button>
  </section>
);

export default ReturnDocument;
