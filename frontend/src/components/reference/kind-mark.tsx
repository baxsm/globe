import type { FC } from "react";
import type { IssueReference } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The four fix kinds, marked once so every surface names them identically.
 *
 * A label in the ink of its kind, not a filled chip. A boxed badge is the generic
 * component this project is avoiding, and on a page of fourteen it would tile into a
 * column of pills that pulls the eye off the titles. The margin in phase 7 renders the
 * same vocabulary against a document node, so the colours are fixed here rather than
 * chosen again there.
 */
const KIND_STYLES: Record<IssueReference["kind"], string> = {
  substitution: "text-ink-applied",
  augmentation: "text-ink-applied",
  coercion: "text-ink-struck",
  suppression: "text-ink-suppressed",
};

const KindMark: FC<{ kind: IssueReference["kind"] }> = ({ kind }) => (
  <span className={cn("font-mono text-micro uppercase tracking-[0.14em]", KIND_STYLES[kind])}>
    {kind}
  </span>
);

export default KindMark;
