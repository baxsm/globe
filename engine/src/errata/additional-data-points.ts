import type { GirDocument, GirElement, GirNode } from "../serialize/types";
import { appendChildrenAt, findByPath } from "./path";
import type { Application, IssueNumber, RuleResult } from "./types";

/**
 * Issues 4 and 6: data the schema has nowhere to put.
 * Guidance paragraphs 11 to 14, and 17 to 20.
 *
 * Both are the same mechanism as the second half of issue 2. Where the schema has no
 * element for something the GIR requires, the value goes into an `AdditionalDataPoint`
 * under `GLOBEBody/JurisdictionSection/AdditionalDataPoint`, tagged by a literal string
 * in `Description`.
 *
 * Those literals are the wire format. `ADT1 Basis`, `ADT2 EquityGain` and
 * `ADT3 Art4.4.7` are how a receiving administration tells three otherwise identical
 * data points apart, so they are fixed strings and not labels chosen here.
 *
 * Paragraphs 14 and 20 both say the same thing about the rest: no other element under
 * the data point is completed. So these build exactly the children the guidance lists,
 * and nothing else.
 */

const DATA_POINT_PARENT_PATH = "GLOBEBody/JurisdictionSection";

/** Issue 4, paragraph 13. Equity gain under an Equity Investment Inclusion election. */
export const ADT2_DESCRIPTION = "ADT2 EquityGain";

/** Issue 6, paragraph 19. The Unclaimed Accrual Annual Election. */
export const ADT3_DESCRIPTION = "ADT3 Art4.4.7";

const ISSUE_4_RELATED_PATH = "GLOBEBody/JurisdictionSection/GLOBETax/ETR/Election/Art3.2.1.c";

const ISSUE_6_RELATED_PATH =
  "GLOBEBody/JurisdictionSection/GLOBETax/ETR/ETRStatus/ETRComputation/CEComputation/Elections/Art4.4.7";

const text = (value: string): GirNode => ({ kind: "text", value });

const element = (name: string, children: readonly GirNode[]): GirElement => ({
  kind: "element",
  name,
  attributes: [],
  children,
  paired: false,
});

const prefixOf = (name: string): string => {
  const colon = name.indexOf(":");
  return colon === -1 ? "" : name.slice(0, colon + 1);
};

interface DataPointSpec {
  readonly issue: IssueNumber;
  readonly description: string;
  /** Omitted for issue 6, which reports an election rather than a figure. */
  readonly amount?: string;
  readonly text: string;
  readonly relatedPath: string;
  readonly paragraph: string;
  readonly schemaExpected: string;
  readonly reason: string;
}

const buildDataPoint = (prefix: string, spec: DataPointSpec): GirElement => {
  const children: GirNode[] = [element(`${prefix}Description`, [text(spec.description)])];

  if (spec.amount !== undefined) {
    children.push(element(`${prefix}Amount`, [text(spec.amount)]));
  }
  children.push(element(`${prefix}Text`, [text(`${spec.text} ${spec.relatedPath}`)]));

  return element(`${prefix}AdditionalDataPoint`, children);
};

const appendDataPoint = (document: GirDocument, spec: DataPointSpec): RuleResult => {
  const parent = findByPath(document.root, DATA_POINT_PARENT_PATH)[0];
  if (parent === undefined) return { document, applications: [], suppressions: [] };

  const prefix = prefixOf(parent.element.name);
  const root = appendChildrenAt(document.root, parent.indices, [buildDataPoint(prefix, spec)]);

  const application: Application = {
    issue: spec.issue,
    kind: "augmentation",
    path: `${DATA_POINT_PARENT_PATH}/AdditionalDataPoint`,
    schemaExpected: spec.schemaExpected,
    errataApplied: `AdditionalDataPoint with Description "${spec.description}"${
      spec.amount === undefined ? "" : `, Amount ${spec.amount}`
    }, Text "${spec.text}"`,
    paragraph: spec.paragraph,
    reason: spec.reason,
  };

  return { document: { ...document, root }, applications: [application], suppressions: [] };
};

/**
 * Issue 4: no element for GIR 3.2.3.1.b.1, the equity gain or loss included in GloBE
 * Income when the Equity Investment Inclusion Election is made.
 */
export const applyIssue4 = (document: GirDocument, amount: string): RuleResult =>
  appendDataPoint(document, {
    issue: 4,
    description: ADT2_DESCRIPTION,
    amount,
    text: "equity gain or loss under the Equity Investment Inclusion Election, relating to",
    relatedPath: ISSUE_4_RELATED_PATH,
    paragraph: "12-13",
    schemaExpected: "an element under Art3.2.1.c corresponding to GIR 3.2.3.1.b.1",
    reason: "the schema has no element for the equity gain or loss the GIR requires here",
  });

/**
 * Issue 6: Article 4.4.7 has two elections and the schema carries only the Five-Year
 * one. The existing `Art4.4.7` element is completed only for that election; the Annual
 * Election goes here instead.
 *
 * Paragraph 19 asks for the TINs of the constituent entities the election is made for,
 * unless aggregate reporting applies, so the caller supplies them.
 */
export const applyIssue6 = (document: GirDocument, tins: readonly string[]): RuleResult =>
  appendDataPoint(document, {
    issue: 6,
    description: ADT3_DESCRIPTION,
    text:
      tins.length === 0
        ? "Unclaimed Accrual Annual Election, aggregate reporting, relating to"
        : `Unclaimed Accrual Annual Election for ${tins.join(", ")}, relating to`,
    relatedPath: ISSUE_6_RELATED_PATH,
    paragraph: "18-19",
    schemaExpected:
      "an element under Art4.4.7 for the Unclaimed Accrual Annual Election, which the schema does not define",
    reason:
      "Art4.4.7 carries only the Five-Year Election, so the Annual Election has nowhere else to go",
  });
