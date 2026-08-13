import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Every element path the schema declares, derived from the XSD rather than listed here.
 *
 * A rule that targets a path the schema does not declare matches nothing, silently, and
 * looks exactly like a rule whose condition was not met. That failure has already
 * happened once in this project during review, so the paths are checked against the
 * schema instead of being trusted.
 *
 * Reading the XSD as text rather than through a parser keeps this dependency-free and
 * keeps it honest: the same bytes `verify:schema` pins are the bytes parsed here.
 */

const SCHEMA_PATH = fileURLToPath(new URL("./xsd/GLOBEXML_v1.0.xsd", import.meta.url));

interface Declaration {
  readonly name: string;
  /** Named complexType this element resolves to, when it has one. */
  readonly type: string | null;
  readonly children: Declaration[];
}

const localPart = (qualified: string): string => qualified.slice(qualified.indexOf(":") + 1);

/**
 * Builds the declaration tree.
 *
 * Three constructs matter and all three appear in this schema: an element with an inline
 * `complexType`, an element whose `type` names one of the seventeen global complexTypes,
 * and a `complexContent/extension` that inherits another type's children and adds to
 * them. `JurisdictionSection` uses the third, and missing it silently truncates the tree
 * at that point, which is how a wrong path can look verified.
 */
const parse = (xsd: string): { root: Declaration; types: Map<string, Declaration> } => {
  const tokens = xsd.matchAll(
    /<xsd:(element|complexType|extension)\b([^>]*?)(\/?)>|<\/xsd:(element|complexType|extension)>/g,
  );

  const types = new Map<string, Declaration>();
  const root: Declaration = { name: "", type: null, children: [] };
  const stack: Declaration[] = [root];

  for (const token of tokens) {
    const [, open, attributes, selfClosing, close] = token;

    if (close !== undefined) {
      if (open === undefined && stack.length > 1) stack.pop();
      continue;
    }
    if (open === undefined || attributes === undefined) continue;

    const name = /\bname="([^"]+)"/.exec(attributes)?.[1] ?? null;
    const type = /\btype="([^"]+)"/.exec(attributes)?.[1] ?? null;
    const base = /\bbase="([^"]+)"/.exec(attributes)?.[1] ?? null;

    const parent = stack.at(-1);
    if (parent === undefined) continue;

    if (open === "extension") {
      // Recorded as a child with no name so the resolver can splice the base type's
      // children in at this point without inventing a path segment.
      const node: Declaration = { name: "", type: base, children: [] };
      parent.children.push(node);
      if (selfClosing !== "/") stack.push(node);
      continue;
    }

    if (open === "complexType") {
      const node: Declaration = { name: "", type: null, children: [] };
      if (name !== null) types.set(name, node);
      else parent.children.push(node);
      if (selfClosing !== "/") stack.push(node);
      continue;
    }

    const node: Declaration = { name: name ?? "", type, children: [] };
    parent.children.push(node);
    if (selfClosing !== "/") stack.push(node);
  }

  return { root, types };
};

const collect = (
  node: Declaration,
  types: Map<string, Declaration>,
  trail: readonly string[],
  paths: Set<string>,
  depth: number,
): void => {
  if (depth > 40) return;

  for (const child of node.children) {
    if (child.name === "") {
      // An inline complexType, a sequence wrapper, or an extension: no path segment of
      // its own, so its children belong to the element above it.
      const base = child.type === null ? undefined : types.get(localPart(child.type));
      if (base !== undefined) collect(base, types, trail, paths, depth + 1);
      collect(child, types, trail, paths, depth + 1);
      continue;
    }

    const next = [...trail, child.name];
    paths.add(next.join("/"));

    const named = child.type === null ? undefined : types.get(localPart(child.type));
    if (named !== undefined) collect(named, types, next, paths, depth + 1);
    collect(child, types, next, paths, depth + 1);
  }
};

let cached: ReadonlySet<string> | null = null;

/**
 * Paths relative to the root element, matching how the guidance and the rules write
 * them: `GLOBEBody/JurisdictionSection` is read from inside `GLOBE_OECD`.
 */
export const declaredPaths = (): ReadonlySet<string> => {
  if (cached !== null) return cached;

  const { root, types } = parse(readFileSync(SCHEMA_PATH, "utf8"));
  const paths = new Set<string>();
  collect(root, types, [], paths, 0);

  // Drop the root's own segment so callers can write paths the way the guidance does.
  const relative = new Set<string>();
  for (const path of paths) {
    const [head, ...rest] = path.split("/");
    if (head === "GLOBE_OECD" && rest.length > 0) relative.add(rest.join("/"));
  }

  cached = relative;
  return relative;
};

/** Case-insensitive, because the guidance's own casing is inconsistent. */
export const isDeclaredPath = (path: string): boolean => {
  const wanted = path.toLowerCase();
  for (const declared of declaredPaths()) {
    if (declared.toLowerCase() === wanted) return true;
  }
  return false;
};
