"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileCode } from "lucide-react";
import { type DragEvent, type FC, type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Loader from "@/components/ui/loader";
import { ApiError, api, type VersionElections } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * Saving a GIR against a return.
 *
 * The document arrives as the wire XML the filer already holds, either dropped as a file
 * or pasted. It is not edited here: the product's job is to say what the errata changes
 * about a return, and a filer who cannot produce the XML has nothing to check.
 *
 * The elections below it exist because four of the fourteen fixes cannot be read off the
 * document. Leaving them out entirely was the previous state, and it left issues 2, 4, 6
 * and 7 unable to fire against anything a filer could submit.
 */

const MAX_BYTES = 8 * 1024 * 1024;

interface SaveVersionDialogProps {
  readonly returnId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const SaveVersionDialog: FC<SaveVersionDialogProps> = ({ returnId, open, onOpenChange }) => {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [document, setDocument] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [safeHarbourApplies, setSafeHarbourApplies] = useState(false);
  const [equityInclusionAmount, setEquityInclusionAmount] = useState("");
  const [article712Basis, setArticle712Basis] = useState("");
  const [unclaimedAccrualTins, setUnclaimedAccrualTins] = useState("");

  // Reset on open rather than on close, so the closing animation keeps its content
  // instead of emptying while it fades.
  useEffect(() => {
    if (!open) return;
    setDocument("");
    setFileName(null);
    setDragging(false);
    setError(null);
    setSafeHarbourApplies(false);
    setEquityInclusionAmount("");
    setArticle712Basis("");
    setUnclaimedAccrualTins("");
  }, [open]);

  const { mutate, isPending } = useMutation({
    mutationFn: (body: { document: string; elections?: VersionElections }) =>
      api.createVersion(returnId, body),
    onSuccess: async ({ version }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.return(returnId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.versions(returnId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.returns }),
      ]);
      toast.success(`Saved as v${version.version}`);
      onOpenChange(false);
    },
    onError: (cause) => {
      // The backend rejects a document that cannot round-trip, and its message names the
      // parse failure. Replacing that with a generic string would hide the one detail
      // that tells a filer which line to look at.
      setError(cause instanceof ApiError ? cause.message : "Could not save the document.");
    },
  });

  const readFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setError("That file is larger than 8 MB.");
      return;
    }

    const text = await file.text();
    setDocument(text);
    setFileName(file.name);
    setError(null);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined) void readFile(file);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const trimmed = document.trim();
    if (trimmed.length === 0) {
      setError("Add a GIR to save.");
      return;
    }

    const elections = buildElections({
      safeHarbourApplies,
      equityInclusionAmount,
      article712Basis,
      unclaimedAccrualTins,
    });

    if (elections instanceof Error) {
      setError(elections.message);
      return;
    }

    setError(null);
    mutate(
      Object.keys(elections).length > 0 ? { document: trimmed, elections } : { document: trimmed },
    );
  };

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-text/25 backdrop-blur-[1px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />

        <Dialog.Content className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[88vh] w-[min(94vw,42rem)] flex-col rounded-sheet border border-border bg-surface shadow-sheet data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in">
          <div className="border-border border-b p-6 pb-4">
            <Dialog.Title className="font-normal text-xl tracking-[-0.01em]">
              Save a GIR
            </Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm text-text-muted">
              The document is stored as filed. The errata is applied on top of it, never to it.
            </Dialog.Description>
          </div>

          <form className="flex min-h-0 flex-col" noValidate onSubmit={onSubmit}>
            {/*
              The fade is what says there is more below. Without it the body simply cuts
              a heading in half at the footer's edge, which reads as a clipping bug
              rather than as a scroll. Pure CSS, so it is correct on first paint and
              disappears by itself once the content is scrolled to the end.
            */}
            <div className="scroll-fade min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
              <div className="space-y-1.5">
                <span className="font-medium text-sm">Document</span>

                {/* biome-ignore lint/a11y/noStaticElementInteractions: the drop zone wraps a real file input and a real textarea, both of which carry the keyboard path. */}
                <div
                  className={cn(
                    "rounded-sheet border border-border border-dashed transition-colors duration-150",
                    dragging && "border-text bg-sunk",
                  )}
                  onDragLeave={() => setDragging(false)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDrop={onDrop}
                >
                  <div className="flex flex-wrap items-center gap-3 border-border border-b p-3">
                    <Button
                      onClick={() => fileInput.current?.click()}
                      size="sm"
                      variant="secondary"
                    >
                      <FileCode aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                      Choose file
                    </Button>

                    <span className="min-w-0 truncate font-mono text-text-faint text-xs">
                      {fileName ?? "or drop an XML file here, or paste below"}
                    </span>

                    {document.length > 0 && (
                      <span className="figure ml-auto text-text-faint text-xs">
                        {document.length.toLocaleString()} chars
                      </span>
                    )}
                  </div>

                  <textarea
                    aria-label="GIR XML"
                    className="block h-52 w-full resize-y bg-ground px-3 py-2 font-mono text-xs leading-relaxed outline-none placeholder:text-text-faint"
                    onChange={(event) => {
                      setDocument(event.target.value);
                      setFileName(null);
                    }}
                    placeholder={'<?xml version="1.0" encoding="UTF-8"?>'}
                    spellCheck={false}
                    value={document}
                  />
                </div>

                <input
                  accept=".xml,text/xml,application/xml"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file !== undefined) void readFile(file);
                    // Clears the input so choosing the same file twice fires change again.
                    event.target.value = "";
                  }}
                  ref={fileInput}
                  type="file"
                />
              </div>

              <fieldset className="space-y-3 border-border border-t pt-5">
                <legend className="sr-only">Elections</legend>

                <div>
                  <p className="font-medium text-sm">Elections</p>
                  <p className="mt-1 max-w-prose text-sm text-text-muted leading-relaxed">
                    Four corrections cannot be read off the document. A 7.1.2 and a 7.2.2 election
                    look identical once written, and a safe harbour looks like an ordinary
                    computation, so they apply only when stated here.
                  </p>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 py-1">
                  <input
                    checked={safeHarbourApplies}
                    className="mt-0.5 size-4 cursor-pointer accent-text"
                    onChange={(event) => setSafeHarbourApplies(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="text-sm">
                    A safe harbour applies
                    <span className="block text-text-faint text-xs">
                      Issue 7. Writes the zeros the schema has no other way to carry.
                    </span>
                  </span>
                </label>

                <ElectionField
                  hint="Issue 4. A whole number of currency units."
                  id="election-equity"
                  label="Equity inclusion amount"
                  onChange={setEquityInclusionAmount}
                  placeholder="1250000"
                  value={equityInclusionAmount}
                />

                <ElectionField
                  hint="Issue 2. Positions of the UPE adjustments that elected Article 7.1.2, from 0. Comma separated."
                  id="election-basis"
                  label="Article 7.1.2 basis"
                  onChange={setArticle712Basis}
                  placeholder="0, 2"
                  value={article712Basis}
                />

                <ElectionField
                  hint="Issue 6. TINs for the Unclaimed Accrual Annual Election. Comma separated."
                  id="election-tins"
                  label="Unclaimed accrual TINs"
                  onChange={setUnclaimedAccrualTins}
                  placeholder="FR8291046, DE5520117"
                  value={unclaimedAccrualTins}
                />
              </fieldset>
            </div>

            <div className="flex items-center justify-between gap-4 border-border border-t p-6 py-4">
              <p aria-live="polite" className="min-w-0 text-ink-struck text-xs">
                {error}
              </p>

              <div className="flex shrink-0 gap-2">
                <Dialog.Close asChild>
                  <Button variant="secondary">Cancel</Button>
                </Dialog.Close>

                <Button disabled={isPending} type="submit">
                  {isPending && <Loader className="size-3.5" />}
                  {isPending ? "Saving" : "Save"}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

interface ElectionInputs {
  readonly safeHarbourApplies: boolean;
  readonly equityInclusionAmount: string;
  readonly article712Basis: string;
  readonly unclaimedAccrualTins: string;
}

/**
 * Turns the form's strings into the elections body, or an Error naming the bad field.
 *
 * Omits anything not stated rather than sending an empty value: the backend treats an
 * absent field as "not elected", and sending `""` or `[]` would read as an election made
 * with nothing in it.
 */
export const buildElections = (inputs: ElectionInputs): VersionElections | Error => {
  const { safeHarbourApplies, equityInclusionAmount, article712Basis, unclaimedAccrualTins } =
    inputs;

  const elections: {
    article712BasisIndices?: number[];
    safeHarbourApplies?: boolean;
    equityInclusionAmount?: string;
    unclaimedAccrualAnnualTins?: string[];
  } = {};

  if (safeHarbourApplies) elections.safeHarbourApplies = true;

  const amount = equityInclusionAmount.trim();
  if (amount.length > 0) {
    if (!/^-?\d+$/.test(amount)) return new Error("Use a whole number of currency units.");
    elections.equityInclusionAmount = amount;
  }

  const basis = splitList(article712Basis);
  if (basis.length > 0) {
    const indices = basis.map(Number);
    if (indices.some((index) => !Number.isInteger(index) || index < 0)) {
      return new Error("Basis positions are whole numbers from 0.");
    }
    elections.article712BasisIndices = indices;
  }

  const tins = splitList(unclaimedAccrualTins);
  if (tins.length > 0) elections.unclaimedAccrualAnnualTins = tins;

  return elections;
};

const splitList = (raw: string): string[] =>
  raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

interface ElectionFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly hint: string;
}

const ElectionField: FC<ElectionFieldProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
}) => (
  <div className="space-y-1.5">
    <label className="block font-medium text-sm" htmlFor={id}>
      {label}
    </label>

    <Input
      id={id}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type="text"
      value={value}
    />

    <p className="text-text-faint text-xs">{hint}</p>
  </div>
);

export default SaveVersionDialog;
