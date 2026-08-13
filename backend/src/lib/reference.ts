import type { FixKind, IssueNumber } from "@globe/engine";
import { suppressionRecords } from "@globe/engine";

/**
 * The pinned specification versions, and the fourteen issues as data for the margin.
 *
 * These are recorded in `docs/schema-version.md` with the date each was verified against
 * the published source. They are constants here rather than a setting: a return stores
 * the versions it was created under, so changing these affects new returns only and
 * never silently re-interprets an existing one.
 */

export const SCHEMA_VERSION = "GLOBEXML_v1.0";

/**
 * Stamped on every validation run.
 *
 * A run records which engine produced it, so a finding that disappears after an engine
 * change is traceable to that change rather than looking like a corrected document.
 */
export const ENGINE_VERSION = "0.1.0";

/** The date the OECD/G20 Inclusive Framework approved the guidance. */
export const GUIDANCE_VERSION = "2026-06-03";

export const GUIDANCE_APPROVED = "3 June 2026";

/** Sizes are the uncompressed bytes committed at `engine/src/schema/xsd/`. */
export const SCHEMA_FILES = [
  { name: "GLOBEXML_v1.0.xsd", bytes: 129292 },
  { name: "isoglobetypes_v1.1.xsd", bytes: 106560 },
  { name: "oecdglobetypes_v5.0.xsd", bytes: 9855 },
] as const;

export interface IssueReference {
  readonly number: IssueNumber;
  readonly title: string;
  readonly kind: FixKind;
  readonly paragraph: string;
  readonly summary: string;
  /**
   * The validation rule this issue disapplies, when it disapplies one.
   *
   * Five issues have `kind: "suppression"` but only four are numbered validation rules.
   * Issue 3 suppresses an element, `UTPRAttribution`, not a rule. A caller counting the
   * kind would report five disapplied rules where the guidance names four, so the
   * number is carried explicitly rather than left to be inferred.
   */
  readonly validationRule: number | null;
}

/**
 * Titles and paragraph numbers are the guidance's own.
 *
 * `kind` is the mechanism the engine implements, which is why issue 2 reads
 * `substitution` while also emitting an `AdditionalDataPoint`: the substitution is the
 * part that changes what the document claims, and the data point is what carries the
 * truth alongside it.
 */
const ISSUE_TEXT: readonly Omit<IssueReference, "validationRule">[] = [
  {
    number: 1,
    title: "Point 3.1.6 Adjusted Covered Taxes",
    kind: "substitution",
    paragraph: "1-2",
    summary:
      "No element corresponds to GIR point 3.1.6. Its four sub-elements are reported in place of the sum.",
  },
  {
    number: 2,
    title: "Article 7.1.2 GloBE Losses of a flow-through UPE",
    kind: "substitution",
    paragraph: "3-8",
    summary:
      "Basis has no Article 7.1.2 value, so GIR1910 Article 7.2.2 is written instead and an AdditionalDataPoint carries the real basis.",
  },
  {
    number: 3,
    title: "No Jurisdiction element in UTPRAttribution",
    kind: "suppression",
    paragraph: "9-10",
    summary:
      "UTPRAttribution cannot say which jurisdiction generated the top-up tax. The element is not used for 2026 filings.",
  },
  {
    number: 4,
    title: "Equity gain or loss inclusion election",
    kind: "augmentation",
    paragraph: "11-13",
    summary:
      "The election has no element. An AdditionalDataPoint described ADT2 EquityGain carries the amount.",
  },
  {
    number: 5,
    title: "Deferred tax expense definition",
    kind: "substitution",
    paragraph: "14-15",
    summary:
      "The element's definition does not match the figure the GIR asks for. The value reported means something different from the label.",
  },
  {
    number: 6,
    title: "Unclaimed Accrual Annual Election",
    kind: "augmentation",
    paragraph: "16-18",
    summary:
      "No element records the election. An AdditionalDataPoint described ADT3 Art4.4.7 carries the entity TINs.",
  },
  {
    number: 7,
    title: "Safe harbour computations reported as zero",
    kind: "coercion",
    paragraph: "19-22",
    summary:
      "Under a safe harbour the ETR computation is not made, but nine elements are validation-required. All nine are reported as zero.",
  },
  {
    number: 8,
    title: "Validation rule 60025, ETR outside the permitted interval",
    kind: "suppression",
    paragraph: "23-25",
    summary:
      "60025 requires an ETRRate the schema's own [0, 1] restriction cannot express. It is not applied.",
  },
  {
    number: 9,
    title: "Validation rule 60026, rounding exceeds tolerance",
    kind: "suppression",
    paragraph: "26-28",
    summary:
      "Four-decimal rounding of a very small percentage breaches the 1 percent tolerance 60026 enforces. It is not applied.",
  },
  {
    number: 10,
    title: "Validation rule 70092, negative tax expense election",
    kind: "suppression",
    paragraph: "29-31",
    summary:
      "70092 forces AdditionalTopUpTax to zero where the Article 4.1.5 election legitimately produces a negative. It is not applied.",
  },
  {
    number: 11,
    title: "Validation rule 70028, ownership percentage rounding to zero",
    kind: "suppression",
    paragraph: "32-34",
    summary:
      "A genuine holding of 0.001 percent rounds to zero, which 70028 forbids. It is not applied.",
  },
  {
    number: 12,
    title: "UTPR safe harbour",
    kind: "substitution",
    paragraph: "35-37",
    summary:
      "The safe harbour cannot be stated directly and is reported through a substitute value.",
  },
  {
    number: 13,
    title: "Recast of deferred tax adjustments",
    kind: "substitution",
    paragraph: "38-40",
    summary:
      "A recast needs an adjustment item the schema does not define. A dummy item carries the zero amount.",
  },
  {
    number: 14,
    title: "Percentages outside the schema range",
    kind: "coercion",
    paragraph: "41-43",
    summary:
      "A computed percentage outside [0, 1] is clamped to the boundary, and the true value is reported separately.",
  },
];

/**
 * The issues, each carrying the validation rule it disapplies.
 *
 * The rule numbers are read from the engine's own suppression records rather than
 * repeated here. Written twice, the two lists drift the first time a rule is added, and
 * the copy without tests is the one the UI would be reading.
 */
export const ISSUES: readonly IssueReference[] = ISSUE_TEXT.map((issue) => ({
  ...issue,
  validationRule:
    suppressionRecords.find((record) => record.issue === issue.number)?.validationRule ?? null,
}));
