import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { CALCULATION_TOLERANCE, MINIMUM_RATE } from "../constants";
import { clampToPercentage, effectiveTaxRate, fractionDigits } from "../etr";
import { computeJurisdiction } from "../jurisdiction";
import { excessProfits, topUpTax, topUpTaxPercentage } from "../top-up-tax";

describe("effective tax rate", () => {
  it("divides covered tax by net income", () => {
    expect(effectiveTaxRate(new Decimal(150), new Decimal(1000))?.value.toString()).toBe("0.15");
  });

  it("keeps full precision on a recurring quotient", () => {
    // 1/3 is where a float would commit to 0.3333333333333333 and lose the rest.
    const rate = effectiveTaxRate(new Decimal(100), new Decimal(300));

    expect(rate?.value.toFixed(20)).toBe("0.33333333333333333333");
  });
});

describe("zero net GloBE income", () => {
  // A deliberate decision, and the phase spec asks for it to be tested rather than
  // left to whatever division happens to do.
  it("returns null rather than a rate", () => {
    expect(effectiveTaxRate(new Decimal(150), new Decimal(0))).toBeNull();
  });

  it("returns null even when covered tax is also zero", () => {
    expect(effectiveTaxRate(new Decimal(0), new Decimal(0))).toBeNull();
  });

  it("does not report a top-up tax it cannot compute", () => {
    const result = computeJurisdiction({
      adjustedCoveredTax: new Decimal(150),
      netGlobeIncome: new Decimal(0),
      substanceExclusion: new Decimal(0),
      qdmtt: new Decimal(0),
    });

    expect(result.effectiveTaxRate).toBeNull();
    expect(result.topUpTaxPercentage).toBeNull();
    expect(result.topUpTax).toBeNull();
    expect(result.tolerance).toBeNull();
  });

  it("still computes what does not depend on the rate", () => {
    const result = computeJurisdiction({
      adjustedCoveredTax: new Decimal(150),
      netGlobeIncome: new Decimal(0),
      substanceExclusion: new Decimal(40),
      qdmtt: new Decimal(0),
      expectedAdjustedCoveredTax: new Decimal(200),
    });

    expect(result.excessProfits.toString()).toBe("-40");
    expect(result.additionalTopUpTax.toString()).toBe("50");
  });
});

describe("top-up tax percentage", () => {
  it("is the shortfall against the minimum rate", () => {
    expect(topUpTaxPercentage(new Decimal("0.09")).toString()).toBe("0.06");
  });

  it("is zero at exactly the minimum rate", () => {
    expect(topUpTaxPercentage(MINIMUM_RATE).toString()).toBe("0");
  });

  it("goes negative above the minimum rate", () => {
    expect(topUpTaxPercentage(new Decimal("0.25")).toString()).toBe("-0.1");
  });
});

describe("excess profits", () => {
  it("subtracts the substance exclusion", () => {
    expect(excessProfits(new Decimal(1000), new Decimal(300)).toString()).toBe("700");
  });

  it("can be negative when the exclusion exceeds income", () => {
    expect(excessProfits(new Decimal(100), new Decimal(300)).toString()).toBe("-200");
  });
});

describe("top-up tax", () => {
  it("applies the formula rule 60026 checks", () => {
    const result = topUpTax({
      topUpTaxPercentage: new Decimal("0.06"),
      excessProfits: new Decimal(1000),
      additionalTopUpTax: new Decimal(25),
      qdmtt: new Decimal(15),
    });

    expect(result.toString()).toBe("70");
  });

  it("subtracts the QDMTT last", () => {
    const result = topUpTax({
      topUpTaxPercentage: new Decimal("0.05"),
      excessProfits: new Decimal(100),
      additionalTopUpTax: new Decimal(0),
      qdmtt: new Decimal(20),
    });

    expect(result.toString()).toBe("-15");
  });
});

describe("decimal arithmetic rather than floats", () => {
  it("adds without the classic float error", () => {
    expect(new Decimal("0.1").plus("0.2").toString()).toBe("0.3");
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it("computes a rate a float would get wrong", () => {
    // 0.07 * 3 is 0.21000000000000002 in float arithmetic.
    const exact = new Decimal("0.07").times(3);

    expect(exact.toString()).toBe("0.21");
    expect((0.07 * 3).toString()).toBe("0.21000000000000002");
  });

  it("keeps a top-up tax a float would round into the tolerance band", () => {
    const result = topUpTax({
      topUpTaxPercentage: new Decimal("0.0001"),
      excessProfits: new Decimal("1234567.89"),
      additionalTopUpTax: new Decimal(0),
      qdmtt: new Decimal(0),
    });

    expect(result.toString()).toBe("123.456789");
  });
});

describe("fraction digits", () => {
  const cases: ReadonlyArray<readonly [string, number]> = [
    ["1", 0],
    ["0.5", 1],
    ["0.1234", 4],
    ["0.12345", 5],
    ["0.5000", 1],
    ["0.0000", 0],
    ["-0.123", 3],
  ];

  for (const [value, expected] of cases) {
    it(`counts ${value} as ${expected}`, () => {
      expect(fractionDigits(new Decimal(value))).toBe(expected);
    });
  }
});

describe("properties", () => {
  it("clamping is idempotent", () => {
    for (const value of ["1.4", "-0.2", "0.5", "0.12345"]) {
      const once = clampToPercentage(new Decimal(value));

      expect(clampToPercentage(once).toString()).toBe(once.toString());
    }
  });

  it("clamping always lands inside the schema interval", () => {
    for (const value of ["-99", "99", "0.5", "1", "0"]) {
      const clamped = clampToPercentage(new Decimal(value));

      expect(clamped.greaterThanOrEqualTo(0)).toBe(true);
      expect(clamped.lessThanOrEqualTo(1)).toBe(true);
      expect(fractionDigits(clamped)).toBeLessThanOrEqual(4);
    }
  });

  it("states the tolerance as one percent", () => {
    expect(CALCULATION_TOLERANCE.toString()).toBe("0.01");
  });

  it("states the minimum rate as fifteen percent", () => {
    expect(MINIMUM_RATE.toString()).toBe("0.15");
  });
});
