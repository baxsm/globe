import type { GirDocument } from "../serialize/types";
import type { IssueNumber, Rule, Suppression } from "./types";

/**
 * Issues 8 to 11: four validation rules the guidance says must not be applied.
 *
 * These rules change nothing in the document. That is exactly why they emit a record:
 * a validator that quietly skips four rules is indistinguishable from one with a bug,
 * and the guidance's instruction is explicit enough to be worth quoting back. The
 * record is what the margin renders and what `validation_runs.suppressions` stores.
 *
 * Each entry quotes the guidance's own sentence, because "should not be applied" is the
 * whole authority for not running it.
 */

interface SuppressedRule {
  readonly issue: IssueNumber;
  readonly name: string;
  readonly validationRule: number;
  readonly paragraph: string;
  readonly reason: string;
}

const SUPPRESSED: readonly SuppressedRule[] = [
  {
    issue: 8,
    name: "rule-60025-etr-outside-interval",
    validationRule: 60025,
    paragraph: "23-25",
    reason:
      "60025 requires ETRRate to equal AdjustedCoveredTax/Total over NetGlobeIncome/Total, but the schema confines ETRRate to [0, 1] and that division can legitimately fall outside it",
  },
  {
    issue: 9,
    name: "rule-60026-rounding-exceeds-tolerance",
    validationRule: 60026,
    paragraph: "26-28",
    reason:
      "60026 checks TopUpTax against a formula that permits four-decimal rounding within 1 percent, and a very small TopUpTaxPercentage breaches that tolerance on rounding alone",
  },
  {
    issue: 10,
    name: "rule-70092-negative-tax-expense-election",
    validationRule: 70092,
    paragraph: "29-31",
    reason:
      "70092 forces AdditionalTopUpTax to 0 when the difference is negative, which the Article 4.1.5 negative tax expense election legitimately produces",
  },
  {
    issue: 11,
    name: "rule-70028-ownership-rounds-to-zero",
    validationRule: 70028,
    paragraph: "32-34",
    reason:
      "70028 forbids a Constituent Entity ownership percentage of 0 percent, but a genuine holding of 0.001 percent rounds to 0 and becomes unreportable",
  },
];

/**
 * Suppressions are unconditional.
 *
 * There is no document shape that makes rule 60025 safe to run again. The guidance
 * disapplies these four for the whole first filing cycle, so the record is emitted for
 * every document rather than only where the edge case happens to bite. A filing that
 * would have passed 60025 anyway is still a filing where 60025 was not the authority.
 */
export const suppressionRules: readonly Rule[] = SUPPRESSED.map((suppressed) => ({
  issue: suppressed.issue,
  kind: "suppression" as const,
  paragraph: suppressed.paragraph,
  name: suppressed.name,
  apply: (document: GirDocument) => ({
    document,
    applications: [],
    suppressions: [
      {
        issue: suppressed.issue,
        validationRule: suppressed.validationRule,
        paragraph: suppressed.paragraph,
        reason: suppressed.reason,
      } satisfies Suppression,
    ],
  }),
}));

/** The four rule numbers, for a validator that needs to know what not to run. */
export const suppressedValidationRules: readonly number[] = SUPPRESSED.map(
  (suppressed) => suppressed.validationRule,
);
