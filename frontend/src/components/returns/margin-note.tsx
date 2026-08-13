import Link from "next/link";
import type { FC } from "react";
import KindMark from "@/components/reference/kind-mark";
import type { ErrataApplication, Finding, SuppressionRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The kind marker every annotation shares.
 *
 * A dot rather than a rule down the left edge: a column of left rules reads as stacked
 * pull quotes and competes with the document's own rows. A bordered card would be worse
 * still, turning the margin into the dashboard this surface exists not to be.
 */
const InkDot: FC<{ className: string }> = ({ className }) => (
  <span
    aria-hidden="true"
    className={cn("mt-[0.3rem] size-1.5 shrink-0 rounded-full", className)}
  />
);

/**
 * An errata correction, against the node it changed.
 *
 * `schemaExpected` is struck and `errataApplied` is not, so the difference is legible
 * without reading either label. That pairing is the entire product in one line.
 */
interface ErrataNoteProps {
  readonly application: ErrataApplication;
  /**
   * Drops the reason line, for a rule that has already explained itself on this page.
   *
   * Issue 7 writes nine zeros per jurisdiction and every one of them carries the same
   * sentence about the safe harbour. Printed against all twenty-seven it stops being an
   * explanation and becomes the page's texture, and the annotations that say something
   * different get lost among them. The first occurrence still carries it in full.
   */
  readonly repeated?: boolean;
}

export const ErrataNote: FC<ErrataNoteProps> = ({ application, repeated = false }) => {
  const { issueNumber, kind, schemaExpected, errataApplied, paragraph, reason } = application;

  return (
    <article className="flex gap-2.5 py-1">
      <InkDot className={kind === "coercion" ? "bg-ink-struck" : "bg-ink-applied"} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <Link
            className="figure rounded-[1px] text-text-faint text-xs underline decoration-border underline-offset-2 transition-colors hover:text-text hover:decoration-text-faint"
            href={`/reference#issue-${issueNumber}`}
          >
            Issue {String(issueNumber).padStart(2, "0")}
          </Link>
          <KindMark kind={kind} />
        </div>

        <p className="mt-1.5 text-ink-struck text-xs leading-relaxed line-through decoration-ink-struck/60">
          {schemaExpected}
        </p>
        <p className="mt-1 text-ink-applied text-xs leading-relaxed">{errataApplied}</p>

        <p className="mt-1.5 text-[0.6875rem] text-text-faint leading-relaxed">
          {repeated ? null : `${reason}. `}
          <span className="figure">
            {paragraph.includes("-") ? "Paragraphs" : "Paragraph"} {paragraph}
          </span>
        </p>
      </div>
    </article>
  );
};

/**
 * A validation rule that was not applied, and why.
 *
 * These are not attached to a node. The four appear on every run including clean ones,
 * and their permanent presence is the clearest statement of what this product is: a rule
 * the guidance disapplied is reported as suppressed, never silently skipped.
 */
export const SuppressionNote: FC<{ suppression: SuppressionRecord }> = ({ suppression }) => {
  const { issue, validationRule, paragraph, reason } = suppression;

  return (
    <article className="flex gap-2.5 py-1">
      <InkDot className="bg-ink-suppressed" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="figure text-ink-suppressed text-xs">Rule {validationRule}</span>
          <span className="font-mono text-ink-suppressed text-micro uppercase tracking-[0.14em]">
            not applied
          </span>
        </div>

        <p className="mt-1.5 text-text-muted text-xs leading-relaxed">{reason}</p>

        <p className="mt-1.5 text-[0.6875rem] text-text-faint leading-relaxed">
          <Link
            className="rounded-[1px] underline decoration-border underline-offset-2 transition-colors hover:text-text hover:decoration-text-faint"
            href={`/reference#issue-${issue}`}
          >
            Issue {String(issue).padStart(2, "0")}
          </Link>
          , <span className="figure">paragraph {paragraph}</span>
        </p>
      </div>
    </article>
  );
};

const SEVERITY_INK: Record<Finding["severity"], { dot: string; text: string }> = {
  error: { dot: "bg-ink-struck", text: "text-ink-struck" },
  warning: { dot: "bg-ink-suppressed", text: "text-ink-suppressed" },
  info: { dot: "bg-text-faint", text: "text-text-muted" },
};

/** A rule still in force that the document breaches. */
export const FindingNote: FC<{ finding: Finding }> = ({ finding }) => {
  const { rule, severity, message, issue } = finding;
  const ink = SEVERITY_INK[severity];

  return (
    <article className="flex gap-2.5 py-1">
      <InkDot className={ink.dot} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn("figure text-xs", ink.text)}>Rule {rule}</span>
          <span className={cn("font-mono text-micro uppercase tracking-[0.14em]", ink.text)}>
            {severity}
          </span>
        </div>

        <p className="mt-1.5 text-text-muted text-xs leading-relaxed">{message}</p>

        {issue !== null && (
          <p className="mt-1.5 text-[0.6875rem] text-text-faint">
            <Link
              className="rounded-[1px] underline decoration-border underline-offset-2 transition-colors hover:text-text hover:decoration-text-faint"
              href={`/reference#issue-${issue}`}
            >
              Issue {String(issue).padStart(2, "0")}
            </Link>
          </p>
        )}
      </div>
    </article>
  );
};
