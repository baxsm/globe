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

const rich = readFileSync(
  fileURLToPath(new URL("../../../fixtures/rich-gir.xml", import.meta.url)),
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

/**
 * A rule only its own unit test can reach is not implemented.
 *
 * Every fixture before this one carried `OverallComputation` and nothing else, so no
 * rule targeting the `CEComputation` branch had a document to fire on and the whole
 * registry reported zero applications on every real filing. A green suite over rules
 * nothing can reach looks exactly like a green suite over live ones.
 */
describe("the rich fixture reaches the rules", () => {
  const applied = (safeHarbourApplies: boolean) =>
    applyErrata(parseGir(rich), {
      ...defaultContext(2026),
      safeHarbourApplies,
      equityInclusionAmount: "125000",
      unclaimedAccrualAnnualTins: ["IE4455667T"],
    });

  it("fires the unconditional rules on a document nobody configured", () => {
    const result = applyErrata(parseGir(rich), defaultContext(2026));
    const issues = new Set(result.applications.map((application) => application.issue));

    expect([...issues].sort((a, b) => a - b)).toEqual([1, 5, 13]);
  });

  it("addresses every application to a distinct node", () => {
    // Three jurisdictions each produce an issue 5 application. Without an ordinal in the
    // path all three carry the same address and the margin cannot tell which node an
    // annotation belongs to.
    const result = applyErrata(parseGir(rich), defaultContext(2026));
    const paths = result.applications.map((application) => application.path);

    expect(new Set(paths).size).toBe(paths.length);
  });

  it("fires the conditional rules once the filer states the condition", () => {
    const issues = new Set(applied(true).applications.map((application) => application.issue));

    expect(issues.has(4)).toBe(true);
    expect(issues.has(6)).toBe(true);
    expect(issues.has(7)).toBe(true);
  });

  it("leaves the corrected document valid against the real schema", () => {
    expect(validate("rich-corrected.xml", serializeGir(applied(true).document))).toEqual({
      available: true,
      valid: true,
    });
  });
});
