/**
 * The parsed shape of a GIR document.
 *
 * This is an ordered tree rather than a plain object because the XSD defines every
 * complex type with xsd:sequence. A JSON-style object loses sibling order, and a
 * document whose elements are reordered still parses, still diffs clean against the
 * object, and is rejected by the schema. Order is data here.
 */

/** A single element node. Text and children are mutually exclusive in this schema. */
export interface GirElement {
  readonly kind: "element";
  /** Qualified name exactly as written, prefix included: `globe:MessageSpec`. */
  readonly name: string;
  /** Attributes in source order. Namespace declarations are attributes too. */
  readonly attributes: readonly GirAttribute[];
  readonly children: readonly GirNode[];
  /**
   * True when the source wrote `<a></a>` rather than `<a/>`.
   *
   * The two are identical to any parser and are different bytes. A filer who submits
   * one and receives the other back has a document that no longer matches their record
   * of it, which matters when a submission is compared by hash.
   */
  readonly paired: boolean;
}

export interface GirAttribute {
  readonly name: string;
  readonly value: string;
}

/**
 * Character data, held exactly as it appeared in the source, still escaped.
 *
 * Two separate reasons for keeping the raw form:
 *
 * Numbers are never parsed to a JavaScript number on the way through. `0.10` read as a
 * float and written back becomes `0.1`, which still parses and is a different document.
 * Callers that need arithmetic convert to Decimal at the point of use.
 *
 * Entities are neither decoded nor re-encoded. Decoding on read and encoding on write
 * looks symmetrical and is not: a source containing the literal text `&amp;amp;`
 * decodes to `&amp;` and re-encodes to `&amp;amp;` only if the encoder is exactly the
 * inverse of the decoder, and any gap between them silently rewrites a filer's data.
 * Use `decodeText` when the decoded value is what you actually want.
 */
export interface GirText {
  readonly kind: "text";
  /** The source form, escaped. `Smith &amp; Sons` is stored with the entity intact. */
  readonly value: string;
}

export type GirNode = GirElement | GirText;

/** A whole document: the root element, and everything around it. */
export interface GirDocument {
  /** The XML declaration verbatim, or null when the source had none. */
  readonly declaration: string | null;
  readonly root: GirElement;
  /** Whatever followed the closing root tag, usually the final newline. */
  readonly epilogue: string;
}

export const isElement = (node: GirNode): node is GirElement => node.kind === "element";
export const isText = (node: GirNode): node is GirText => node.kind === "text";

const ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
  [/&#(\d+);/g, ""],
];

/**
 * Resolves the escaped source text to the characters it represents.
 *
 * `&amp;` is applied last so that `&amp;lt;`, which means the literal text `&lt;`,
 * does not decode all the way to `<`.
 */
export const decodeText = (value: string): string => {
  let out = value;
  for (const [pattern, replacement] of ENTITIES) {
    out =
      replacement === ""
        ? out.replace(pattern, (_, code: string) => String.fromCodePoint(Number(code)))
        : out.replace(pattern, replacement);
  }
  return out
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");
};

/** The text content of an element, decoded. */
export const textContent = (element: GirElement): string =>
  decodeText(element.children.map((child) => (isText(child) ? child.value : "")).join(""));
