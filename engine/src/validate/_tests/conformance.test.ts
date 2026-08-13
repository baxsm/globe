import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateFileAgainstXsd } from "../../schema/validate-xsd";
import { parseGir } from "../../serialize/parse";
import { serializeGir } from "../../serialize/serialize";
import { validateGir } from "../validate";

/**
 * The second oracle. The rules in this module are written from one reading of the
 * schema, so a test that only asks them whether a document is valid asks the same
 * opinion twice. libxml2 is the independent one.
 *
 * The premise the phase was planned on turned out to be wrong, and this is where it
 * shows. The four true pathological values cannot appear in a schema-valid document at
 * all: `globe:percentage` rejects 1.4, -0.2 and 0.00001 at the type facet, long before
 * any validation rule sees them. What a receiver actually gets is the value after the
 * errata has been applied, which is inside the type and is the wrong number. That is the
 * document each fixture here carries, and it is the document the four disapplied rules
 * would have rejected.
 */

const FIXTURES = [
  "clean-gir",
  "disapplied-60025-gir",
  "disapplied-60026-gir",
  "disapplied-70092-gir",
  "disapplied-70028-gir",
] as const;

const path = (name: string) =>
  fileURLToPath(new URL(`../../../fixtures/${name}.xml`, import.meta.url));

describe("fixtures against the real schema", () => {
  for (const name of FIXTURES) {
    it(`${name} is accepted by GLOBEXML_v1.0.xsd`, () => {
      expect(validateFileAgainstXsd(path(name))).toEqual({ available: true, valid: true });
    });
  }
});

describe("the validator agrees with the schema", () => {
  for (const name of FIXTURES) {
    it(`reports no error for ${name}, which libxml2 accepts`, () => {
      const document = parseGir(readFileSync(path(name), "utf8"));
      const errors = validateGir(document).findings.filter(
        (finding) => finding.severity === "error",
      );

      expect(errors).toEqual([]);
    });
  }
});

describe("validation reads the document the serializer emits", () => {
  it("round-trips every fixture byte for byte", () => {
    // Rules run on the parsed tree. That is only safe because the tree serializes back
    // to the same bytes, so a run cannot pass on a document that differs from the one
    // actually sent.
    for (const name of FIXTURES) {
      const source = readFileSync(path(name), "utf8");

      expect(serializeGir(parseGir(source)), name).toBe(source);
    }
  });
});
