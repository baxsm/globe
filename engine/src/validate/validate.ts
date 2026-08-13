import { suppressedValidationRules, suppressionRecords } from "../errata/suppressions";
import type { GirDocument } from "../serialize/types";
import { validationRules } from "./rules";
import type { Finding, ValidationResult, ValidationRule } from "./types";

/**
 * Runs the validation rule set over a document.
 *
 * The four disapplied rules are reported on every run, including a run with no findings
 * at all. That is the point of the product rather than a detail of it: a filer who sends
 * a GIR that passed validation needs to know that four of the rules their receiver may
 * apply were deliberately not applied here, and which paragraph of the June 2026
 * guidance authorises that.
 */

/**
 * Rules run against the parsed document, which the serializer round-trips to bytes
 * exactly. Validating a projection of the document rather than the document itself would
 * let a run pass while the emitted XML fails, so there is no separate projection to
 * drift out of step.
 */
export const validateGir = (document: GirDocument): ValidationResult => {
  const findings: Finding[] = [];

  for (const rule of activeRules()) {
    findings.push(...rule.check(document));
  }

  return { findings, suppressions: suppressionRecords };
};

/**
 * The rule set minus the four the guidance disapplies.
 *
 * Filtered by number rather than by leaving them out of `validationRules`, so that a
 * rule added later with a disapplied number cannot start running by accident. The list
 * is the authority, not the omission.
 */
const activeRules = (): readonly ValidationRule[] =>
  validationRules.filter((rule) => !suppressedValidationRules.includes(rule.rule));
