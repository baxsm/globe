import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { validateFileAgainstXsd } from "../../schema/validate-xsd";
import { parseGir } from "../../serialize/parse";
import { serializeGir } from "../../serialize/serialize";
import { applyErrata, defaultContext, KNOWN_ISSUES } from "../registry";
import type { IssueNumber } from "../types";

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
      article712BasisIndices: [0],
      safeHarbourApplies,
      equityInclusionAmount: "125000",
      unclaimedAccrualAnnualTins: ["IE4455667T"],
    });

  it("fires the unconditional rules on a document nobody configured", () => {
    const result = applyErrata(parseGir(rich), defaultContext(2026));
    const issues = new Set(result.applications.map((application) => application.issue));

    expect([...issues].sort((a, b) => a - b)).toEqual([1, 3, 5, 12, 13]);
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

    const conditional: readonly IssueNumber[] = [2, 4, 6, 7];
    for (const issue of conditional) expect(issues.has(issue), `issue ${issue}`).toBe(true);
  });

  /**
   * The check phase 8 asks for, brought forward.
   *
   * Thirteen of the fourteen are reachable from this one document. Issue 14 is not, and
   * cannot be: it clamps a percentage outside `globe:percentage`'s `[0, 1]`, and libxml2
   * rejects such a value at the type facet, so no schema-valid document can carry one.
   * That is the defect itself rather than a gap here, and the case below covers it from
   * the pre-errata form a filer's own calculation produces.
   */
  it("reaches thirteen of the fourteen from one document", () => {
    const result = applied(true);
    const reached: readonly IssueNumber[] = [
      ...result.applications.map((application) => application.issue),
      ...result.suppressions.map((suppression) => suppression.issue),
    ];

    expect(KNOWN_ISSUES.filter((issue) => !reached.includes(issue))).toEqual([14]);
  });

  it("leaves the corrected document valid against the real schema", () => {
    expect(validate("rich-corrected.xml", serializeGir(applied(true).document))).toEqual({
      available: true,
      valid: true,
    });
  });
});

/**
 * Issue 14, from the only document that can reach it.
 *
 * The clamp fires on a percentage the schema cannot express, so the input is a document
 * libxml2 rejects. That is not a contrived case: it is what a filer's own calculation
 * produces before the errata is applied, and the API parses submitted XML before any XSD
 * check, so this shape does arrive.
 *
 * The pair of assertions is the product's whole thesis in one test. Invalid goes in, the
 * errata is applied, and a document that can actually be filed comes out.
 */
describe("issue 14, from a pre-errata document", () => {
  const outOfRange = rich.replace(
    "<globe:ETRRate>0.1050</globe:ETRRate>",
    "<globe:ETRRate>1.2400</globe:ETRRate>",
  );

  it("starts from a document the schema rejects", () => {
    expect(outOfRange, "the substitution must actually change the fixture").not.toBe(rich);
    expect(validate("pre-errata.xml", outOfRange)).toMatchObject({
      available: true,
      valid: false,
    });
  });

  it("clamps the rate and reports the value the document cannot carry", () => {
    const result = applyErrata(parseGir(outOfRange), defaultContext(2026));
    const clamp = result.applications.find((application) => application.issue === 14);

    expect(clamp?.errataApplied).toBe("1");
    expect(clamp?.schemaExpected).toContain("1.2400");
  });

  it("produces a document the schema accepts", () => {
    const result = applyErrata(parseGir(outOfRange), defaultContext(2026));

    expect(validate("post-errata.xml", serializeGir(result.document))).toEqual({
      available: true,
      valid: true,
    });
  });
});
