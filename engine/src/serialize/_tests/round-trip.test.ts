import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGir } from "../parse";
import { serializeGir } from "../serialize";
import type { GirElement } from "../types";
import { isElement, textContent } from "../types";

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url)), "utf8");

const roundTrip = (xml: string): string => serializeGir(parseGir(xml));

const childElements = (element: GirElement): GirElement[] => element.children.filter(isElement);

const findElement = (element: GirElement, name: string): GirElement | undefined => {
  for (const child of childElements(element)) {
    if (child.name === name) return child;
    const nested = findElement(child, name);
    if (nested !== undefined) return nested;
  }
  return undefined;
};

/** Raw source form, entities intact. */
const rawTextOf = (element: GirElement): string =>
  element.children.map((child) => (child.kind === "text" ? child.value : "")).join("");

/** Decoded form, what the value actually says. */
const textOf = (element: GirElement): string => textContent(element);

describe("round trip", () => {
  const fixtures = ["minimal-gir.xml", "pathological-gir.xml"];

  for (const name of fixtures) {
    it(`reproduces ${name} byte for byte`, () => {
      const source = fixture(name);
      expect(roundTrip(source)).toBe(source);
    });

    it(`is stable on a second pass for ${name}`, () => {
      const once = roundTrip(fixture(name));
      expect(roundTrip(once)).toBe(once);
    });
  }
});

describe("element order", () => {
  it("keeps MessageSpec children in schema sequence", () => {
    const { root } = parseGir(fixture("minimal-gir.xml"));
    const spec = findElement(root, "globe:MessageSpec");

    expect(spec).toBeDefined();
    expect(childElements(spec as GirElement).map((child) => child.name)).toEqual([
      "globe:TransmittingCountry",
      "globe:ReceivingCountry",
      "globe:MessageType",
      "globe:MessageRefId",
      "globe:MessageTypeIndic",
      "globe:ReportingPeriod",
      "globe:Timestamp",
    ]);
  });

  it("writes a reordered document in the new order", () => {
    const document = parseGir(fixture("minimal-gir.xml"));
    const spec = findElement(document.root, "globe:MessageSpec") as GirElement;
    const reversed: GirElement = { ...spec, children: [...spec.children].reverse() };

    const output = serializeGir({ ...document, root: reversed });

    expect(output.indexOf("Timestamp")).toBeLessThan(output.indexOf("TransmittingCountry"));
  });
});

describe("number formatting", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["globe:TrailingZero", "0.10"],
    ["globe:HighPrecision", "0.000000000000000000001"],
    ["globe:BeyondFloat64", "9007199254740993"],
    ["globe:LeadingZero", "007"],
    ["globe:ExplicitPlus", "+1.5"],
    ["globe:NegativeZero", "-0.00"],
    ["globe:Exponential", "1.0E-7"],
    ["globe:BigTrailing", "1234567890123456789012345678901234567890.0000"],
  ];

  const { root } = parseGir(fixture("pathological-gir.xml"));

  for (const [name, expected] of cases) {
    it(`keeps ${expected} exactly`, () => {
      const element = findElement(root, name);
      expect(element).toBeDefined();
      expect(textOf(element as GirElement)).toBe(expected);
    });
  }

  it("does not round trip through a float", () => {
    // 9007199254740993 is Number.MAX_SAFE_INTEGER + 2. Reading it as a float yields
    // 9007199254740992, which still serialises and is a different filing.
    const element = findElement(root, "globe:BeyondFloat64") as GirElement;
    expect(Number(textOf(element)).toString()).not.toBe(textOf(element));
  });
});

describe("text and escaping", () => {
  const { root } = parseGir(fixture("pathological-gir.xml"));

  it("keeps text in source form so it can be written back unchanged", () => {
    expect(rawTextOf(findElement(root, "globe:Ampersand") as GirElement)).toBe("Smith &amp; Sons");
    expect(rawTextOf(findElement(root, "globe:Angles") as GirElement)).toBe("a &lt; b &gt; c");
  });

  it("decodes on request", () => {
    expect(textOf(findElement(root, "globe:Ampersand") as GirElement)).toBe("Smith & Sons");
    expect(textOf(findElement(root, "globe:Angles") as GirElement)).toBe("a < b > c");
  });

  it("does not collapse an entity that was already escaped", () => {
    // The source says `already &amp;amp; escaped`, which means the literal text
    // `already &amp; escaped`. Decoding it twice would silently change a filer's data.
    const element = findElement(root, "globe:PreEscaped") as GirElement;

    expect(rawTextOf(element)).toBe("already &amp;amp; escaped");
    expect(textOf(element)).toBe("already &amp; escaped");
    expect(roundTrip(fixture("pathological-gir.xml"))).toContain("already &amp;amp; escaped");
  });

  it("keeps unicode intact", () => {
    expect(textOf(findElement(root, "globe:Unicode") as GirElement)).toBe(
      "Ährenfeld Ünïcodé 中文 🌍",
    );
  });

  it("keeps significant whitespace inside an element", () => {
    expect(textOf(findElement(root, "globe:Whitespace") as GirElement)).toBe("  padded  ");
  });
});

