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
 * The guidance's own casing is inconsistent: it writes `GloBEBody`, `GlobeBody` and
 * `GLOBEBody` for the same element, and `GloBETax` for `GLOBETax`. Matching is therefore
 * case-insensitive, so a path copied out of the PDF still finds its target.
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
    const nextTrail = [...trail, child.name];

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

/** Returns a copy of the tree with children appended to one element. */
export const appendChildrenAt = (
  root: GirElement,
  indices: readonly number[],
  additions: readonly GirNode[],
): GirElement => {
  const located = indices.reduce<GirElement | undefined>((element, index) => {
    const child = element?.children[index];
    return child !== undefined && isElement(child) ? child : undefined;
  }, root);

  if (located === undefined) return root;

  return replaceAt(root, indices, {
    ...located,
    children: [...located.children, ...additions],
  });
};

/** Text of an element in source form, entities left as they were written. */
export const rawText = (element: GirElement): string =>
  element.children.map((child) => (isElement(child) ? "" : child.value)).join("");
