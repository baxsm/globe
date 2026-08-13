import Decimal from "decimal.js";
import { PERCENTAGE_FRACTION_DIGITS, PERCENTAGE_MAX, PERCENTAGE_MIN } from "../calc/constants";
import { fractionDigits } from "../calc/etr";
import { findByPath, rawText } from "../errata/path";
import type { GirDocument, GirElement } from "../serialize/types";
import { isElement } from "../serialize/types";
import type { Finding, ValidationRule } from "./types";

/**
 * The validation rules that are still in force.
 *
 * Rules 60025, 60026, 70092 and 70028 are not here. They live in `suppressed.ts` with
 * the reason each was disapplied, so that "not implemented" and "deliberately not run"
 * stay distinguishable.
 *
 * Every rule below is scoped to one rule number and one element path. That scoping is
 * what makes the suppression safe: disapplying 60025 stops one check on `ETRRate` and
 * leaves the type and precision checks on the same element running.
 */

const OVERALL =
  "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/OverallComputation";

const OWNERSHIP_PERCENTAGE =
  "GLOBEBody/GeneralSection/CorporateStructure/CE/Ownership/OwnershipPercentage";

/** A percentage-typed element, its path, and its text as written. */
interface Percentage {
  readonly path: string;
  readonly raw: string;
}

const percentagesAt = (document: GirDocument, path: string): Percentage[] =>
  findByPath(document.root, path).map((located) => ({
    path: located.path,
    raw: rawText(located.element).trim(),
  }));

/**
 * Text that `xsd:decimal` accepts. Exponent notation is not decimal notation, so `1E-7`
 * is rejected here exactly as libxml2 rejects it, rather than being read as a number.
 */
const DECIMAL_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

const percentageFindings = (rule: number, percentage: Percentage, element: string): Finding[] => {
  const findings: Finding[] = [];

  if (!DECIMAL_PATTERN.test(percentage.raw)) {
    return [
      {
        rule,
        severity: "error",
        path: percentage.path,
        message: `${element} must be a decimal number, and "${percentage.raw}" is not one`,
      },
    ];
  }

  const value = new Decimal(percentage.raw);

  if (value.lessThan(PERCENTAGE_MIN) || value.greaterThan(PERCENTAGE_MAX)) {
    findings.push({
      rule,
      severity: "error",
      path: percentage.path,
      message: `${element} must be between 0 and 1, and this document reports ${percentage.raw}`,
    });
  }

  if (fractionDigits(value) > PERCENTAGE_FRACTION_DIGITS) {
    findings.push({
      rule,
      severity: "error",
      path: percentage.path,
      message: `${element} allows at most ${PERCENTAGE_FRACTION_DIGITS} decimal places, and this document reports ${percentage.raw}`,
    });
  }

  return findings;
};

/**
 * `globe:percentage` bounds and precision on the two rates in `OverallComputation`.
 *
 * This is not rule 60025. 60025 checks the rate against a division of two other
 * elements, and it is disapplied. This checks only that the value written is one the
 * type can carry, which stays in force: a document with an ETRRate of 1.4 is rejected by
 * any schema-aware receiver whatever the guidance says about 60025.
 */
const percentageRangeRule = (rule: number, element: string): ValidationRule => ({
  rule,
  name: `percentage-range-${element.toLowerCase()}`,
  check: (document) =>
    percentagesAt(document, `${OVERALL}/${element}`).flatMap((percentage) =>
      percentageFindings(rule, percentage, element),
    ),
});

/**
 * A percentage that rounds away to nothing.
 *
 * Reported as a warning, not an error. The value is inside the type and the receiver
 * will accept it; the problem is that a real holding has become indistinguishable from
 * no holding. Rule 70028 would have made this an error, and 70028 is disapplied, so
 * calling it an error here would reintroduce by the back door exactly what the guidance
 * removed.
 */
