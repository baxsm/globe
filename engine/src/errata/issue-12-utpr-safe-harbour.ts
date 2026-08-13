import type { GirDocument } from "../serialize/types";
import { findByPath, rawText, replaceAt } from "./path";
import type { Application, RuleResult } from "./types";

/**
 * Issue 12: two elements carry the same UTPR Safe Harbour.
 * Guidance paragraphs 35 to 36.
 *
 * `LowTaxJurisdiction/UTPR/UTPRSafeHarbour` is redundant with
 * `JurisdictionSection/ETR/ETRStatus/ETRException/UTPRSafeHarbour`. Paragraph 36 is
 * specific about which survives: the ETRException one is filled, and the UTPR one is
 * left blank.
 *
 * That is the opposite of the intuitive reading. The more deeply nested, more
 * UTPR-specific element is the one abandoned, so a developer resolving this by
 * inspection alone would very likely pick the wrong one and produce a document that
 * still validates.
 */

/**
 * Both paths are absolute, from inside the root element.
 *
 * `findByPath` matches from the root down, so a fragment like
 * `LowTaxJurisdiction/UTPR/UTPRSafeHarbour` matches only where that element is a direct
 * child of `GLOBE_OECD`, which it never is in a real filing. The rule then does nothing
 * and reports nothing, which is indistinguishable from a document that had no target.
 * `schema/paths.ts` is what catches this now.
 */
const REDUNDANT_PATH = "GLOBEBody/JurisdictionSection/LowTaxJurisdiction/UTPR/UTPRSafeHarbour";
const CANONICAL_PATH =
  "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRException/UTPRSafeHarbour";

export const applyIssue12 = (document: GirDocument): RuleResult => {
  const redundant = findByPath(document.root, REDUNDANT_PATH);
  const applications: Application[] = [];
  let root = document.root;

  for (const found of redundant) {
    if (rawText(found.element).length === 0 && found.element.children.length === 0) continue;

    root = replaceAt(root, found.indices, { ...found.element, children: [], paired: false });

    applications.push({
      issue: 12,
      kind: "substitution",
      path: found.path,
      schemaExpected: `a value here, duplicating ${CANONICAL_PATH}`,
      errataApplied: "left blank",
      paragraph: "36",
      reason: `redundant with ${CANONICAL_PATH}, which is the element the guidance keeps`,
    });
  }

  return { document: { ...document, root }, applications, suppressions: [] };
};
