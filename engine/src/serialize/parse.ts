import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { GirAttribute, GirDocument, GirElement, GirNode } from "./types";

const ATTRIBUTE_PREFIX = "@_";
const ATTRIBUTE_KEY = ":@";
const TEXT_KEY = "#text";
const DECLARATION_KEY = "?xml";

/**
 * Parser options that make a round trip possible.
 *
 * Each of these is load-bearing. Turning any of them off produces a document that
 * still parses and is no longer the same document:
 *
 * - preserveOrder   sibling order is schema-significant under xsd:sequence
 * - parseTagValue   off, so `0.10` stays "0.10" and never becomes the number 0.1
 * - parseAttributeValue  same reason, for attributes such as currCode
 * - trimValues      off, so indentation is preserved rather than reconstructed
 * - ignoreAttributes off, so xmlns declarations survive
 * - processEntities off, so text is carried through in its source form. Decoding here
 *   and re-encoding on write is only lossless if the two are exact inverses, and they
 *   are not: `&amp;amp;` decodes to `&amp;` and comes back as `&amp;`, quietly turning
 *   one filer's escaped ampersand into a different string. Use textContent() to read a
 *   decoded value.
 */
const PARSER_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: ATTRIBUTE_PREFIX,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
  htmlEntities: false,
} as const;

type RawNode = Record<string, unknown>;

const readAttributes = (node: RawNode): GirAttribute[] => {
  const raw = node[ATTRIBUTE_KEY];
  if (raw === undefined || raw === null || typeof raw !== "object") return [];

  return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
    name: key.startsWith(ATTRIBUTE_PREFIX) ? key.slice(ATTRIBUTE_PREFIX.length) : key,
    value: String(value),
  }));
};

/** The tag name of a raw node is its only key that is not `:@`. */
const readTagName = (node: RawNode): string | null => {
  for (const key of Object.keys(node)) {
    if (key !== ATTRIBUTE_KEY) return key;
  }
  return null;
};

/**
 * Names written as `<a></a>` rather than `<a/>`.
 *
 * fast-xml-parser reports both as an element with no children, so the distinction is
 * recovered from the source text. Scoped by name, which is enough for the round trip
 * to hold as long as a document does not mix both spellings for the same element; that
 * case degrades to the self-closing form rather than to corruption.
 */
const pairedEmptyNames = (xml: string): ReadonlySet<string> => {
  const names = new Set<string>();
  const pattern = /<([^\s/>!?]+)(\s[^>]*?)?>\s*<\/\1\s*>/g;

  for (const match of xml.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined) names.add(name);
  }
  return names;
};

const toNodes = (raw: readonly RawNode[], paired: ReadonlySet<string>): GirNode[] => {
  const nodes: GirNode[] = [];

  for (const entry of raw) {
    const name = readTagName(entry);
    if (name === null) continue;

    if (name === TEXT_KEY) {
      nodes.push({ kind: "text", value: String(entry[TEXT_KEY]) });
      continue;
    }

    const children = entry[name];
    const parsedChildren = Array.isArray(children) ? toNodes(children as RawNode[], paired) : [];

    nodes.push({
      kind: "element",
      name,
      attributes: readAttributes(entry),
      children: parsedChildren,
      paired: parsedChildren.length === 0 && paired.has(name),
    });
  }

  return nodes;
};

/**
 * The XML declaration is copied from the source text rather than rebuilt from the
 * parsed attributes. Rebuilding it normalises quote style and attribute spacing, which
 * changes the bytes of a document whose content is unchanged.
 */
const readDeclaration = (xml: string): string | null => {
  const match = /^﻿?\s*<\?xml[^?]*\?>/.exec(xml);
  return match ? match[0].trimStart() : null;
};

/** Whatever follows the closing root tag. Usually the final newline. */
const readEpilogue = (xml: string, rootName: string): string => {
  const close = xml.lastIndexOf(`</${rootName}>`);
  if (close !== -1) return xml.slice(close + rootName.length + 3);

  const selfClosing = /\/>\s*$/.exec(xml);
  return selfClosing ? xml.slice(selfClosing.index + 2) : "";
};

/**
 * Rejects malformed XML before parsing it.
 *
 * `XMLParser` silently repairs rather than refuses: `<a><b>` comes back as
 * `<a><b/></a>` and `<a></b>` comes back as `<a/>`, both of which parse, round-trip
 * and validate. A filer who submitted an unclosed document would have it stored as a
 * different, well-formed one, and nothing downstream could tell. The validator is the
 * only thing that distinguishes a document from a repair of it.
 */
const assertWellFormed = (xml: string): void => {
  const result = XMLValidator.validate(xml);
  if (result === true) return;

  const detail = result.err.msg;
  const line = result.err.line;
  throw new Error(`malformed XML at line ${line}: ${detail}`);
};

export const parseGir = (xml: string): GirDocument => {
  assertWellFormed(xml);

  const parsed = new XMLParser(PARSER_OPTIONS).parse(xml) as RawNode[];

  const roots = toNodes(parsed, pairedEmptyNames(xml)).filter(
    (node): node is GirElement => node.kind === "element" && node.name !== DECLARATION_KEY,
  );

  const root = roots[0];
  if (root === undefined) {
    throw new Error("no root element found in document");
  }
  if (roots.length > 1) {
    throw new Error(`expected one root element, found ${roots.length}`);
  }

  return { declaration: readDeclaration(xml), root, epilogue: readEpilogue(xml, root.name) };
};
