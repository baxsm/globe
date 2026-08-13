import Decimal from "decimal.js";
import { CALCULATION_TOLERANCE, MINIMUM_RATE, PERCENTAGE_FRACTION_DIGITS } from "./constants";
import type { Computed } from "./types";

/**
 * Top-up tax, and the arithmetic the disapplied rules check.
 *
 * Nothing here rounds unless the caller asks for it. Rounding an intermediate value and
 * rounding again compounds the error into the very tolerance band that issue 9 is about,
 * so every intermediate stays at full precision and rounding happens once, explicitly,
 * at the point the spec puts it.
 */

/** The top-up tax percentage: the shortfall between the minimum rate and the ETR. */
export const topUpTaxPercentage = (effectiveRate: Decimal): Decimal =>
  MINIMUM_RATE.minus(effectiveRate);

/** Excess profits: net GloBE income less the substance-based income exclusion. */
export const excessProfits = (netGlobeIncome: Decimal, substanceExclusion: Decimal): Decimal =>
  netGlobeIncome.minus(substanceExclusion);

/**
 * Additional top-up tax, from validation rule 70092.
 *
 *   AdditionalTopUpTax = ExpectedAdjustedCoveredTax - AdjustedCoveredTax, floored at 0
 *
 * The floor comes after the subtraction. Flooring either operand first gives a different
 * and entirely plausible answer, which is why it is written as one expression here.
 *
 * Issue 10: under the Article 4.1.5 negative tax expense election this can legitimately
 * be zero and still trip the rule, so rule 70092 is disapplied.
 */
export const additionalTopUpTax = (
  expectedAdjustedCoveredTax: Decimal,
  adjustedCoveredTax: Decimal,
): Decimal => Decimal.max(expectedAdjustedCoveredTax.minus(adjustedCoveredTax), 0);

/**
 * Top-up tax, from validation rule 60026.
 *
 *   TopUpTax = (TopUpTaxPercentage x ExcessProfits) + AdditionalTopUpTax - QDMTT
 *
 * Issue 9: the rule allows rounding to four decimals within a 1 percent tolerance, and
 * a very small percentage breaks that on rounding alone, so rule 60026 is disapplied.
 */
export interface TopUpTaxInput {
  readonly topUpTaxPercentage: Decimal;
  readonly excessProfits: Decimal;
  readonly additionalTopUpTax: Decimal;
  readonly qdmtt: Decimal;
}

export const topUpTax = (input: TopUpTaxInput): Decimal =>
  input.topUpTaxPercentage
    .times(input.excessProfits)
    .plus(input.additionalTopUpTax)
    .minus(input.qdmtt);

/**
 * Whether reporting a percentage at four decimals moves the top-up tax by more than the
 * 1 percent the validation rules allow. This is issue 9, made measurable.
 *
 * The comparison is relative to the exact figure, not absolute. A 1 unit difference on a
 * large amount is within tolerance; the same difference on a small one is not.
 */
export interface ToleranceCheck {
  readonly exact: Decimal;
  readonly rounded: Decimal;
  readonly difference: Decimal;
  readonly withinTolerance: boolean;
}

export const roundingBreachesTolerance = (input: TopUpTaxInput): ToleranceCheck => {
  const exact = topUpTax(input);
  const rounded = topUpTax({
    ...input,
    topUpTaxPercentage: input.topUpTaxPercentage.toDecimalPlaces(
      PERCENTAGE_FRACTION_DIGITS,
      Decimal.ROUND_HALF_UP,
    ),
  });

  const difference = rounded.minus(exact).abs();

  // Against an exact zero any non-zero difference is a breach: there is no relative
  // measure to take, and calling it "within tolerance" would be the wrong answer.
  const withinTolerance = exact.isZero()
    ? difference.isZero()
    : difference.dividedBy(exact.abs()).lessThanOrEqualTo(CALCULATION_TOLERANCE);

  return { exact, rounded, difference, withinTolerance };
};

/** The whole jurisdiction computation, every intermediate kept at full precision. */
export interface JurisdictionComputation {
  readonly effectiveTaxRate: Computed | null;
  readonly topUpTaxPercentage: Decimal | null;
  readonly excessProfits: Decimal;
  readonly additionalTopUpTax: Decimal;
  readonly topUpTax: Decimal | null;
  readonly tolerance: ToleranceCheck | null;
}
