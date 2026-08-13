"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { FC } from "react";
import Button from "@/components/ui/button";
import Loader from "@/components/ui/loader";

/**
 * A confirmation for something that cannot be undone.
 *
 * Separate from the toast-with-undo pattern because the delete it guards cascades to the
 * versions and the validation runs beneath a return. There is nothing to restore from, so
 * the question has to be asked before rather than offered after.
 */
interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly pending?: boolean;
  readonly onConfirm: () => void;
}

const ConfirmDialog: FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  pending = false,
  onConfirm,
}) => (
  <Dialog.Root onOpenChange={onOpenChange} open={open}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-text/25 backdrop-blur-[1px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />

      <Dialog.Content className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 w-[min(92vw,26rem)] rounded-sheet border border-border bg-surface p-6 shadow-sheet data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in">
        <Dialog.Title className="font-normal text-xl tracking-[-0.01em]">{title}</Dialog.Title>
        <Dialog.Description className="mt-1.5 text-sm text-text-muted leading-relaxed">
          {body}
        </Dialog.Description>

        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close asChild>
            <Button variant="secondary">Cancel</Button>
          </Dialog.Close>

          {/*
            The destructive action carries the struck ink, which means "removed" every
            other place it appears in the product.
          */}
          <Button
            className="bg-ink-struck text-ground hover:bg-ink-struck/90"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <Loader className="size-3.5" />}
            {confirmLabel}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export default ConfirmDialog;
