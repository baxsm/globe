import type Decimal from "decimal.js";

/**
 * The result of a calculation, kept separately from what the schema can carry.
 *
 * Every calculation in this module returns the arithmetic truth. None of them clamp,
 * round to fit, or floor a value into the range the XSD permits. That is deliberate and
 * it is the whole design: issues 8, 9, 11 and 14 exist precisely because the true value
 * and the reportable value differ, and a function that returned only the reportable one
 * would erase the discrepancy the product is built to show.
 *
 * Deciding what to write into the document is the errata layer's job, in phase 4. This
 * layer's job is to know what the number actually is.
 */
export interface Computed {
  /** The arithmetic result, at full precision, unclamped and unrounded. */
  readonly value: Decimal;
  /**
   * Why the schema cannot carry this value as-is, empty when it can.
   *
   * Populated rather than thrown. A jurisdiction whose ETR is 1.4 is not an error, it
   * is a filing that needs issue 8 and issue 14 applied to it.
   */
  readonly breaches: readonly Breach[];
}

export type Breach =
  | { readonly kind: "below-minimum"; readonly bound: Decimal }
  | { readonly kind: "above-maximum"; readonly bound: Decimal }
  | { readonly kind: "too-many-fraction-digits"; readonly allowed: number; readonly actual: number }
  | { readonly kind: "rounds-to-zero" }
  | { readonly kind: "rounding-exceeds-tolerance"; readonly tolerance: Decimal };

/** True when the schema can carry the computed value unchanged. */
export const isReportable = (computed: Computed): boolean => computed.breaches.length === 0;

/** Inputs to the overall jurisdiction computation, all exact. */
export interface JurisdictionInput {
  readonly adjustedCoveredTax: Decimal;
  readonly netGlobeIncome: Decimal;
  readonly substanceExclusion: Decimal;
  readonly qdmtt: Decimal;
  /** Expected adjusted covered tax, when an Article 4.1.5 recomputation applies. */
  readonly expectedAdjustedCoveredTax?: Decimal;
}
