import type { GirDocument } from "../serialize/types";
import { findByPath } from "./path";
import type { Application, RuleResult } from "./types";

/**
 * Issues 1 and 5: two defects that change what a value means, not where it goes.
 *
 * Neither rewrites the document. Both change how a figure must be computed before it is
 * written, so what they produce is a record for the margin rather than a mutation. A
 * rule here that silently recomputed a filer's number would be substituting its own
 * arithmetic for theirs, which is not what the guidance asks for.
 *
 * They are grouped because they share that shape, not because they are related.
 */

const ADJ_COVERED_TAX_DIFFERENCE_PATH =
  "GLOBEBody/JurisdictionSection/JurWithTaxingRights/ReportDifference/AdjCoveredTaxDifference";

const ADJUSTED_INCOME_TAX_TOTAL_PATH =
  "GLOBEBody/JurisdictionSection/GLOBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedIncomeTax/Total";

/**
 * The four sub-elements that stand in for the missing sum.
 *
 * **These four substitute for a parent total the schema has no element for.** See
 * `docs/errata.md`, issue 1. There is no `AdjustedCoveredTaxes` element to write at GIR
 * point 3.1.6; the reader is expected to add these up.
 */
export const ADJ_COVERED_TAX_SUB_ELEMENTS: readonly string[] = [
  "AggCurrentTaxExpense",
  "QRTCExpense",
  "OtherTaxCredits",
  "DeferTaxExpense",
];

/**
 * Issue 1, paragraphs 1 to 2. No element corresponds to GIR point 3.1.6, Adjusted
 * Covered Taxes, though the schema carries the four sub-elements beneath it.
 */
export const applyIssue1 = (document: GirDocument): RuleResult => {
  const found = findByPath(document.root, ADJ_COVERED_TAX_DIFFERENCE_PATH);

  const applications: Application[] = found.map(
    (match): Application => ({
      issue: 1,
      kind: "substitution",
      path: match.path,
      schemaExpected:
        "an element for GIR point 3.1.6, Adjusted Covered Taxes, which does not exist",
      errataApplied: `the sum is carried by its four sub-elements: ${ADJ_COVERED_TAX_SUB_ELEMENTS.join(", ")}`,
      paragraph: "2",
      reason:
        "the schema has the four components of the 3.1.6 total but no element for the total itself",
    }),
  );

  return { document, applications, suppressions: [] };
};

/**
 * Issue 5, paragraphs 15 to 16. `AdjustedIncomeTax/Total` must be the total after the
 * cross-allocation adjustment, so that it corresponds to GIR 3.2.4.2.b.8.
 *
 * The XML Schema User Guide says `Total` is the current tax expense after
 * cross-allocation. Paragraph 15 corrects that: the total must include current **and
 * deferred** tax expense. A filing prepared from the User Guide alone understates this
 * figure by the deferred component, and nothing in the schema catches it.
 */
export const applyIssue5 = (document: GirDocument): RuleResult => {
  const found = findByPath(document.root, ADJUSTED_INCOME_TAX_TOTAL_PATH);

  const applications: Application[] = found.map(
    (match): Application => ({
      issue: 5,
      kind: "substitution",
      path: match.path,
      schemaExpected:
        "current tax expense after cross-allocation, as the XML Schema User Guide describes Total",
      errataApplied:
        "the total after cross-allocation adjustment, including deferred tax expense, corresponding to GIR 3.2.4.2.b.8",
      paragraph: "16",
      reason:
        "GIR element 3.2.4.2.b.8 is absent and 3.2.4.2.a.2 is dislocated, so Total carries a different figure than the User Guide states",
    }),
  );

  return { document, applications, suppressions: [] };
};
