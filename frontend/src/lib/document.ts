/**
 * The stored document, as the API sends it.
 *
 * These mirror the engine's `GirDocument`, redeclared here rather than imported. The
 * frontend has no path alias to the engine and adding one would pull `decimal.js` and
 * the XSD fixtures into the browser bundle for four interface declarations.
 */
export interface GirAttribute {
  readonly name: string;
  readonly value: string;
}

export interface GirElement {
  readonly kind: "element";
  readonly name: string;
  readonly attributes: readonly GirAttribute[];
  readonly children: readonly GirNode[];
  readonly paired: boolean;
}

export interface GirText {
  readonly kind: "text";
  readonly value: string;
}

export type GirNode = GirElement | GirText;

export interface GirDocument {
  readonly declaration: string | null;
  readonly root: GirElement;
  readonly epilogue: string;
}

export const isElement = (node: GirNode): node is GirElement => node.kind === "element";

/** `globe:JurisdictionSection` reads as `JurisdictionSection`; the prefix is noise on screen. */
export const localName = (name: string): string => {
  const colon = name.indexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
};

/**
 * The text of an element, but only when the element is a leaf.
 *
 * A container's text is the concatenation of every descendant plus the indentation
 * between them, which renders as a wall of run-together numbers. Only an element whose
 * children are all text has a value worth showing.
 */
export const leafValue = (element: GirElement): string | null => {
  if (element.children.length === 0) return null;
  if (element.children.some(isElement)) return null;

  const text = element.children
    .map((child) => (child.kind === "text" ? child.value : ""))
    .join("")
    .trim();

  return text.length === 0 ? null : text;
};

/** The child elements, with the indentation text nodes dropped. */
export const childElements = (element: GirElement): readonly GirElement[] =>
  element.children.filter(isElement);

/**
 * A stable address for a node, matching the paths the errata rules use.
 *
 * The margin aligns an annotation to a node by this path, so it is built here where the
 * tree is walked rather than derived again from the rendered output.
 *
 * The ordinal is what makes the address unique. A GIR repeats `JurisdictionSection`, and
 * without it three jurisdictions share one path: every annotation then matches the first
 * of them and the margin reads as plausible while pointing at the wrong node. The engine
 * writes the same 1-based bracket form, and `normalizePath` is what reconciles the two
 * sides' namespace prefixes.
 */
export const childPath = (parentPath: string, child: GirElement, siblings: readonly GirNode[]) =>
  `${parentPath}/${indexedSegment(siblings, child)}`;

const indexedSegment = (siblings: readonly GirNode[], child: GirElement): string => {
  const name = localName(child.name);
  const matching = siblings.filter((node) => isElement(node) && localName(node.name) === name);

  if (matching.length <= 1) return name;
  return `${name}[${matching.indexOf(child) + 1}]`;
};

/**
 * Every node path in the document, in document order.
 *
 * The margin needs to know which addresses exist so it can report the corrections that
 * match none of them. An augmentation adds an element the filer never wrote, so its
 * address is absent from the stored document and no row can carry it.
 */
export const allPaths = (document: GirDocument): readonly string[] => {
  const paths: string[] = [];

  const walk = (element: GirElement, parentPath: string): void => {
    for (const child of childElements(element)) {
      const path = childPath(parentPath, child, element.children);
      paths.push(path);
      walk(child, path);
    }
  };

  walk(document.root, localName(document.root.name));
  return paths;
};

/**
 * One canonical spelling for a path, so both sides of the match agree.
 *
 * The engine reports the document's own names, `globe:JurisdictionSection[1]`, while the
 * tree renders local names. Casing is unreliable on both sides too: the guidance writes
 * `GloBEBody`, `GlobeBody` and `GLOBEBody` for one element, and the schema declares
 * `GLoBETax` where its own type is `GLOBETax`. Comparing raw strings would silently match
 * nothing and the margin would render empty on a document with corrections in it.
 */
export const normalizePath = (path: string): string =>
  path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => localName(segment).toLowerCase())
    .join("/");

/**
 * How a filer identifies one repeated section from another.
 *
 * A GIR repeats `JurisdictionSection` and `ConstituentEntity`, and "the third one" is
 * not how anybody refers to them. Where a section carries one of these, it is the label.
 */
const IDENTIFYING_CHILDREN = ["Jurisdiction", "ResCountryCode", "Name", "TIN", "DocRefId"];

/**
 * A React key that survives a sibling being inserted above.
 *
 * A GIR repeats `JurisdictionSection` and `ConstituentEntity`, so the element name alone
 * collides. Where a repeated section carries its own identifier that is the stable key;
 * the position is the fallback for the genuinely anonymous case, where nothing in the
 * document distinguishes one sibling from the next.
 */
export const childKey = (child: GirElement, index: number): string => {
  const label = identifyingLabel(child);
  return label === null ? `${child.name}#${index}` : `${child.name}#${label}`;
};

export const identifyingLabel = (element: GirElement): string | null => {
  for (const key of IDENTIFYING_CHILDREN) {
    const match = childElements(element).find((child) => localName(child.name) === key);
    if (match === undefined) continue;

    const value = leafValue(match);
    if (value !== null) return value;
  }

  return null;
};
