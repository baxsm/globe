export {
  CALCULATION_TOLERANCE,
  MINIMUM_RATE,
  PERCENTAGE_FRACTION_DIGITS,
  PERCENTAGE_MAX,
  PERCENTAGE_MIN,
} from "./calc/constants";
export {
  clampToPercentage,
  effectiveTaxRate,
  fractionDigits,
  percentageBreaches,
} from "./calc/etr";
export { computeJurisdiction } from "./calc/jurisdiction";
export type {
  JurisdictionComputation,
  ToleranceCheck,
  TopUpTaxInput,
} from "./calc/top-up-tax";
export {
  additionalTopUpTax,
  excessProfits,
  roundingBreachesTolerance,
  topUpTax,
  topUpTaxPercentage,
} from "./calc/top-up-tax";
export type { Breach, Computed, JurisdictionInput } from "./calc/types";
export { isReportable } from "./calc/types";
export type { XsdValidationError, XsdValidationResult } from "./schema/validate-xsd";
export { validateFileAgainstXsd } from "./schema/validate-xsd";
export { parseGir } from "./serialize/parse";
export { serializeGir } from "./serialize/serialize";
export type { GirAttribute, GirDocument, GirElement, GirNode, GirText } from "./serialize/types";
export { decodeText, isElement, isText, textContent } from "./serialize/types";
