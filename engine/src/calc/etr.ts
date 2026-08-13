import Decimal from "decimal.js";
import { PERCENTAGE_FRACTION_DIGITS, PERCENTAGE_MAX, PERCENTAGE_MIN } from "./constants";
import type { Breach, Computed } from "./types";

/**
 * Effective tax rate for a jurisdiction, and the reason the schema may refuse it.
 *
 * Validation rule 60025 requires:
 *
 *   ETRRate = AdjustedCoveredTax/Total / NetGlobeIncome/Total
 *
 * and the schema constrains ETRRate to [0, 1] with four fraction digits. Both halves of
 * that are routinely violated by a correct filing, which is issue 8 and the reason rule
 * 60025 is disapplied. This function returns the true quotient and records the breach;
 * it never clamps.
 */

/** Fraction digits actually used, ignoring trailing zeros. `0.5000` counts as 1. */
export const fractionDigits = (value: Decimal): number => {
  const [, fraction] = value.toFixed().split(".");
  if (fraction === undefined) return 0;

  const significant = fraction.replace(/0+$/, "");
  return significant.length;
};

export const percentageBreaches = (value: Decimal): Breach[] => {
  const breaches: Breach[] = [];

  if (value.lessThan(PERCENTAGE_MIN)) {
    breaches.push({ kind: "below-minimum", bound: PERCENTAGE_MIN });
  }
  if (value.greaterThan(PERCENTAGE_MAX)) {
    breaches.push({ kind: "above-maximum", bound: PERCENTAGE_MAX });
  }

  const digits = fractionDigits(value);
  if (digits > PERCENTAGE_FRACTION_DIGITS) {
    breaches.push({
      kind: "too-many-fraction-digits",
      allowed: PERCENTAGE_FRACTION_DIGITS,
      actual: digits,
    });
  }

  // Issue 11. A holding too small to survive four decimals becomes the 0% that rule
  // 70028 forbids, so the filing cannot state it at all.
  if (!value.isZero() && value.toDecimalPlaces(PERCENTAGE_FRACTION_DIGITS).isZero()) {
    breaches.push({ kind: "rounds-to-zero" });
  }

  return breaches;
};

/**
 * Zero net GloBE income is a real jurisdiction, not a bad input.
 *
 * A jurisdiction can have no net income and still carry covered tax, and the rule's
 * division is undefined there. Returning zero would assert an ETR of 0 percent, which
 * reads as a low-tax jurisdiction and is a different claim from "no rate exists".
 * Returning Infinity would propagate into top-up tax as a plausible number.
 *
 * So the result is null, and callers have to decide. The one thing this must not do is
 * silently produce a number that looks computed.
 */
export const effectiveTaxRate = (
  adjustedCoveredTax: Decimal,
  netGlobeIncome: Decimal,
): Computed | null => {
  if (netGlobeIncome.isZero()) return null;

  const value = adjustedCoveredTax.dividedBy(netGlobeIncome);
  return { value, breaches: percentageBreaches(value) };
};

/**
 * The rate written into the document once issue 14 is applied.
 *
 * Guidance paragraph 40: a negative percentage is reported as zero, and one above the
 * permitted maximum is reported as that maximum. This is the lossy value. It exists
 * beside the true one, never instead of it.
 */
export const clampToPercentage = (value: Decimal): Decimal => {
  const bounded = Decimal.min(Decimal.max(value, PERCENTAGE_MIN), PERCENTAGE_MAX);
  return bounded.toDecimalPlaces(PERCENTAGE_FRACTION_DIGITS, Decimal.ROUND_HALF_UP);
};
