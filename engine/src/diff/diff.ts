import { localName, rawText } from "../errata/path";
import type { GirDocument, GirElement } from "../serialize/types";
import { isElement } from "../serialize/types";
import type { Change, ChangeKind } from "./types";

/**
 * Compares two versions of a return, element by element.
 *
 * Two decisions shape everything here.
 *
 * **Siblings are matched by identity, not by position.** A GIR carries repeated
 * `JurisdictionSection` and `ConstEntity` elements. Comparing the third of one document
 * against the third of the other means inserting a jurisdiction at the front reports every
 * later jurisdiction as rewritten, which buries the one real change under dozens of false
 * ones. Where a repeated element carries an identifying child the pairing uses it, so a
 * jurisdiction compares against the same jurisdiction wherever it moved to.
 *
 * **Only leaves report a value.** A container's text is the concatenation of everything
 * beneath it, so reporting it would restate every leaf change again at each ancestor. A
 * container appears in the output only when it was added or removed outright.
 */

/**
 * Children that identify a repeated element.
 *
 * `Jurisdiction` names the jurisdiction a section reports on, `DocRefId` is the schema's
 * own unique reference for a correctable block, and `TIN` identifies an entity. Order
 * matters: the first one present wins, so the most specific identifier is listed first.
 */
const IDENTITY_CHILDREN: readonly string[] = ["DocRefId", "TIN", "Jurisdiction", "ResCountryCode"];

/**
 * A stable key for one element among its siblings.
 *
 * Falls back to the name alone when nothing identifies it. Siblings sharing a key are
 * then paired in document order, which is the best available answer for a list of
 * unlabelled repeats and is why `Total` inside two different parents never collides: keys
 * are only ever compared within one parent.
 */
const identityOf = (element: GirElement): string => {
  const name = localName(element.name).toLowerCase();

  for (const wanted of IDENTITY_CHILDREN) {
    const match = element.children.find(
      (child) => isElement(child) && localName(child.name).toLowerCase() === wanted.toLowerCase(),
    );
    if (match !== undefined && isElement(match)) {
      const value = rawText(match).trim();
      if (value.length > 0) return `${name}#${value}`;
    }
  }

  return name;
};

/** True when the element holds character data rather than child elements. */
const isLeaf = (element: GirElement): boolean => !element.children.some(isElement);

const childElements = (element: GirElement): readonly GirElement[] =>
  element.children.filter(isElement);

/**
 * Appends an index to a path segment only where the name repeats.
 *
 * `JurisdictionSection[2]` is necessary and `MessageSpec[1]` is noise, so the index is
 * written only when a sibling shares the name. Indices are 1-based to match XPath, which
 * is what the margin renders and what a filer would paste into another tool.
 */
const segmentFor = (
  element: GirElement,
  siblings: readonly GirElement[],
  position: number,
): string => {
  const name = localName(element.name);
  const lowered = name.toLowerCase();

  let total = 0;
  let ordinal = 0;
  siblings.forEach((sibling, index) => {
    if (localName(sibling.name).toLowerCase() !== lowered) return;
    total += 1;
    if (index === position) ordinal = total;
  });

  return total <= 1 ? name : `${name}[${ordinal}]`;
};

const join = (parent: string, segment: string): string =>
  parent.length === 0 ? segment : `${parent}/${segment}`;

/** Reports an element and everything beneath it as wholly added or wholly removed. */
const collect = (
  element: GirElement,
  siblings: readonly GirElement[],
  position: number,
  parentPath: string,
  kind: Exclude<ChangeKind, "changed">,
  changes: Change[],
): void => {
  const path = join(parentPath, segmentFor(element, siblings, position));

  if (isLeaf(element)) {
    const value = rawText(element);
    changes.push({
      xpath: path,
      kind,
      before: kind === "removed" ? value : null,
      after: kind === "added" ? value : null,
    });
    return;
  }

  // A container that appeared or vanished is one change, not one per descendant. The
  // descendants moved with it and reporting each separately would say the filer made
  // forty edits when they added one jurisdiction.
  changes.push({ xpath: path, kind, before: null, after: null });
};

/**
 * Pairs the children of two elements by identity, then walks each pair.
 *
 * Unpaired children on the left are removals, unpaired on the right are additions.
 */
const compareChildren = (
  before: GirElement,
  after: GirElement,
  parentPath: string,
  changes: Change[],
): void => {
  const left = childElements(before);
  const right = childElements(after);

  // Keys repeat when siblings are genuinely indistinguishable, so each side keeps a
  // queue per key and pairs them in order.
  const rightByKey = new Map<string, number[]>();
  right.forEach((element, index) => {
    const key = identityOf(element);
    const queue = rightByKey.get(key);
    if (queue === undefined) rightByKey.set(key, [index]);
    else queue.push(index);
  });

  const matchedRight = new Set<number>();

  left.forEach((element, index) => {
    const queue = rightByKey.get(identityOf(element));
    const partner = queue?.shift();

    if (partner === undefined) {
      collect(element, left, index, parentPath, "removed", changes);
      return;
    }

    matchedRight.add(partner);
    const counterpart = right[partner];
    if (counterpart === undefined) return;

    compareElement(element, counterpart, left, index, parentPath, changes);
  });

  right.forEach((element, index) => {
    if (matchedRight.has(index)) return;
    collect(element, right, index, parentPath, "added", changes);
  });
};

const compareElement = (
  before: GirElement,
  after: GirElement,
  siblings: readonly GirElement[],
  position: number,
  parentPath: string,
  changes: Change[],
): void => {
  const path = join(parentPath, segmentFor(before, siblings, position));

  const beforeLeaf = isLeaf(before);
  const afterLeaf = isLeaf(after);

  if (beforeLeaf && afterLeaf) {
    const from = rawText(before);
    const to = rawText(after);
    if (from !== to) changes.push({ xpath: path, kind: "changed", before: from, after: to });
    return;
  }

  // A leaf that grew children, or a container emptied to text. Reported as one change on
  // the element itself: the shape changed, and describing it as a value edit would claim
  // a text change that did not happen.
  if (beforeLeaf !== afterLeaf) {
    changes.push({
      xpath: path,
      kind: "changed",
      before: beforeLeaf ? rawText(before) : null,
      after: afterLeaf ? rawText(after) : null,
    });
    return;
  }

  compareChildren(before, after, path, changes);
};

/**
 * Every difference between two documents, in document order.
 *
 * Attributes are compared for the root only, where the namespace bindings and the schema
 * version live. Element attributes elsewhere in a GIR are `issuedBy` on a TIN and
 * `currCode` on an amount; they are carried, and a change to one shows up as a change to
 * the element that holds it rather than as a separate entry, because the margin annotates
 * elements and has nowhere to put an attribute-only row.
 */
export const diffDocuments = (before: GirDocument, after: GirDocument): readonly Change[] => {
  const changes: Change[] = [];
  compareChildren(before.root, after.root, "", changes);
  return changes;
};
