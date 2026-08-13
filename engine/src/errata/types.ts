import type { GirDocument } from "../serialize/types";

/**
 * The fourteen defects the OECD documented in its own schema, as one shape.
 *
 * Every rule answers the same four questions, because that quadruple is what the
 * margin renders: does this apply, what does it write, what would the schema have
 * wanted, and which paragraph of the guidance authorises the difference.
 *
 * The specification is `docs/errata.md`, which was written from the full text of the
 * guidance approved 3 June 2026. Issue numbers here are the guidance's own numbering.
 */

export type IssueNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

/**
 * What a fix mechanically does.
 *
 * The four are not stylistic labels. They differ in what they touch: a substitution
 * rewrites a value, an augmentation adds a sibling element, a suppression changes
 * nothing in the document at all, and a coercion forces a computed number into a range
 * the schema permits while the true value is kept elsewhere.
 */
export type FixKind = "substitution" | "augmentation" | "suppression" | "coercion";

/** A single application of one rule at one place in one document. */
export interface Application {
  readonly issue: IssueNumber;
  readonly kind: FixKind;
  /** Full path from the root. Never an element name: `Amount` alone is 11 elements. */
  readonly path: string;
  /** What the schema, read literally, would have expected here. */
  readonly schemaExpected: string;
  /** What the guidance requires instead. */
  readonly errataApplied: string;
  /** Paragraph number in the guidance, for example "5-7". Never empty. */
  readonly paragraph: string;
  /** One line, for the margin. */
  readonly reason: string;
}

/**
 * A rule that must not run, and why.
 *
 * Suppressions leave the document untouched, so without this record a suppressed rule
 * and a rule with a bug look identical from the outside. The guidance is explicit that
 * these four "should not be applied"; the engine has to be explicit that it did not.
 */
export interface Suppression {
  readonly issue: IssueNumber;
  readonly validationRule: number;
  readonly paragraph: string;
  readonly reason: string;
}

export interface RuleResult {
  readonly document: GirDocument;
  readonly applications: readonly Application[];
  readonly suppressions: readonly Suppression[];
}

/**
 * The reporting cycle a document belongs to.
 *
 * The guidance is titled "for First GIR Filings and Exchanges" and issue 3 is scoped
 * explicitly to filings in 2026. A rule that ignores the cycle would keep applying
 * first-cycle workarounds to a later schema that has fixed them.
 */
export interface RuleContext {
  readonly filingYear: number;
}

export interface Rule {
  readonly issue: IssueNumber;
  readonly kind: FixKind;
  readonly paragraph: string;
  /** Short identifier, kebab-case, for logs and test names. */
  readonly name: string;
  readonly apply: (document: GirDocument, context: RuleContext) => RuleResult;
}
