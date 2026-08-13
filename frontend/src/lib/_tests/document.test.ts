import { describe, expect, it } from "vitest";
import type { GirElement } from "@/lib/document";
import {
  childElements,
  childKey,
  childPath,
  identifyingLabel,
  leafValue,
  localName,
} from "@/lib/document";

const element = (
  name: string,
  children: GirElement["children"] = [],
  paired = false,
): GirElement => ({ kind: "element", name, attributes: [], children, paired });

const text = (value: string) => ({ kind: "text" as const, value });

describe("localName", () => {
  it("drops the namespace prefix", () => {
    expect(localName("globe:JurisdictionSection")).toBe("JurisdictionSection");
  });

  it("leaves an unprefixed name alone", () => {
    expect(localName("Amount")).toBe("Amount");
  });
});

describe("leafValue", () => {
  it("reads the text of a leaf", () => {
    expect(leafValue(element("globe:ETRRate", [text("0.1000")]))).toBe("0.1000");
  });

  it("keeps the value as written rather than as a number", () => {
    // `0.1000` and `0.1` are different filings. Parsing here would erase that.
    expect(leafValue(element("globe:ETRRate", [text("0.1000")]))).not.toBe("0.1");
  });

  it("returns null for a container", () => {
    const container = element("globe:ETR", [element("globe:ETRRate", [text("0.1")])]);
    expect(leafValue(container)).toBeNull();
  });

  it("returns null for whitespace only", () => {
    expect(leafValue(element("globe:Empty", [text("\n\t")]))).toBeNull();
  });
});

describe("childElements", () => {
  it("drops the indentation text nodes", () => {
    const parent = element("globe:MessageSpec", [
      text("\n\t"),
      element("globe:MessageType", [text("GIR")]),
      text("\n\t"),
    ]);

    expect(childElements(parent)).toHaveLength(1);
  });
});

describe("identifyingLabel", () => {
  it("prefers the jurisdiction of a repeated section", () => {
    const section = element("globe:JurisdictionSection", [
      element("globe:Jurisdiction", [text("IE")]),
    ]);

    expect(identifyingLabel(section)).toBe("IE");
  });

  it("returns null when nothing identifies it", () => {
    expect(identifyingLabel(element("globe:Period", []))).toBeNull();
  });
});

describe("childKey", () => {
  it("distinguishes repeated siblings by their identifier", () => {
    const ie = element("globe:JurisdictionSection", [
      element("globe:Jurisdiction", [text("IE")]),
    ]);
    const de = element("globe:JurisdictionSection", [
      element("globe:Jurisdiction", [text("DE")]),
    ]);

    expect(childKey(ie, 0)).not.toBe(childKey(de, 1));
  });

  it("keeps the key stable when a sibling is inserted above", () => {
    const section = element("globe:JurisdictionSection", [
      element("globe:Jurisdiction", [text("IE")]),
    ]);

    // Same element, different position. An index-only key would change here and
    // remount the whole subtree, collapsing everything the reader had opened.
    expect(childKey(section, 0)).toBe(childKey(section, 3));
  });

  it("falls back to the position when nothing identifies the element", () => {
    const anonymous = element("globe:Adjustment", []);
    expect(childKey(anonymous, 2)).toBe("globe:Adjustment#2");
  });
});

describe("childPath", () => {
  it("builds a path from the root down", () => {
    expect(childPath("GLOBE_OECD", element("globe:GLOBEBody"))).toBe("GLOBE_OECD/GLOBEBody");
  });
});