const OWNERSHIP_ROUNDS_TO_ZERO: ValidationRule = {
  rule: 70029,
  name: "ownership-rounds-to-zero",
  check: (document) =>
    percentagesAt(document, OWNERSHIP_PERCENTAGE)
      .filter(
        (percentage) =>
          DECIMAL_PATTERN.test(percentage.raw) && new Decimal(percentage.raw).isZero(),
      )
      .map((percentage) => ({
        rule: 70029,
        severity: "warning" as const,
        path: percentage.path,
        message:
          "OwnershipPercentage is 0, which the schema cannot tell apart from a holding too small to express at four decimal places",
        issue: 11 as const,
      })),
};

/** An integer-typed element and the text it carries. */
const INTEGER_ELEMENTS = [
  "FANIL",
  "AdjustedFANIL",
  "IncomeTaxExpense",
  "ExcessProfits",
  "TopUpTax",
] as const;

const INTEGER_PATTERN = /^[+-]?\d+$/;

/**
 * Monetary amounts are `xsd:integer` in this schema, not decimals.
 *
 * Worth checking separately from the XSD because the failure is silent in the other
 * direction: a filer who writes 50000.50 has a rounding decision to make, and a
 * validator that only says "schema invalid" does not tell them which element to look at.
 */
const INTEGER_AMOUNTS: ValidationRule = {
  rule: 60001,
  name: "integer-amounts",
  check: (document) =>
    INTEGER_ELEMENTS.flatMap((element) =>
      findByPath(document.root, `${OVERALL}/${element}`)
        .filter((located) => !INTEGER_PATTERN.test(rawText(located.element).trim()))
        .map((located) => ({
          rule: 60001,
          severity: "error" as const,
          path: located.path,
          message: `${element} must be a whole number, and this document reports "${rawText(located.element).trim()}"`,
        })),
    ),
};

/**
 * Excess profits cannot exceed net GloBE income.
 *
 * ExcessProfits is net GloBE income less the substance-based income exclusion, and that
 * exclusion is never negative, so a larger ExcessProfits means one of the two figures is
 * wrong. This is a warning rather than an error: both values are individually valid and
 * the receiver will accept the document, but the pair cannot both be right.
 */
const EXCESS_PROFITS_EXCEEDS_INCOME: ValidationRule = {
  rule: 60030,
  name: "excess-profits-exceeds-income",
  check: (document) => {
    const findings: Finding[] = [];

    for (const overall of findByPath(document.root, OVERALL)) {
      const excess = childText(overall.element, "ExcessProfits");
      const income = childText(netGlobeIncomeOf(overall.element), "Total");
      if (excess === null || income === null) continue;
      if (!INTEGER_PATTERN.test(excess) || !INTEGER_PATTERN.test(income)) continue;

      if (new Decimal(excess).greaterThan(new Decimal(income))) {
        findings.push({
          rule: 60030,
          severity: "warning",
          path: `${overall.path}/ExcessProfits`,
          message: `ExcessProfits of ${excess} is more than the net GloBE income of ${income}, and the substance-based exclusion can only reduce it`,
        });
      }
    }

    return findings;
  },
};

const childOf = (element: GirElement | null, name: string): GirElement | null => {
  if (element === null) return null;
  const lower = name.toLowerCase();
  for (const child of element.children) {
    if (!isElement(child)) continue;
    const local = child.name.slice(child.name.indexOf(":") + 1);
    if (local.toLowerCase() === lower) return child;
  }
  return null;
};

const netGlobeIncomeOf = (overall: GirElement): GirElement | null =>
  childOf(overall, "NetGlobeIncome");

const childText = (element: GirElement | null, name: string): string | null => {
  const child = childOf(element, name);
  return child === null ? null : rawText(child).trim();
};

export const validationRules: readonly ValidationRule[] = [
  percentageRangeRule(60002, "ETRRate"),
  percentageRangeRule(60003, "TopUpTaxPercentage"),
  INTEGER_AMOUNTS,
  EXCESS_PROFITS_EXCEEDS_INCOME,
  OWNERSHIP_ROUNDS_TO_ZERO,
];
