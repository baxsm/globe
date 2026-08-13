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
  const wanted = new Map<string, number>();

  for (const application of applications) {
    const key = normalizePath(application.xpath);
    const existing = wanted.get(key);
    // The lowest issue number wins where two rules touch one element, so the mark does
    // not depend on the order the applications arrived in.
    if (existing === undefined || application.issueNumber < existing) {
      wanted.set(key, application.issueNumber);
    }
  }

  const path: string[] = [];
  const frames: Frame[] = [{ counts: new Map() }];

  return xml.split("\n").map((text, index) => {
    let issue: number | null = null;

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

      // The first line to name an element wins the mark. A container and its only child
      // on one line is rare in a serialized GIR, and marking the outer one is the honest
      // reading: that is where the correction was addressed.
      issue ??= matchOf(path, wanted);

      if (selfClosing === "/") {
        path.pop();
      } else {
        frames.push({ counts: new Map() });
      }
    }

    return { number: index + 1, text, issue };
  });
};

/**
 * The issue registered against a path, matched segment by segment from the leaf up.
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
const matchOf = (path: readonly string[], wanted: ReadonlyMap<string, number>): number | null => {
  for (const [key, issue] of wanted) {
    if (endsWithChain(path, key.split("/"))) return issue;
  }

  return null;
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
