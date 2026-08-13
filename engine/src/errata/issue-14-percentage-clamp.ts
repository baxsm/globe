import Decimal from "decimal.js";
import { clampToPercentage } from "../calc/etr";
import type { GirDocument } from "../serialize/types";
import { findByPath, rawText, replaceAt } from "./path";
import type { Application, RuleResult } from "./types";

/**
 * Issue 14: calculated percentages outside the interval the schema permits.
 * Guidance paragraphs 39 to 40.
 *
 * Paragraph 40 gives the rule exactly: a negative percentage is reported as zero, and
 * one above the permitted maximum is reported as that maximum, 100 or 1 depending on how
 * the element is expressed.
 *
 * Everything in `globe:percentage` is a fraction, bounded [0, 1] with four fraction
 * digits, so the ceiling here is 1. The scale is read from the schema type rather than
 * assumed, which is why the bound lives in `calc/constants` next to the XSD restriction
 * it came from.
 *
 * This rule is lossy on purpose and pairs with issue 8. The document gets the clamped
 * value because that is all it can carry; the true value stays in the computation and
 * in the application record below, so the margin can show both. A filing whose ETR was
 * really 1.4 and reads as 1 is not wrong, but it is not the whole truth either.
 */

/** Percentage-typed elements that a computation can push out of range. */
const PERCENTAGE_PATHS: readonly string[] = [
  "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/OverallComputation/ETRRate",
  "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/OverallComputation/TopUpTaxPercentage",
];

const isNumeric = (value: string): boolean => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value);

export const applyIssue14 = (document: GirDocument): RuleResult => {
  const applications: Application[] = [];
  let root = document.root;

  for (const path of PERCENTAGE_PATHS) {
    for (const found of findByPath(root, path)) {
      const raw = rawText(found.element).trim();
      if (!isNumeric(raw)) continue;

      const value = new Decimal(raw);
      const clamped = clampToPercentage(value);
      if (clamped.equals(value)) continue;

      root = replaceAt(root, found.indices, {
        ...found.element,
        children: [{ kind: "text", value: clamped.toString() }],
      });

      applications.push({
        issue: 14,
        kind: "coercion",
        path: found.path,
        schemaExpected: `${raw}, which globe:percentage cannot express`,
        errataApplied: clamped.toString(),
        paragraph: "40",
        reason: value.isNegative()
          ? "a negative percentage is reported as zero"
          : "a percentage above the permitted maximum is reported as that maximum",
      });
    }
  }

  return { document: { ...document, root }, applications, suppressions: [] };
};
