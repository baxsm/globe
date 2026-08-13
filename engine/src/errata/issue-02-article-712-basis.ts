import type { GirDocument, GirElement, GirNode } from "../serialize/types";
import { appendChildrenAt, findByPath, rawText, replaceAt } from "./path";
import type { Application, Rule, RuleResult } from "./types";

/**
 * Issue 2: Article 7.1.2 GloBE Losses of a UPE that is a Flow-through Entity.
 * Guidance paragraphs 3 to 8.
 *
 * The `Basis` enumeration offers Article 7.1.1, 7.2.1 and 7.2.2 but not 7.1.2, and the
 * field is validation-required so it cannot be left blank. The guidance's answer is to
 * write the enum value for a different article and label the truth in an
 * `AdditionalDataPoint` alongside it.
 *
 * **`GIR1910` is literally labelled "Article 7.2.2" in the schema. Writing it where
 * Article 7.1.2 is meant is correct, not a bug.** See `docs/errata.md`, issue 2. A later
 * reader who "fixes" this by finding the 7.1.2 enum will not find one.
 *
 * The dangerous part is the condition. Paragraph 8 says that where `GIR1910` genuinely
 * means Article 7.2.2, the element is repeated and used twice. So `GIR1910` in a
 * document means either 7.1.2 or 7.2.2, and the only thing that tells them apart is the
 * accompanying data point. This rule therefore fires only where the caller states that
 * 7.1.2 was elected. Applying it to every `UPEAdjustments` would silently rewrite every
 * legitimate Article 7.2.2 filing into a different claim, and both versions validate.
 */

const BASIS_PATH =
  "GLOBEBody/JurisdictionSection/GLOBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedFANIL/Adjustment/UPEAdjustments/Basis";

const REDUCTIONS_AMOUNT_PATH =
  "GLOBEBody/JurisdictionSection/GLOBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedFANIL/Adjustment/UPEAdjustments/Reductions/Amount";

const REDUCTIONS_EXCEPTION_PATH =
  "GLOBEBody/JurisdictionSection/GLOBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedFANIL/Adjustment/UPEAdjustments/Reductions/Exception";

const DATA_POINT_PATH = "GLOBEBody/JurisdictionSection/AdditionalDataPoint";

/** The substitute enum value. Its own label says Article 7.2.2; that is the point. */
export const ARTICLE_712_SUBSTITUTE = "GIR1910";

/** Paragraph 7 fixes these literals. They are the wire format, not labels chosen here. */
export const ADT1_DESCRIPTION = "ADT1 Basis";
const ADT1_TEXT = "Article 7.1.2";
const ADT1_TEXT_WITH_EXCEPTION = "Article 7.1.2, Exception";

const element = (name: string, children: readonly GirNode[]): GirElement => ({
  kind: "element",
  name,
  attributes: [],
  children,
  paired: false,
});

const text = (value: string): GirNode => ({ kind: "text", value });

const prefixOf = (name: string): string => {
  const colon = name.indexOf(":");
  return colon === -1 ? "" : name.slice(0, colon + 1);
};

/**
 * Which UPE adjustments are Article 7.1.2, given by the caller.
 *
 * Indices into the document's `UPEAdjustments/Basis` matches, in document order. The
 * engine cannot infer this: a 7.1.2 election and a 7.2.2 election look identical once
 * the substitution is written, which is the entire defect.
 */
export interface Issue2Context {
  readonly article712BasisIndices: readonly number[];
}

export const buildAdditionalDataPoint = (
  prefix: string,
  amount: string,
  hasException: boolean,
  relatedPath: string,
): GirElement =>
  element(`${prefix}AdditionalDataPoint`, [
    element(`${prefix}Description`, [text(ADT1_DESCRIPTION)]),
    element(`${prefix}Amount`, [text(amount)]),
    element(`${prefix}Text`, [
      text(`${hasException ? ADT1_TEXT_WITH_EXCEPTION : ADT1_TEXT} ${relatedPath}`),
    ]),
  ]);

export const applyIssue2 = (document: GirDocument, context: Issue2Context): RuleResult => {
  const elected = new Set(context.article712BasisIndices);
  if (elected.size === 0) return { document, applications: [], suppressions: [] };

  const bases = findByPath(document.root, BASIS_PATH);
  const amounts = findByPath(document.root, REDUCTIONS_AMOUNT_PATH);
  const exceptions = findByPath(document.root, REDUCTIONS_EXCEPTION_PATH);
  const dataPointParents = findByPath(document.root, "GLOBEBody/JurisdictionSection");

  const applications: Application[] = [];
  let root = document.root;

  bases.forEach((basis, index) => {
    if (!elected.has(index)) return;

    const previous = rawText(basis.element);
    root = replaceAt(root, basis.indices, {
      ...basis.element,
      children: [text(ARTICLE_712_SUBSTITUTE)],
    });

    applications.push({
      issue: 2,
      kind: "substitution",
      path: basis.path,
      schemaExpected: "an enum value for Article 7.1.2, which the schema does not define",
      errataApplied: `${ARTICLE_712_SUBSTITUTE} (labelled Article 7.2.2) written in its place${
        previous.length > 0 ? `, replacing ${previous}` : ""
      }`,
      paragraph: "5",
      reason:
        "Basis is validation-required and has no Article 7.1.2 value, so the guidance substitutes GIR1910",
    });
  });

  // Second step, paragraph 6. The substitution alone is unreadable: it claims Article
  // 7.2.2. The data point is what carries the truth.
  const parent = dataPointParents[0];
  if (parent !== undefined && applications.length > 0) {
    const prefix = prefixOf(parent.element.name);
    const amount = amounts[0] === undefined ? "0" : rawText(amounts[0].element);
    const hasException = exceptions.length > 0;
    const dataPoint = buildAdditionalDataPoint(prefix, amount, hasException, BASIS_PATH);

    // Appended against the rewritten tree, not the one read at the start, so the Basis
    // substitutions above are not discarded.
    root = appendChildrenAt(root, parent.indices, [dataPoint]);

    applications.push({
      issue: 2,
      kind: "augmentation",
      path: DATA_POINT_PATH,
      schemaExpected: "no element capable of recording that the basis is Article 7.1.2",
      errataApplied: `AdditionalDataPoint with Description "${ADT1_DESCRIPTION}", Amount ${amount}, Text "${
        hasException ? ADT1_TEXT_WITH_EXCEPTION : ADT1_TEXT
      }"`,
      paragraph: "6-7",
      reason:
        "the substituted Basis reads as Article 7.2.2, so the data point is the only record of what was actually elected",
    });
  }

  return { document: { ...document, root }, applications, suppressions: [] };
};

/**
 * Registered form. Without an explicit election this rule does nothing, which is the
 * safe default: over-application here corrupts a valid Article 7.2.2 filing.
 */
export const issue2Rule: Rule = {
  issue: 2,
  kind: "substitution",
  paragraph: "3-8",
  name: "article-712-basis-substitute",
  apply: (document) => applyIssue2(document, { article712BasisIndices: [] }),
};
