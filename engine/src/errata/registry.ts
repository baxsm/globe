import type { GirDocument } from "../serialize/types";
import { applyIssue4, applyIssue6 } from "./additional-data-points";
import { applyIssue1, applyIssue5 } from "./definitional";
import { applyIssue2, type Issue2Context } from "./issue-02-article-712-basis";
import { applyIssue3 } from "./issue-03-utpr-attribution";
import { applyIssue7, type Issue7Context } from "./issue-07-safe-harbour-zeros";
import { applyIssue12 } from "./issue-12-utpr-safe-harbour";
import { applyIssue13 } from "./issue-13-recast-dummy";
import { applyIssue14 } from "./issue-14-percentage-clamp";
import { suppressionRules } from "./suppressions";
import type { Application, IssueNumber, RuleContext, Suppression } from "./types";

/**
 * Applies the fourteen fixes to a document.
 *
 * **Order is fixed and load-bearing.** The rules are not all independent:
 *
 * - Issue 7 writes zeros into `OverallComputation`, including `ETRRate` and
 *   `TopUpTaxPercentage`. Issue 14 clamps those same two elements. Zero is inside
 *   [0, 1], so running 7 first means 14 finds nothing to clamp and correctly stays
 *   quiet. Reversing them would clamp a real out-of-range rate, then overwrite it with
 *   the safe harbour zero, losing the record that a clamp ever happened.
 * - Issue 2 substitutes a `Basis` value and then appends an `AdditionalDataPoint` to the
 *   same `JurisdictionSection` that issues 4 and 6 append to. Appends commute, so their
 *   relative order changes only the sequence of data points, but it is pinned anyway so
 *   the output is deterministic.
 *
 * Everything else touches disjoint paths. The ordering test in `_tests` is what keeps
 * that claim honest as rules are added.
 */

export interface ErrataContext extends RuleContext, Issue2Context, Issue7Context {
  /** Issue 4: the equity gain or loss, when the election was made. */
  readonly equityInclusionAmount?: string;
  /** Issue 6: TINs for the Unclaimed Accrual Annual Election, empty when aggregated. */
  readonly unclaimedAccrualAnnualTins?: readonly string[];
}

export interface ErrataResult {
  readonly document: GirDocument;
  readonly applications: readonly Application[];
  readonly suppressions: readonly Suppression[];
}

export const defaultContext = (filingYear: number): ErrataContext => ({
  filingYear,
  article712BasisIndices: [],
  safeHarbourApplies: false,
});

export const applyErrata = (document: GirDocument, context: ErrataContext): ErrataResult => {
  const applications: Application[] = [];
  const suppressions: Suppression[] = [];
  let current = document;

  const run = (result: ReturnType<typeof applyIssue1>): void => {
    current = result.document;
    applications.push(...result.applications);
    suppressions.push(...result.suppressions);
  };

  // Records only, no mutation.
  run(applyIssue1(current));
  run(applyIssue5(current));
  run(applyIssue3(current, context));

  // Structural fixes.
  run(applyIssue2(current, context));
  run(applyIssue13(current));
  run(applyIssue12(current));

  if (context.equityInclusionAmount !== undefined) {
    run(applyIssue4(current, context.equityInclusionAmount));
  }
  if (context.unclaimedAccrualAnnualTins !== undefined) {
    run(applyIssue6(current, context.unclaimedAccrualAnnualTins));
  }

  // Value coercions last, so they see the final figures. 7 before 14, see above.
  run(applyIssue7(current, context));
  run(applyIssue14(current));

  for (const rule of suppressionRules) {
    run(rule.apply(current, context));
  }

  return { document: current, applications, suppressions };
};

/** Every issue the registry can report, for the citation integrity test. */
export const KNOWN_ISSUES: readonly IssueNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
