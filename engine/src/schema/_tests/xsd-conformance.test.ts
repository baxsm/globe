import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { parseGir } from "../../serialize/parse";
import { serializeGir } from "../../serialize/serialize";
import { validateFileAgainstXsd } from "../validate-xsd";

const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`../../../fixtures/${name}`, import.meta.url));

const workspace = mkdtempSync(join(tmpdir(), "globe-xsd-"));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

const writeTemp = (name: string, contents: string): string => {
  const path = join(workspace, name);
  writeFileSync(path, contents, "utf8");
  return path;
};

/**
 * The validator is a hard dependency of this suite rather than something it skips over.
 * A silently skipped conformance test reads as a pass in CI and is the reason a broken
 * serializer would ship.
 */
const probe = validateFileAgainstXsd(fixturePath("minimal-gir.xml"));

describe("xsd validator", () => {
  it("is available", () => {
    expect(probe.available, probe.available ? "" : `validator unavailable: ${probe.reason}`).toBe(
      true,
    );
  });
});

describe("schema conformance", () => {
  it("accepts the minimal fixture", () => {
    expect(probe).toEqual({ available: true, valid: true });
  });

  it("accepts the serializer's own output", () => {
    const source = readFileSync(fixturePath("minimal-gir.xml"), "utf8");
    const path = writeTemp("round-tripped.xml", serializeGir(parseGir(source)));

    expect(validateFileAgainstXsd(path)).toEqual({ available: true, valid: true });
  });

  it("rejects a document whose elements are out of sequence", () => {
    // The failure this whole layer exists to catch: swapping two siblings under
    // xsd:sequence produces a document that parses cleanly and is invalid.
    const source = readFileSync(fixturePath("minimal-gir.xml"), "utf8");
    const country = "\t\t\t\t<globe:ResCountryCode>FR</globe:ResCountryCode>\n";
    const name = "\t\t\t\t<globe:Name>Example Group Holdings SA</globe:Name>\n";

    const reordered = source.replace(country + name, name + country);
    expect(reordered, "the swap must actually change the document").not.toBe(source);

    const result = validateFileAgainstXsd(writeTemp("reordered.xml", reordered));

    expect(result).toMatchObject({ available: true, valid: false });
    expect(parseGir(reordered).root.name, "and it must still parse").toBe("globe:GLOBE_OECD");
  });

  it("rejects an unknown element", () => {
    const source = readFileSync(fixturePath("minimal-gir.xml"), "utf8");
    const path = writeTemp(
      "unknown-element.xml",
      source.replace(
        "</globe:FilingInfo>",
        "<globe:NotAThing>x</globe:NotAThing></globe:FilingInfo>",
      ),
    );

    expect(validateFileAgainstXsd(path)).toMatchObject({ available: true, valid: false });
  });

  it("rejects a value outside an enumeration", () => {
    const source = readFileSync(fixturePath("minimal-gir.xml"), "utf8");
    const path = writeTemp(
      "bad-enum.xml",
      source.replace("<globe:Role>GIR401</globe:Role>", "<globe:Role>GIR999</globe:Role>"),
    );

    expect(validateFileAgainstXsd(path)).toMatchObject({ available: true, valid: false });
  });
});
