import type { GirDocument, GirElement, GirNode } from "./types";

/**
 * Writes the tree back to XML.
 *
 * Two deliberate choices, both about not touching what was read:
 *
 * Text is written exactly as it was parsed. It is still in source form, entities and
 * all, so escaping here would escape it a second time and turn `&amp;` into `&amp;amp;`.
 *
 * Whitespace between elements arrived as text nodes, so there is no pretty printing.
 * Re-indenting would insert newlines on top of the preserved ones and change the bytes
 * of a document nobody edited.
 */

/** Attribute values are the one place this writer escapes, since quotes must not close the value early. */
const escapeAttribute = (value: string): string =>
  value
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");

const writeNode = (node: GirNode): string => {
  if (node.kind === "text") return node.value;

  const attributes = node.attributes
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join("");

  if (node.children.length === 0 && !node.paired) {
    return `<${node.name}${attributes}/>`;
  }

  const inner = node.children.map(writeNode).join("");
  return `<${node.name}${attributes}>${inner}</${node.name}>`;
};

export const serializeGir = (document: GirDocument): string => {
  const body = writeNode(document.root as GirElement);
  const head = document.declaration === null ? "" : `${document.declaration}\n`;

  return `${head}${body}${document.epilogue}`;
};
