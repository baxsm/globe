import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { PERCENTAGE_FRACTION_DIGITS } from "../constants";
import { clampToPercentage, effectiveTaxRate, percentageBreaches } from "../etr";
import { computeJurisdiction } from "../jurisdiction";
import { additionalTopUpTax, roundingBreachesTolerance } from "../top-up-tax";
import type { Computed } from "../types";
import { isReportable } from "../types";

/** Fails loudly rather than letting a null reach an assertion as a cast. */
const defined = (computed: Computed | null): Computed => {
  expect(computed, "expected a rate, got null").not.toBeNull();
  return computed as Computed;
};

/**
 * The four cases the errata exists for.
 *
 * Each asserts the same thing in a different shape: the calculation reports the true
 * value, and the schema cannot carry it. A test here that passed by clamping would be
 * testing the opposite of what the product claims.
 */

describe("issue 8, an ETR outside the interval the schema permits", () => {
  it("computes a rate above 1 rather than clamping it", () => {
    // Covered tax exceeding net income is not exotic. A prior-year adjustment or a
    // one-off settlement lands here.
    const rate = defined(effectiveTaxRate(new Decimal(140), new Decimal(100)));

    expect(rate.value.toString()).toBe("1.4");
    expect(isReportable(rate)).toBe(false);
    expect(rate.breaches).toContainEqual({ kind: "above-maximum", bound: new Decimal(1) });
  });

  it("computes a negative rate rather than flooring it", () => {
    const rate = defined(effectiveTaxRate(new Decimal(-20), new Decimal(100)));

    expect(rate.value.toString()).toBe("-0.2");
    expect(rate.breaches).toContainEqual({ kind: "below-minimum", bound: new Decimal(0) });
  });

  it("accepts a rate inside the interval", () => {
    const rate = defined(effectiveTaxRate(new Decimal(15), new Decimal(100)));

    expect(rate.value.toString()).toBe("0.15");
    expect(isReportable(rate)).toBe(true);
  });

  it("clamps only when asked, and reports the true value beside it", () => {
    const rate = defined(effectiveTaxRate(new Decimal(140), new Decimal(100)));

    expect(clampToPercentage(rate.value).toString()).toBe("1");
    expect(rate.value.toString()).toBe("1.4");
  });
});

describe("issue 9, four decimal rounding breaching the 1 percent tolerance", () => {
  it("breaches tolerance when the percentage is very small", () => {
    // 0.00004 rounds to 0.0000 at four decimals, so the entire first term vanishes.
    const check = roundingBreachesTolerance({
      topUpTaxPercentage: new Decimal("0.00004"),
      excessProfits: new Decimal(1_000_000_000),
      additionalTopUpTax: new Decimal(0),
      qdmtt: new Decimal(0),
    });

    expect(check.exact.toString()).toBe("40000");
    expect(check.rounded.toString()).toBe("0");
    expect(check.withinTolerance).toBe(false);
  });

  it("stays within tolerance for an ordinary percentage", () => {
    const check = roundingBreachesTolerance({
      topUpTaxPercentage: new Decimal("0.0512"),
      excessProfits: new Decimal(1_000_000),
      additionalTopUpTax: new Decimal(0),
      qdmtt: new Decimal(0),
    });

    expect(check.withinTolerance).toBe(true);
    expect(check.difference.toString()).toBe("0");
  });

  it("measures the tolerance relative to the amount, not in absolute units", () => {
    const percentage = new Decimal("0.123456");
    const small = roundingBreachesTolerance({
      topUpTaxPercentage: percentage,
      excessProfits: new Decimal(100),
      additionalTopUpTax: new Decimal(0),
      qdmtt: new Decimal(0),
    });
    const large = roundingBreachesTolerance({
      topUpTaxPercentage: percentage,
      excessProfits: new Decimal(100_000_000),
      additionalTopUpTax: new Decimal(0),
      qdmtt: new Decimal(0),
    });

    // The same rounding error, scaled with the amount, stays the same proportion.
    expect(small.withinTolerance).toBe(true);
    expect(large.withinTolerance).toBe(true);
    expect(small.difference.dividedBy(small.exact).toFixed(8)).toBe(
      large.difference.dividedBy(large.exact).toFixed(8),
    );
  });

  it("treats any difference against an exact zero as a breach", () => {
    const check = roundingBreachesTolerance({
      topUpTaxPercentage: new Decimal("0.00004"),
      excessProfits: new Decimal(1_000_000),
      additionalTopUpTax: new Decimal(0),
      qdmtt: new Decimal(40),
    });

    expect(check.exact.toString()).toBe("0");
    expect(check.withinTolerance).toBe(false);
  });
});

describe("issue 10, the Article 4.1.5 negative tax expense election", () => {
  it("floors at zero after the subtraction, not before", () => {
    expect(additionalTopUpTax(new Decimal(80), new Decimal(100)).toString()).toBe("0");
  });

  it("keeps a genuine shortfall", () => {
    expect(additionalTopUpTax(new Decimal(100), new Decimal(80)).toString()).toBe("20");
  });

  it("produces no top-up tax where the election applies", () => {
    // Covered tax already exceeds what was expected, so nothing is added and the rule
    // still fires. That is why 70092 is disapplied.
    const result = computeJurisdiction({
      adjustedCoveredTax: new Decimal(150),
      netGlobeIncome: new Decimal(1000),
      substanceExclusion: new Decimal(0),
      qdmtt: new Decimal(0),
      expectedAdjustedCoveredTax: new Decimal(120),
    });

    expect(result.additionalTopUpTax.toString()).toBe("0");
    expect(result.topUpTax?.toString()).toBe("0");
  });
});

describe("issue 11, an ownership percentage that rounds to zero", () => {
  it("flags 0.001 percent as unreportable twice over", () => {
    // 0.001 percent is 0.00001 as a fraction: five fraction digits, and it rounds to
    // the zero rule 70028 forbids.
    const breaches = percentageBreaches(new Decimal("0.00001"));

    expect(breaches).toContainEqual({
      kind: "too-many-fraction-digits",
      allowed: PERCENTAGE_FRACTION_DIGITS,
      actual: 5,
    });
    expect(breaches).toContainEqual({ kind: "rounds-to-zero" });
  });

  it("does not flag a genuine zero as rounding to zero", () => {
    // A holding of exactly nothing is a different statement from one too small to say.
    expect(percentageBreaches(new Decimal(0))).toEqual([]);
  });

  it("accepts the smallest holding the schema can express", () => {
    expect(percentageBreaches(new Decimal("0.0001"))).toEqual([]);
  });
});
