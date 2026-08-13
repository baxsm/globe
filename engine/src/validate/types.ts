import type { IssueNumber, Suppression } from "../errata/types";
import type { GirDocument } from "../serialize/types";

/**
 * What a validation run produces.
 *
 * A run has two outputs and both are load-bearing. `findings` is what the document got
 * wrong. `suppressions` is what was deliberately not checked, and why. A validator that
 * returned only the first would be indistinguishable from one that silently lost four
 * rules, which is the failure the June 2026 guidance exists to prevent.
 */

/**
 * How much a finding matters.
 *
 * Three levels, not five, because the only decision a filer actually makes is whether to
 * send the document. `error` means it will be rejected, `warning` means it will be
 * accepted and is probably wrong, `info` means it is worth knowing and nothing more.
 * Splitting further invites inflation, and a validator where everything is an error is a
 * validator nobody reads.
 */
export type Severity = "error" | "warning" | "info";

export interface Finding {
  /** Rule number from the GIR validation rule set, for example 60025. */
  readonly rule: number;
  readonly severity: Severity;
  /**
   * Full path from the root to the element at fault.
   *
   * Never an element name on its own. `Amount` is declared 11 times and `ETRRate` 3, so
   * a bare name cannot be rendered in the margin against the right element, which is the
   * only thing a finding is for.
   */
  readonly path: string;
  /** One line, plain language, addressed to the filer rather than to a developer. */
  readonly message: string;
  /** Set when the guidance documents this rule's defect. */
  readonly issue?: IssueNumber;
}

export interface ValidationResult {
  readonly findings: readonly Finding[];
  /** Always the four disapplied rules. An empty array here is a bug, and a test says so. */
  readonly suppressions: readonly Suppression[];
}

/**
 * One validation rule.
 *
 * Rules read the parsed document and return findings. They never modify it: correcting a
 * filing is the errata layer's job and mixing the two would mean a validation run could
 * silently change what it was asked to check.
 */
export interface ValidationRule {
  readonly rule: number;
  /** Short identifier, kebab-case, for logs and test names. */
  readonly name: string;
  readonly check: (document: GirDocument) => readonly Finding[];
}
