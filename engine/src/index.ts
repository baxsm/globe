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
export type { JurisdictionReading } from "./calc/read-jurisdictions";
export { readJurisdictions } from "./calc/read-jurisdictions";
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
export { diffDocuments } from "./diff/diff";
export type { Change, ChangeKind } from "./diff/types";
export {
  ADT2_DESCRIPTION,
  ADT3_DESCRIPTION,
  applyIssue4,
  applyIssue6,
} from "./errata/additional-data-points";
export { applyIssue1, applyIssue5 } from "./errata/definitional";
export {
  ADT1_DESCRIPTION,
  ARTICLE_712_SUBSTITUTE,
  applyIssue2,
} from "./errata/issue-02-article-712-basis";
export { applyIssue3 } from "./errata/issue-03-utpr-attribution";
export { applyIssue7, SAFE_HARBOUR_ZERO_ELEMENTS } from "./errata/issue-07-safe-harbour-zeros";
export { applyIssue12 } from "./errata/issue-12-utpr-safe-harbour";
export {
  applyIssue13,
  RECAST_DUMMY_ADJUSTMENT_ITEM,
  RECAST_DUMMY_AMOUNT,
} from "./errata/issue-13-recast-dummy";
export { applyIssue14 } from "./errata/issue-14-percentage-clamp";
export { findByPath, findOneByPath, localName } from "./errata/path";
export type { ErrataContext, ErrataResult } from "./errata/registry";
export { applyErrata, defaultContext, KNOWN_ISSUES } from "./errata/registry";
export {
  suppressedValidationRules,
  suppressionRecords,
  suppressionRules,
} from "./errata/suppressions";
export type {
  Application,
  FixKind,
  IssueNumber,
  Rule,
  RuleContext,
  Suppression,
} from "./errata/types";
export { declaredPaths, isDeclaredPath } from "./schema/paths";
export type { XsdValidationError, XsdValidationResult } from "./schema/validate-xsd";
// Shells out to libxml2 through python, so it is a conformance tool rather than a
// request-path check. The API does not call it: a filing must not fail to save because
// an interpreter is missing, and `validateGir` covers what a filer needs to see.
export { validateFileAgainstXsd } from "./schema/validate-xsd";
export { parseGir } from "./serialize/parse";
export { serializeGir } from "./serialize/serialize";
export type { GirAttribute, GirDocument, GirElement, GirNode, GirText } from "./serialize/types";
export { decodeText, isElement, isText, textContent } from "./serialize/types";
export { validationRules } from "./validate/rules";
export type { Finding, Severity, ValidationResult, ValidationRule } from "./validate/types";
export { validateGir } from "./validate/validate";
