import type { GirDocument } from "../serialize/types";
import { isElement } from "../serialize/types";
import { elementAt, findByPath, removeAt } from "./path";
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

/**
 * "Left blank" means omitted, and the empty wrapper goes with it.
 *
 * Three schema facts decide this. `UTPRSafeHarbour` is `minOccurs="0"` but its `CITRate`
 * child is mandatory, so an element present with no children is invalid. `UTPR` is an
 * `xsd:choice` requiring one of `UTPRSafeHarbour` or `UTPRCalculation`, so removing the
 * safe harbour and leaving the wrapper is invalid too. `UTPR` is itself optional, so the
 * wrapper can go.
 *
 * Emptying the element, which is the intuitive reading of "left blank", turns a filing the
 * schema accepts into one it refuses. A rule carrying out the guidance must not do that.
 */
export const applyIssue12 = (document: GirDocument): RuleResult => {
  const applications: Application[] = [];
  let root = document.root;

  // Re-resolved each pass because removing one element shifts the indices of its
  // siblings, which would make a second stored index address the wrong node.
  for (;;) {
    const found = findByPath(root, REDUNDANT_PATH)[0];
    if (found === undefined) break;

    // The parent is this element's own, addressed by dropping the last index rather than
    // by searching again: a second `UTPR` elsewhere in the document must not be the one
    // that gets removed.
    const parentIndices = found.indices.slice(0, -1);
    const parent = elementAt(root, parentIndices);
    const onlyChild = parent !== undefined && parent.children.filter(isElement).length === 1;

    root = removeAt(root, onlyChild ? parentIndices : found.indices);

    applications.push({
      issue: 12,
      kind: "substitution",
      path: found.path,
      schemaExpected: `a value here, duplicating ${CANONICAL_PATH}`,
      errataApplied: "left blank, so the element is not reported",
      paragraph: "36",
      reason: `redundant with ${CANONICAL_PATH}, which is the element the guidance keeps`,
    });
  }

  return { document: { ...document, root }, applications, suppressions: [] };
};
