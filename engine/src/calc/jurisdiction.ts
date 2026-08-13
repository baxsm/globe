import Decimal from "decimal.js";
import { effectiveTaxRate } from "./etr";
import {
  additionalTopUpTax,
  excessProfits,
  type JurisdictionComputation,
  roundingBreachesTolerance,
  topUpTax,
  topUpTaxPercentage,
} from "./top-up-tax";
import type { JurisdictionInput } from "./types";

/**
 * Runs the whole computation for one jurisdiction.
 *
 * Where the effective tax rate is undefined, because net GloBE income is zero, the rate
 * and everything derived from it stay null rather than falling back to a number. The
 * substance exclusion and any additional top-up tax are still computed, since they do
 * not depend on the rate.
 */
export const computeJurisdiction = (input: JurisdictionInput): JurisdictionComputation => {
  const rate = effectiveTaxRate(input.adjustedCoveredTax, input.netGlobeIncome);
  const profits = excessProfits(input.netGlobeIncome, input.substanceExclusion);

  const additional =
    input.expectedAdjustedCoveredTax === undefined
      ? new Decimal(0)
      : additionalTopUpTax(input.expectedAdjustedCoveredTax, input.adjustedCoveredTax);

  if (rate === null) {
    return {
      effectiveTaxRate: null,
      topUpTaxPercentage: null,
      excessProfits: profits,
      additionalTopUpTax: additional,
      topUpTax: null,
      tolerance: null,
    };
  }

  const percentage = topUpTaxPercentage(rate.value);
  const parts = {
    topUpTaxPercentage: percentage,
    excessProfits: profits,
    additionalTopUpTax: additional,
    qdmtt: input.qdmtt,
  };

  return {
    effectiveTaxRate: rate,
    topUpTaxPercentage: percentage,
    excessProfits: profits,
    additionalTopUpTax: additional,
    topUpTax: topUpTax(parts),
    tolerance: roundingBreachesTolerance(parts),
  };
};
