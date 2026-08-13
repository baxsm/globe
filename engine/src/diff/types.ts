/**
 * A structural comparison of two versions of the same return.
 *
 * The unit of comparison is the element, addressed by an indexed path. A textual diff of
 * the serialized bytes would report a reindented document as a thousand changes and a
 * moved jurisdiction as two unrelated ones, neither of which is a change a filer made.
 */

/** What happened to one element between the two versions. */
export type ChangeKind = "added" | "removed" | "changed";

export interface Change {
  /**
   * Indexed path from the root, `GLOBEBody/JurisdictionSection[2]/RecJurCode`.
   *
   * The index is present only where a name repeats among its siblings, so the common
   * case reads as a plain path. Without it every path under the second jurisdiction of a
   * return would be indistinguishable from the first.
   */
  readonly xpath: string;
  readonly kind: ChangeKind;
  /** Text content before, in source form. Null when the element was added. */
  readonly before: string | null;
  /** Text content after, in source form. Null when the element was removed. */
  readonly after: string | null;
}
