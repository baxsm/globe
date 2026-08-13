import { describe, expect, it } from "vitest";
import { parseGir } from "../../serialize/parse";
import { serializeGir } from "../../serialize/serialize";
import { isElement } from "../../serialize/types";
import {
  findByPath,
  findOneByPath,
  insertBefore,
  localName,
  rawText,
  removeAt,
  replaceAt,
} from "../path";

const document = parseGir(`<?xml version="1.0" encoding="UTF-8"?>
<globe:GLOBE_OECD xmlns:globe="urn:oecd:ties:globe:v2">
	<globe:GLOBEBody>
		<globe:JurisdictionSection>
			<globe:AdditionalDataPoint>
				<globe:Amount>100</globe:Amount>
			</globe:AdditionalDataPoint>
			<globe:GLOBETax>
				<globe:Amount>200</globe:Amount>
			</globe:GLOBETax>
		</globe:JurisdictionSection>
		<globe:JurisdictionSection>
			<globe:GLOBETax>
				<globe:Amount>300</globe:Amount>
			</globe:GLOBETax>
		</globe:JurisdictionSection>
	</globe:GLOBEBody>
</globe:GLOBE_OECD>`);

describe("localName", () => {
  it("strips a prefix", () => {
    expect(localName("globe:MessageSpec")).toBe("MessageSpec");
  });

  it("leaves an unprefixed name alone", () => {
    expect(localName("MessageSpec")).toBe("MessageSpec");
  });
});

describe("findByPath", () => {
  it("distinguishes two elements with the same name by their path", () => {
    // The trap this module exists for: `Amount` is declared 11 times in the schema.
    const dataPoint = findByPath(
      document.root,
      "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Amount",
    );
    const tax = findByPath(document.root, "GLOBEBody/JurisdictionSection/GLOBETax/Amount");

    expect(dataPoint.map((match) => rawText(match.element))).toEqual(["100"]);
    expect(tax.map((match) => rawText(match.element))).toEqual(["200", "300"]);
  });

  it("finds every repeat of a repeated section", () => {
    expect(findByPath(document.root, "GLOBEBody/JurisdictionSection")).toHaveLength(2);
  });

  it("matches the casing the guidance uses, not only the schema's", () => {
    // The guidance writes GloBEBody and GloBETax; the schema declares GLOBEBody and
    // GLOBETax. A path copied out of the PDF has to still resolve.
    expect(findByPath(document.root, "GloBEBody/JurisdictionSection/GloBETax/Amount")).toHaveLength(
      2,
    );
  });

  it("ignores namespace prefixes in the query", () => {
    expect(findByPath(document.root, "globe:GLOBEBody/globe:JurisdictionSection")).toHaveLength(2);
  });

  it("returns nothing for a path that does not exist", () => {
    expect(findByPath(document.root, "GLOBEBody/NotAThing")).toEqual([]);
  });

  it("does not match a partial path from the wrong depth", () => {
    // `Amount` exists, but not as a direct child of JurisdictionSection.
    expect(findByPath(document.root, "GLOBEBody/JurisdictionSection/Amount")).toEqual([]);
  });

  it("reports the document's own names in the located path", () => {
    const match = findOneByPath(document.root, "GLOBEBody/JurisdictionSection/GLOBETax/Amount");

    expect(match?.path).toBe(
      "globe:GLOBEBody/globe:JurisdictionSection[1]/globe:GLOBETax/globe:Amount",
    );
  });

  it("gives each repeat of a section a distinct path", () => {
    // Without the ordinal every JurisdictionSection addresses as one string, so the
    // margin cannot tell which node an annotation belongs to and lands it on whichever
    // matched first. That misalignment looks plausible rather than broken.
    const found = findByPath(document.root, "GLOBEBody/JurisdictionSection/GLOBETax/Amount");
    const paths = found.map((match) => match.path);

    expect(new Set(paths).size).toBe(found.length);
  });

  it("leaves a name that occurs once unindexed", () => {
    // `GLOBEBody[1]` would be noise. The ordinal is only meaningful where it
    // disambiguates something.
    expect(findOneByPath(document.root, "GLOBEBody")?.path).toBe("globe:GLOBEBody");
  });
});

describe("replaceAt", () => {
  it("replaces one element and leaves its siblings alone", () => {
    const match = findOneByPath(document.root, "GLOBEBody/JurisdictionSection/GLOBETax/Amount");
    const replaced = replaceAt(document.root, match?.indices ?? [], {
      kind: "element",
      name: "globe:Amount",
      attributes: [],
      children: [{ kind: "text", value: "999" }],
      paired: false,
    });

    const amounts = findByPath(replaced, "GLOBEBody/JurisdictionSection/GLOBETax/Amount");
    expect(amounts.map((found) => rawText(found.element))).toEqual(["999", "300"]);
  });

  it("does not mutate the original tree", () => {
    const match = findOneByPath(document.root, "GLOBEBody/JurisdictionSection/GLOBETax/Amount");
    replaceAt(document.root, match?.indices ?? [], {
      kind: "element",
      name: "globe:Amount",
      attributes: [],
      children: [{ kind: "text", value: "999" }],
      paired: false,
    });

    const first = findByPath(document.root, "GLOBEBody/JurisdictionSection/GLOBETax/Amount")[0];
    expect(first).toBeDefined();
    expect(first === undefined ? "" : rawText(first.element)).toBe("200");
  });
});

const added = {
  kind: "element" as const,
  name: "globe:Added",
  attributes: [],
  children: [{ kind: "text" as const, value: "x" }],
  paired: false,
};

describe("insertBefore", () => {
  it("puts the addition before the named sibling", () => {
    // The augmenting rules add an `AdditionalDataPoint` to a `JurisdictionSection`, which
    // the schema places before `DocSpec`. Appending to the end lands it after, out of
    // sequence, and libxml2 rejects the document.
    const match = findOneByPath(document.root, "GLOBEBody/JurisdictionSection");
    const inserted = insertBefore(document.root, match?.indices ?? [], "GLOBETax", added);

    const section = findOneByPath(inserted, "GLOBEBody/JurisdictionSection");
    const names = (section?.element.children ?? [])
      .filter(isElement)
      .map((child) => localName(child.name));

    expect(names.indexOf("Added")).toBeLessThan(names.indexOf("GLOBETax"));
  });

  it("appends where the anchor is absent", () => {
    const match = findOneByPath(document.root, "GLOBEBody/JurisdictionSection");
    const inserted = insertBefore(document.root, match?.indices ?? [], "NotAThing", added);

    expect(findByPath(inserted, "GLOBEBody/JurisdictionSection/Added")).toHaveLength(1);
  });
});

describe("removeAt", () => {
  it("removes the located element", () => {
    const match = findOneByPath(document.root, "GLOBEBody/JurisdictionSection/GLOBETax");
    const removed = removeAt(document.root, match?.indices ?? []);

    expect(findByPath(removed, "GLOBEBody/JurisdictionSection/GLOBETax")).toHaveLength(1);
  });

  it("takes the indentation before it, leaving no blank line", () => {
    // The serializer preserves whatever is in the tree, so a removal that left the
    // preceding whitespace node behind would add a stray indent to the output.
    const match = findOneByPath(document.root, "GLOBEBody/JurisdictionSection/GLOBETax");
    const removed = removeAt(document.root, match?.indices ?? []);

    expect(serializeGir({ ...document, root: removed })).not.toContain("\n\t\t\t\n");
  });

  it("leaves the document alone for indices that resolve to nothing", () => {
    expect(serializeGir({ ...document, root: removeAt(document.root, [99]) })).toBe(
      serializeGir(document),
    );
  });
});
