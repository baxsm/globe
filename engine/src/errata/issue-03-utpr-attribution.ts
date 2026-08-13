import type { GirDocument } from "../serialize/types";
import { findByPath } from "./path";
import type { Application, RuleContext, RuleResult } from "./types";

/**
 * Issue 3: UTPRAttribution has no Jurisdiction element.
 * Guidance paragraphs 9 to 10.
 *
 * The schema can say which jurisdictions UTPR taxing rights were allocated to, but not
 * which low-tax jurisdiction generated the top-up tax in the first place.
 *
 * The guidance does not work around it:
 *
 * > "This element should not be used for filings in 2026."
 *
 * No jurisdiction had a UTPR applying in 2024, so nothing is reportable in the first
 * cycle and the gap costs nothing yet. Paragraph 10 says it will be fixed in the schema
 * when an opportunity arises.
 *
 * So this rule is scoped to the filing year rather than applied unconditionally. Once
 * a UTPR does apply, suppressing the element would start hiding real data, and a rule
 * that ignored the cycle would do exactly that.
 */

const UTPR_ATTRIBUTION_PATH = "GLOBEBody/UTPRAttribution";

/** The cycle the guidance scopes this to. */
export const UTPR_ATTRIBUTION_UNUSED_YEAR = 2026;

export const applyIssue3 = (document: GirDocument, context: RuleContext): RuleResult => {
  if (context.filingYear !== UTPR_ATTRIBUTION_UNUSED_YEAR) {
    return { document, applications: [], suppressions: [] };
  }

  const present = findByPath(document.root, UTPR_ATTRIBUTION_PATH);
  const applications: Application[] = present.map(
    (found): Application => ({
      issue: 3,
      kind: "suppression",
      path: found.path,
      schemaExpected: "UTPRAttribution, which has no Jurisdiction element to identify the source",
      errataApplied: "not used for a 2026 filing",
      paragraph: "10",
      reason:
        "no jurisdiction had a UTPR applying in 2024, so there is no UTPR to report in the first cycle",
    }),
  );

  return { document, applications, suppressions: [] };
};