describe("empty elements", () => {
  const { root } = parseGir(fixture("pathological-gir.xml"));

  it("parses a self closing element with no children", () => {
    expect((findElement(root, "globe:EmptySelfClosing") as GirElement).children).toHaveLength(0);
  });

  it("keeps a paired empty element paired", () => {
    // <a></a> and <a/> mean the same thing to a parser and are different bytes.
    expect(roundTrip(fixture("pathological-gir.xml"))).toContain(
      "<globe:EmptyPaired></globe:EmptyPaired>",
    );
  });
});

describe("namespaces and attributes", () => {
  it("keeps every namespace declaration on the root", () => {
    const { root } = parseGir(fixture("minimal-gir.xml"));
    const names = root.attributes.map((attribute) => attribute.name);

    expect(names).toEqual(["xmlns:globe", "xmlns:iso", "xmlns:stf", "version"]);
  });

  it("keeps the element prefix", () => {
    expect(parseGir(fixture("minimal-gir.xml")).root.name).toBe("globe:GLOBE_OECD");
  });

  it("keeps attribute order", () => {
    const { root } = parseGir(fixture("pathological-gir.xml"));
    const element = findElement(root, "globe:AttrOrder") as GirElement;

    expect(element.attributes.map((attribute) => attribute.name)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("keeps an attribute on a nested element", () => {
    const { root } = parseGir(fixture("minimal-gir.xml"));
    const tin = findElement(root, "globe:TIN") as GirElement;

    expect(tin.attributes).toEqual([{ name: "issuedBy", value: "FR" }]);
  });
});

describe("declaration", () => {
  it("keeps the declaration verbatim", () => {
    expect(parseGir(fixture("minimal-gir.xml")).declaration).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>',
    );
  });

  it("handles a document with no declaration", () => {
    const xml = '<globe:Root xmlns:globe="urn:oecd:ties:globe:v2">x</globe:Root>';
    const document = parseGir(xml);

    expect(document.declaration).toBeNull();
    expect(serializeGir(document)).toBe(xml);
  });
});

describe("malformed input", () => {
  // A declaration and nothing else is caught by the well-formedness check before the
  // root count is reached, so the message names the missing start tag rather than the
  // missing root. Either way the document is refused, which is what matters.
  it("rejects a document with no root element", () => {
    expect(() => parseGir('<?xml version="1.0"?>')).toThrow();
  });

  it("rejects a document with two root elements", () => {
    expect(() => parseGir("<a/><b/>")).toThrow(/expected one root element/);
  });

  // The parser repairs these rather than refusing them, which is worse than either
  // accepting or rejecting: `<a><b>` becomes `<a><b/></a>`, and a filer's malformed
  // document would be stored as a different, well-formed one that round-trips and
  // validates. Nothing downstream could tell it had been rewritten.
  it("rejects an unclosed element rather than silently closing it", () => {
    expect(() => parseGir("<not><closed>")).toThrow(/malformed XML/);
  });

  it("rejects a mismatched closing tag rather than dropping it", () => {
    expect(() => parseGir("<a></b>")).toThrow(/malformed XML/);
  });

  it("rejects an unclosed element inside a valid root", () => {
    expect(() => parseGir("<globe:a xmlns:globe='u'><b></globe:a>")).toThrow(/malformed XML/);
  });

  it("reports the line the malformation was found on", () => {
    expect(() => parseGir("<a>\n<b>\n</a>")).toThrow(/line \d+/);
  });

  it("still accepts a well-formed document with entities and namespaces", () => {
    const xml = '<?xml version="1.0"?>\n<globe:a xmlns:globe="u">Smith &amp; Sons</globe:a>\n';
    expect(serializeGir(parseGir(xml))).toBe(xml);
  });
});
