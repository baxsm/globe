import type { GirDocument, GirElement, GirNode } from "../serialize/types";
import { isElement } from "../serialize/types";
import { findByPath, localName, replaceAt } from "./path";
import type { Application, RuleResult } from "./types";

/**
 * Issue 13: the Recast element is in the wrong place in the schema.
 * Guidance paragraphs 37 to 38.
 *
 * > "The element Recast is wrongly located in the XML schema."
 *
 * It sits inside `DeferTaxAdjustAmt/Adjustment` and belongs directly under
 * `DeferTaxAdjustAmt`. Because of where it is, reporting a Recast drags in `Adjustment`'s
 * mandatory children, `AdjustmentItem` and `Amount`, which have nothing to say here.
 *
 * **`GIR2516` with an Amount of exactly zero is a dummy value the guidance requires, not
 * a placeholder someone forgot to fill in.** See `docs/errata.md`, issue 13. The enum
 * value is labelled "Deferred tax adjustment resulting from transactions between
 * Constituent Entities - Article 9.1.3", which is unrelated to a Recast; it is chosen
 * because it parses, and the zero is chosen because the amount is meaningless.
 */

/**
 * Absolute, from inside the root element, and it names the one branch that has a Recast.
 *
 * `findByPath` matches from the root down, so the fragment `DeferTaxAdjustAmt/Adjustment`
 * matched nothing in a real filing and the rule silently did not run. The sibling branch
 * under `OverallComputation` spells the element `Adjustments` and has no `Recast` child,
 * so this is the only place the dummy belongs.
 */
const ADJUSTMENT_PATH =
  "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedCoveredTax/DeferTaxAdjustAmt/Adjustment";

/** Dummy value fixed by paragraph 38. Its label does not describe a Recast. */
export const RECAST_DUMMY_ADJUSTMENT_ITEM = "GIR2516";

/** Paragraph 38 requires exactly zero, not an absent element. */
export const RECAST_DUMMY_AMOUNT = "0";

const element = (name: string, value: string): GirElement => ({
  kind: "element",
  name,
  attributes: [],
  children: [{ kind: "text", value }],
  paired: false,
});

const childNamed = (parent: GirElement, name: string): GirElement | undefined =>
  parent.children.find(
    (child): child is GirElement => isElement(child) && localName(child.name) === name,
  );

const prefixOf = (name: string): string => {
  const colon = name.indexOf(":");
  return colon === -1 ? "" : name.slice(0, colon + 1);
};

/**
 * Fires only for an `Adjustment` that actually contains a `Recast`.
 *
 * An `Adjustment` without one is an ordinary deferred tax adjustment whose
 * `AdjustmentItem` and `Amount` are real. Writing the dummy over those would replace a
 * genuine figure with zero, and the result would still validate.
 */
export const applyIssue13 = (document: GirDocument): RuleResult => {
  const adjustments = findByPath(document.root, ADJUSTMENT_PATH);
  const applications: Application[] = [];
  let root = document.root;

  for (const adjustment of adjustments) {
    if (childNamed(adjustment.element, "Recast") === undefined) continue;

    const prefix = prefixOf(adjustment.element.name);
    const existingItem = childNamed(adjustment.element, "AdjustmentItem");
    const existingAmount = childNamed(adjustment.element, "Amount");

    const children: GirNode[] = adjustment.element.children.map((child) => {
      if (!isElement(child)) return child;
      if (localName(child.name) === "AdjustmentItem") {
        return element(child.name, RECAST_DUMMY_ADJUSTMENT_ITEM);
      }
      if (localName(child.name) === "Amount") {
        return element(child.name, RECAST_DUMMY_AMOUNT);
      }
      return child;
    });

    if (existingItem === undefined) {
      children.unshift(element(`${prefix}AdjustmentItem`, RECAST_DUMMY_ADJUSTMENT_ITEM));
    }
    if (existingAmount === undefined) {
      children.push(element(`${prefix}Amount`, RECAST_DUMMY_AMOUNT));
    }

    root = replaceAt(root, adjustment.indices, { ...adjustment.element, children });

    applications.push({
      issue: 13,
      kind: "substitution",
      path: `${adjustment.path}/AdjustmentItem`,
      schemaExpected: "Recast located directly under DeferTaxAdjustAmt, with no Adjustment wrapper",
      errataApplied: `AdjustmentItem ${RECAST_DUMMY_ADJUSTMENT_ITEM} and Amount ${RECAST_DUMMY_AMOUNT} as dummy values`,
      paragraph: "38",
      reason:
        "Recast is misplaced inside Adjustment, whose mandatory AdjustmentItem and Amount have no meaning for a Recast",
    });
  }

  return { document: { ...document, root }, applications, suppressions: [] };
};
