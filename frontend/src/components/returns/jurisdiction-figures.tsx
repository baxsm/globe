import type { FC } from "react";
import type { ComputedJurisdiction } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * What the engine computed, beside what the schema can carry.
 *
 * This is not a dashboard of totals. It exists for one column: `breaches`, which names
 * the jurisdictions whose true figure the wire format cannot express. An ETR of 1.24 is
 * filed as 1.0000 because `globe:percentage` is bounded at 1, and without this the
 * clamped value would be the only number a filer ever sees.
 */

/** The breach kinds the engine reports, as a reader would say them. */
const BREACH_TEXT: Record<string, string> = {
  "above-maximum": "above the maximum the schema permits",
  "below-minimum": "below the minimum the schema permits",
  "too-many-fraction-digits": "more precise than four decimal places",
  "rounds-to-zero": "too small to express at four decimal places",
};

const describeBreach = (kind: string): string => BREACH_TEXT[kind] ?? kind;

/** A decimal string as written, never parsed. `0.1000` and `0.1` are different filings. */
const Figure: FC<{ value: string | null }> = ({ value }) => (
  <span className={cn("figure text-sm", value === null && "text-text-faint")}>
    {value ?? "not computed"}
  </span>
);

const JurisdictionFigures: FC<{ jurisdictions: readonly ComputedJurisdiction[] }> = ({
  jurisdictions,
}) => (
  <section className="mt-10">
    <h2 className="border-border border-b pb-2 font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
      Computed figures
    </h2>

    <div className="mt-1">
      {jurisdictions.map((jurisdiction, index) => (
        <Row jurisdiction={jurisdiction} key={jurisdiction.code ?? `unnamed-${index}`} />
      ))}
    </div>
  </section>
);

const Row: FC<{ jurisdiction: ComputedJurisdiction }> = ({ jurisdiction }) => {
  const { code, etrRate, topUpTax, additionalTopUpTax, breaches, roundingBreachesTolerance } =
    jurisdiction;

  // Rules between rows only. This is a real multi-column table, where a rule does the
  // horizontal tracking a two-column tree does not need, but a trailing one under the
  // last row would sit against the end of the page as a stray line.
  return (
    <div className="border-border border-b py-3 last:border-b-0">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-4 sm:grid-cols-[3rem_repeat(3,minmax(0,1fr))]">
        <span className="font-medium text-sm">{code ?? "--"}</span>

        <Cell label="ETR">
          <Figure value={etrRate} />
        </Cell>

        <Cell label="Top-up tax">
          <Figure value={topUpTax} />
        </Cell>

        <Cell label="Additional">
          <Figure value={additionalTopUpTax} />
        </Cell>
      </div>

      {/*
        The reason this table exists. Rendered as a sentence rather than a badge: a
        coloured chip reading "BREACH" says something happened, and the filer needs to
        know which number is not the one they computed.
      */}
      {breaches.length > 0 && (
        <p className="mt-2 pl-[3.5rem] text-ink-struck text-xs leading-relaxed">
          The computed rate is {breaches.map(describeBreach).join(", ")}, so the document carries a
          corrected value rather than this one.
        </p>
      )}

      {roundingBreachesTolerance && (
        <p className="mt-1 pl-[3.5rem] text-ink-suppressed text-xs leading-relaxed">
          Rounding to four decimal places moves the top-up tax past the one percent tolerance.
        </p>
      )}
    </div>
  );
};

const Cell: FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
    <span className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
      {label}
    </span>
    {children}
  </div>
);

export default JurisdictionFigures;
