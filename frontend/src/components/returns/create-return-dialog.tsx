"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FC, type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Loader from "@/components/ui/loader";
import { ApiError, api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * Mirrors the backend's own body schema.
 *
 * Validating here is for the message, not for safety: the server validates regardless.
 * The messages are the same text so a field rejected locally and the same field
 * rejected by the API do not read as two different problems.
 */
const formSchema = z.object({
  name: z.string().trim().min(1, "Give the return a name").max(200),
  reportingPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, for example 2024-12-31"),
  mneGroupName: z.string().trim().max(200),
});

type FieldErrors = Partial<Record<keyof z.infer<typeof formSchema>, string>>;

interface CreateReturnDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const CreateReturnDialog: FC<CreateReturnDialogProps> = ({ open, onOpenChange }) => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [reportingPeriod, setReportingPeriod] = useState("");
  const [mneGroupName, setMneGroupName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  // Reopening the dialog after a cancel must not show the last attempt's text or its
  // errors. Reset on open rather than on close, so the closing animation keeps its
  // content instead of emptying while it fades.
  useEffect(() => {
    if (!open) return;
    setName("");
    setReportingPeriod("");
    setMneGroupName("");
    setErrors({});
  }, [open]);

  const { mutate, isPending } = useMutation({
    mutationFn: (input: z.infer<typeof formSchema>) =>
      api.createReturn({
        name: input.name,
        reportingPeriod: input.reportingPeriod,
        ...(input.mneGroupName.length > 0 ? { mneGroupName: input.mneGroupName } : {}),
      }),
    onSuccess: async ({ return: created }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.returns });
      toast.success("Return created");
      onOpenChange(false);
      router.push(`/returns/${created.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not create the return.");
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const parsed = formSchema.safeParse({ name, reportingPeriod, mneGroupName });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in next)) {
          next[field as keyof FieldErrors] = issue.message;
        }
      }
      setErrors(next);
      return;
    }

    setErrors({});
    mutate(parsed.data);
  };

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-text/25 backdrop-blur-[1px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />

        <Dialog.Content className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-[min(92vw,30rem)] rounded-sheet border border-border bg-surface p-6 shadow-sheet data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in">
          <Dialog.Title className="font-normal text-xl tracking-[-0.01em]">New return</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-text-muted">
            Pinned to the current schema and guidance versions.
          </Dialog.Description>

          <form className="mt-6 space-y-4" noValidate onSubmit={onSubmit}>
            <Field
              error={errors.name}
              id="return-name"
              label="Name"
              onChange={setName}
              placeholder="FY2024 group return"
              value={name}
            />

            <Field
              error={errors.reportingPeriod}
              hint="The last day of the reporting fiscal year."
              id="return-period"
              label="Reporting period"
              onChange={setReportingPeriod}
              placeholder="2024-12-31"
              value={reportingPeriod}
            />

            <Field
              id="return-group"
              label="MNE group"
              onChange={setMneGroupName}
              optional
              placeholder="Meridian Holdings"
              value={mneGroupName}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button variant="secondary">Cancel</Button>
              </Dialog.Close>

              <Button disabled={isPending} type="submit">
                {isPending && <Loader className="size-3.5" />}
                {isPending ? "Creating" : "Create"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly optional?: boolean;
}

const Field: FC<FieldProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  optional = false,
}) => (
  <div className="space-y-1.5">
    <label className="flex items-baseline gap-2 font-medium text-sm" htmlFor={id}>
      {label}
      {optional && <span className="font-normal text-text-faint text-xs">optional</span>}
    </label>

    <Input
      aria-describedby={error !== undefined ? `${id}-error` : undefined}
      aria-invalid={error !== undefined}
      id={id}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      type="text"
      value={value}
    />

    {error !== undefined ? (
      <p className="text-ink-struck text-xs" id={`${id}-error`}>
        {error}
      </p>
    ) : (
      hint !== undefined && <p className="text-text-faint text-xs">{hint}</p>
    )}
  </div>
);

export default CreateReturnDialog;
