import type { GirElement, GirNode } from "../serialize/types";
import { isElement } from "../serialize/types";

/**
 * Addressing elements by their full path.
 *
 * Element names in GLOBEXML_v1.0.xsd are not unique. `Amount` is declared 11 times,
 * `NetGlobeIncome` 7, `AdjustmentItem` 6, `Basis` and `Reductions` 5, `ETRRate` 3. Any
 * rule that finds its target by name will eventually find the wrong one, in a document
 * that still validates. So everything here works on paths.
 *
 * Namespace prefixes are ignored when matching. The guidance writes paths without them,
 * and a document may legitimately bind the same namespace to a different prefix.
 */

/** `globe:MessageSpec` and `MessageSpec` both reduce to `MessageSpec`. */
export const localName = (name: string): string => {
  const colon = name.indexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
};

/**
 * Casing is unreliable on both sides, so matching ignores it.
 *
 * The guidance writes `GloBEBody`, `GlobeBody` and `GLOBEBody` for one element and
 * `GloBETax`, `GlobeTax` and `GLOBETax` for another. The schema is no better: the
 * element is `GLoBETax` while the type it resolves to is `GLOBETax`, so a path written
 * from the type name misses the element it names. Case-insensitive matching means a path
 * copied out of the PDF still finds its target; `schema/paths.ts` is what catches a path
 * that names nothing at all.
 */
const segmentsMatch = (a: string, b: string): boolean =>
  localName(a).toLowerCase() === localName(b).toLowerCase();

export const splitPath = (path: string): string[] =>
  path.split("/").filter((segment) => segment.length > 0);

export interface Located {
  readonly element: GirElement;
  /** Indices from the root, so the element can be replaced without searching again. */
  readonly indices: readonly number[];
  /** Full path using the document's own names, prefixes included. */
  readonly path: string;
}

/**
 * Appends a 1-based ordinal to a segment, but only where the name repeats.
 *
 * Without this every `JurisdictionSection` in a return addresses as the same string, so
 * three jurisdictions produce three applications carrying one path between them. The
 * margin aligns an annotation to a node by this path, and identical paths mean an
 * annotation lands on whichever node matched first. That misalignment reads as plausible
 * rather than broken, which is what makes it worth preventing here rather than papering
 * over downstream.
 *
 * `MessageSpec[1]` would be noise, so a name that occurs once is left bare. The bracket
 * form and the 1-based count are XPath's, matching `diff/diff.ts` so a path means the
 * same thing in the margin, the diff and the stored `xpath` column.
 */
const indexedSegment = (
  siblings: readonly GirNode[],
  child: GirElement,
  position: number,
): string => {
  const lowered = localName(child.name).toLowerCase();

  let total = 0;
  let ordinal = 0;

  siblings.forEach((sibling, index) => {
    if (!isElement(sibling)) return;
    if (localName(sibling.name).toLowerCase() !== lowered) return;
    total += 1;
    if (index === position) ordinal = total;
  });

  return total <= 1 ? child.name : `${child.name}[${ordinal}]`;
};

const walk = (
  element: GirElement,
  wanted: readonly string[],
  depth: number,
  indices: number[],
  trail: string[],
  found: Located[],
): void => {
  const target = wanted[depth];
  if (target === undefined) return;

  element.children.forEach((child: GirNode, index: number) => {
    if (!isElement(child)) return;
    if (!segmentsMatch(child.name, target)) return;

    const nextIndices = [...indices, index];
    const nextTrail = [...trail, indexedSegment(element.children, child, index)];

    if (depth === wanted.length - 1) {
      found.push({ element: child, indices: nextIndices, path: nextTrail.join("/") });
      return;
    }
    walk(child, wanted, depth + 1, nextIndices, nextTrail, found);
  });
};

/**
 * Every element matching a path, relative to the root element.
 *
 * The path excludes the root itself, matching how the guidance writes them: a path of
 * `GLOBEBody/JurisdictionSection` is read from inside `GLOBE_OECD`.
 */
export const findByPath = (root: GirElement, path: string): Located[] => {
  const wanted = splitPath(path);
  if (wanted.length === 0) return [];

  const found: Located[] = [];
  walk(root, wanted, 0, [], [], found);
  return found;
};

/** The first match, or undefined. Used where the schema permits only one. */
export const findOneByPath = (root: GirElement, path: string): Located | undefined =>
  findByPath(root, path)[0];

/**
 * Returns a copy of the tree with one element replaced.
 *
 * The tree is readonly, so a rule cannot mutate a document another rule is reading.
 * Rebuilding the spine costs nothing at these sizes and removes a whole class of
 * order-dependence between rules.
 */
export const replaceAt = (
  root: GirElement,
  indices: readonly number[],
  replacement: GirElement,
): GirElement => {
  const [head, ...rest] = indices;
  if (head === undefined) return replacement;

  const children = [...root.children];
  const child = children[head];
  if (child === undefined || !isElement(child)) return root;

  children[head] = rest.length === 0 ? replacement : replaceAt(child, rest, replacement);
  return { ...root, children };
};

/** The element a set of indices addresses, or undefined where the path does not resolve. */
export const elementAt = (root: GirElement, indices: readonly number[]): GirElement | undefined =>
  indices.reduce<GirElement | undefined>((element, index) => {
    const child = element?.children[index];
    return child !== undefined && isElement(child) ? child : undefined;
  }, root);

/**
 * Returns a copy of the tree with one element removed.
 *
 * The whitespace text node before it goes too, so removing an element does not leave the
 * blank line it used to sit on. The serializer preserves whatever is in the tree, so
 * without this the output gains a stray indent every time a rule drops something.
 */
export const removeAt = (root: GirElement, indices: readonly number[]): GirElement => {
  const [head, ...rest] = indices;
  if (head === undefined) return root;

  const children = [...root.children];
  const child = children[head];
  if (child === undefined || !isElement(child)) return root;

  if (rest.length > 0) {
    children[head] = removeAt(child, rest);
    return { ...root, children };
  }

  const preceding = children[head - 1];
  const from = preceding !== undefined && !isElement(preceding) ? head - 1 : head;
  children.splice(from, head - from + 1);

  return { ...root, children };
};

/** Text of an element in source form, entities left as they were written. */
export const rawText = (element: GirElement): string =>
  element.children.map((child) => (isElement(child) ? "" : child.value)).join("");

/**
 * Returns a copy of the tree with a child inserted before the first `named` sibling.
 *
 * The augmenting rules all add an `AdditionalDataPoint` to a `JurisdictionSection`, which
 * is the last element of `JurisdictionSectionType`. `DocSpec` is appended after it by the
 * extension in `GLOBEBody_Type`, so appending to the end lands the addition after
 * `DocSpec`, out of sequence, and libxml2 rejects the document. A rule whose purpose is to
 * carry data the schema has no room for must not produce a document the schema refuses.
 *
 * Falls back to appending where the anchor is absent, which is the right answer for a
 * parent that has no `DocSpec` to sit before.
 */
export const insertBefore = (
  root: GirElement,
  indices: readonly number[],
  named: string,
  addition: GirNode,
): GirElement => {
  const parent = elementAt(root, indices);
  if (parent === undefined) return root;

  const at = parent.children.findIndex(
    (child) => isElement(child) && localName(child.name).toLowerCase() === named.toLowerCase(),
  );

  const children = [...parent.children];
  if (at === -1) children.push(addition);
  else children.splice(at, 0, addition);

  return replaceAt(root, indices, { ...parent, children });
};
