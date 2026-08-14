import type { ErrataApplication } from "./api";
import { localName, normalizePath } from "./document";

/**
 * One line of the exported GIR, and whether the errata wrote it.
 *
 * The XML view exists to make the abstraction honest. A filer can be told that `GIR2516`
 * was substituted, or they can see it in the bytes that leave the building. Only the
 * second is checkable, and only if the marks are exact.
 */
export interface XmlLine {
  readonly number: number;
  readonly text: string;
  /** The issue that wrote this line, or null where the filer's own value stands. */
  readonly issue: number | null;
  /**
   * Every issue that wrote this line, lowest first.
   *
   * The serializer puts all three `AdditionalDataPoint` augmentations on one 933-character
   * line, so issues 2, 4 and 6 share it. Carrying only the first reported that line as
   * issue 02 alone and left the other two corrections unaccounted for anywhere in the
   * export, which is precisely the silent omission this view exists to prevent.
   */
  readonly issues: readonly number[];
}

/**
 * Every tag on a line, in order: `<a>`, `</a>`, `<a/>`, `<a attr="x">`.
 *
 * The name class includes `:` because a GIR is namespace-prefixed throughout. Omitting it
 * captures `globe` from `<globe:Total>` and every path silently addresses the wrong thing.
 */
const TAGS = /<(\/)?([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?>/g;

interface Frame {
  /** How many of each child name this element has seen, for the ordinal. */
  readonly counts: Map<string, number>;
}

/**
 * Marks the lines the errata is responsible for.
 *
 * **Matching is by full path, not by element name.** A GIR declares `Amount` 11 times and
 * `Total` in half a dozen unrelated branches, so marking every element that shares a name
 * with an application's target claims corrections that never happened. That is worse than
 * no marking at all: this view exists to be checked against, and a mark on the filer's own
 * untouched figure makes it unusable for exactly that.
 *
 * The path is tracked by walking the tags, so each line is addressed the way the engine
 * addresses it, ordinals included. That is what keeps three jurisdictions distinct.
 */
export const markXml = (
  xml: string,
  applications: readonly ErrataApplication[],
): readonly XmlLine[] => {
  // Every issue against a path, not just the lowest. Two rules can address one element,
  // and reporting one of them loses the other.
  const wanted = new Map<string, Set<number>>();

  for (const application of applications) {
    const key = normalizePath(application.xpath);
    const existing = wanted.get(key);
    if (existing === undefined) {
      wanted.set(key, new Set([application.issueNumber]));
    } else {
      existing.add(application.issueNumber);
    }
  }

  const path: string[] = [];
  const frames: Frame[] = [{ counts: new Map() }];

  return xml.split("\n").map((text, index) => {
    const found = new Set<number>();

    for (const tag of text.matchAll(TAGS)) {
      const [, closing, name, , selfClosing] = tag;
      if (name === undefined) continue;

      if (closing === "/") {
        path.pop();
        frames.pop();
        continue;
      }

      const parent = frames.at(-1);
      if (parent === undefined) continue;

      // Prefixes are dropped here so both sides of the comparison read the same way; the
      // engine's own keys are normalized when they go into `wanted`.
      const local = localName(name);
      const seen = (parent.counts.get(local) ?? 0) + 1;
      parent.counts.set(local, seen);

      path.push(`${local}[${seen}]`);

      // Every element named on this line contributes its issues, not only the first.
      // The three augmentations are serialized onto one line, so stopping at the first
      // match reported that line as issue 02 and dropped issues 04 and 06 entirely.
      for (const number of matchOf(path, wanted)) found.add(number);

      if (selfClosing === "/") {
        path.pop();
      } else {
        frames.push({ counts: new Map() });
      }
    }

    const issues = [...found].sort((a, b) => a - b);
    return { number: index + 1, text, issue: issues[0] ?? null, issues };
  });
};

/**
 * The issues registered against a path, matched segment by segment from the leaf up.
 *
 * Two things have to be reconciled. The engine addresses from inside the root element
 * while this walk starts at it, so the sides agree on a trailing chain rather than on the
 * whole string. And the engine writes an ordinal only where a name repeats among its
 * siblings, while this walk always knows one, so a single path can be spelled several
 * ways: `JurisdictionSection[2]/GLoBETax[1]/Total[1]` and `JurisdictionSection[2]/GLoBETax/Total`
 * are the same address.
 *
 * Rather than enumerate those spellings, each key is compared segment by segment with the
 * ordinal treated as optional on the key's side. A key segment carrying an ordinal must
 * match it exactly, which is what keeps two repeats of a section apart.
 */
const matchOf = (
  path: readonly string[],
  wanted: ReadonlyMap<string, ReadonlySet<number>>,
): readonly number[] => {
  // Every key that resolves to this element, not the first. One address is spelled
  // several ways across the rules that target it: issue 2's augmentation arrives as
  // `GLOBEBody/JurisdictionSection/AdditionalDataPoint` while issues 4 and 6 arrive
  // prefixed and with an ordinal. Returning on the first match reported whichever key
  // happened to be inserted first and dropped the rest.
  const found: number[] = [];

  for (const [key, issues] of wanted) {
    if (endsWithChain(path, key.split("/"))) found.push(...issues);
  }

  return found;
};

const endsWithChain = (path: readonly string[], key: readonly string[]): boolean => {
  if (key.length === 0 || key.length > path.length) return false;

  const offset = path.length - key.length;

  return key.every((segment, index) => {
    const actual = path[offset + index];
    if (actual === undefined) return false;

    const [, name = "", ordinal] = /^(.*?)(?:\[(\d+)\])?$/.exec(segment) ?? [];
    const [, actualName = "", actualOrdinal] = /^(.*?)(?:\[(\d+)\])?$/.exec(actual) ?? [];

    if (name.toLowerCase() !== actualName.toLowerCase()) return false;
    // No ordinal on the key means the engine saw one of a kind, so any position matches.
    return ordinal === undefined || ordinal === actualOrdinal;
  });
};
