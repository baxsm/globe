import type { GirDocument, GirElement } from "../serialize/types";
import { isElement } from "../serialize/types";
import { findByPath, localName, rawText, replaceAt } from "./path";
import type { Application, RuleResult } from "./types";

/**
 * Issue 7: sub-elements the schema demands and the GIR does not.
 * Guidance paragraphs 21 to 22.
 *
 * Where a safe harbour reduces top-up tax to zero, Note 2.2.1 of the GIR Guidelines says
 * Section 3 is generally not completed. Under the Note 2.2.1.1.1 exceptions, the routine
 * profits test among them, only Section 3.3.2 is required, the Substance-based Income
 * Exclusion. But SBIE lives inside `OverallComputation`, and the schema requires that
 * element and all of its children.
 *
 * Paragraph 22 lists the nine siblings to report as zero. They are structural padding to
 * satisfy the schema, not computed results, and a downstream reader that treats them as
 * real sees a jurisdiction with no income, no tax and an ETR of zero: a low-tax
 * jurisdiction that does not exist.
 *
 * Every zero written here therefore produces an application record, so the padding is
 * always distinguishable from a genuine nil return.
 */

const OVERALL_COMPUTATION_PATH =
  "GLOBEBody/JurisdictionSection/GLOBETax/ETR/ETRStatus/ETRComputation/OverallComputation";

/** The nine named at paragraph 22, in the order the guidance lists them. */
export const SAFE_HARBOUR_ZERO_ELEMENTS: readonly string[] = [
  "FANIL",
  "AdjustedFANIL",
  "NetGlobeIncome",
  "IncomeTaxExpense",
  "ETRRate",
  "TopUpTaxPercentage",
  "ExcessProfits",
  "TopUpTax",
  "ExcessNegTaxExpense",
];

const ZERO = "0";

export interface Issue7Context {
  /** True where a safe harbour applies and only the SBIE is genuinely required. */
  readonly safeHarbourApplies: boolean;
}

/**
 * Fires only under a safe harbour.
 *
 * Outside one, `OverallComputation`'s children are real figures. Zeroing them would
 * replace a whole jurisdiction's computation with padding, and the document would still
 * validate.
 */
export const applyIssue7 = (document: GirDocument, context: Issue7Context): RuleResult => {
  if (!context.safeHarbourApplies) return { document, applications: [], suppressions: [] };

  const computations = findByPath(document.root, OVERALL_COMPUTATION_PATH);
  const applications: Application[] = [];
  let root = document.root;

  for (const computation of computations) {
    const children = computation.element.children.map((child) => {
      if (!isElement(child)) return child;
      if (!SAFE_HARBOUR_ZERO_ELEMENTS.includes(localName(child.name))) return child;
      // Already zero, so there is nothing to coerce and nothing to report.
      if (rawText(child) === ZERO) return child;

      const replaced: GirElement = { ...child, children: [{ kind: "text", value: ZERO }] };

      applications.push({
        issue: 7,
        kind: "coercion",
        path: `${computation.path}/${child.name}`,
        schemaExpected: `${localName(child.name)} completed, though the GIR does not require it here`,
        errataApplied: "reported as zero",
        paragraph: "22",
        reason:
          "a safe harbour means only the SBIE is required, but the schema demands every sibling of OverallComputation",
      });

      return replaced;
    });

    root = replaceAt(root, computation.indices, { ...computation.element, children });
  }

  return { document: { ...document, root }, applications, suppressions: [] };
};
