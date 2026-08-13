import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { validateFileAgainstXsd } from "../../schema/validate-xsd";
import { parseGir } from "../../serialize/parse";
import { serializeGir } from "../../serialize/serialize";
import { applyErrata, defaultContext } from "../registry";

/**
 * The end to end question this phase has to answer: after the errata rules rewrite a
 * document, does it still validate against the real schema?
 *
 * Every unit test above asserts what a rule writes. None of them prove the result is a
 * document the OECD's own XSD accepts, and a fix that produces an invalid filing is
 * worse than no fix at all.
 */

const workspace = mkdtempSync(join(tmpdir(), "globe-errata-"));
afterAll(() => rmSync(workspace, { recursive: true, force: true }));

const fixture = readFileSync(
  fileURLToPath(new URL("../../../fixtures/minimal-gir.xml", import.meta.url)),
  "utf8",
);

const validate = (name: string, xml: string) => {
  const path = join(workspace, name);
  writeFileSync(path, xml, "utf8");
  return validateFileAgainstXsd(path);
};

describe("errata output against the real schema", () => {
  it("starts from a fixture the schema accepts", () => {
    expect(validate("before.xml", fixture)).toEqual({ available: true, valid: true });
  });

  it("leaves a document valid when only records are produced", () => {
    const result = applyErrata(parseGir(fixture), defaultContext(2026));

    expect(validate("after.xml", serializeGir(result.document))).toEqual({
      available: true,
      valid: true,
    });
  });

  it("does not touch a document that has no rule targets", () => {
    // The fixture carries only FilingInfo, so every structural rule should pass over it
    // and the bytes should be unchanged.
    const result = applyErrata(parseGir(fixture), defaultContext(2026));

    expect(serializeGir(result.document)).toBe(fixture);
  });

  it("still reports the four suppressions for a clean document", () => {
    const result = applyErrata(parseGir(fixture), defaultContext(2026));

    expect(result.suppressions).toHaveLength(4);
  });
});
