import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { replaceAt } from "../../errata/path";
import { suppressedValidationRules } from "../../errata/suppressions";
import { parseGir } from "../../serialize/parse";
import type { GirDocument, GirElement } from "../../serialize/types";
import { isElement } from "../../serialize/types";
import { validationRules } from "../rules";
import { validateGir } from "../validate";

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/${name}.xml`, import.meta.url)), "utf8");

const fixture = (name: string) => parseGir(read(name));

const clean = () => fixture("clean-gir");

/**
 * Rewrites the text of the first element with the given local name.
 *
 * Tests need a document that is one value away from a good one. Editing the XML string
 * would test the parser as much as the validator, so the change is made on the tree the
 * rules actually read.
 */
const withText = (document: GirDocument, element: string, value: string): GirDocument => {
  const indices = locate(document.root, element.toLowerCase(), []);
  if (indices === null) throw new Error(`no ${element} in fixture`);

  const target = indices.reduce<GirElement>((node, index) => {
    const child = node.children[index];
    if (child === undefined || !isElement(child)) throw new Error("unreachable index");
    return child;
  }, document.root);

  return {
    ...document,
    root: replaceAt(document.root, indices, {
      ...target,
      children: [{ kind: "text", value }],
    }),
  };
};

/** Indices of the first element with this local name, depth first. */
const locate = (node: GirElement, wanted: string, trail: number[]): number[] | null => {
  for (const [index, child] of node.children.entries()) {
    if (!isElement(child)) continue;

    const local = child.name.slice(child.name.indexOf(":") + 1).toLowerCase();
    if (local === wanted) return [...trail, index];

    const found = locate(child, wanted, [...trail, index]);
    if (found !== null) return found;
  }
  return null;
};

describe("suppressions", () => {
  it("reports four suppressions on a clean run", () => {
    // The phase's central assertion. A clean document is exactly the case where a
    // validator that quietly dropped four rules looks identical to this one.
    const result = validateGir(clean());

    expect(result.findings).toEqual([]);
    expect(result.suppressions).toHaveLength(4);
  });

  it("names all four disapplied rule numbers", () => {
    const reported = validateGir(clean()).suppressions.map(
      (suppression) => suppression.validationRule,
    );

    expect(reported.toSorted()).toEqual([60025, 60026, 70028, 70092]);
  });

  it("carries an issue number, a paragraph and a reason for each", () => {
    for (const suppression of validateGir(clean()).suppressions) {
      expect(suppression.issue).toBeGreaterThanOrEqual(8);
      expect(suppression.paragraph).toMatch(/^\d+(-\d+)?$/);
      expect(suppression.reason.length).toBeGreaterThan(20);
    }
  });

  it("never runs a disapplied rule", () => {
    for (const rule of validationRules) {
      expect(suppressedValidationRules).not.toContain(rule.rule);
    }
  });
});

describe("the four documents the disapplied rules would have rejected", () => {
  // Each of these is a correct filing that the corresponding rule would reject. If any
  // of them produces an error, the suppression is not working, and that is precisely the
  // broken validator the June 2026 guidance was published to prevent.
  const cases = [
    ["disapplied-60025-gir", 60025],
    ["disapplied-60026-gir", 60026],
    ["disapplied-70092-gir", 70092],
    ["disapplied-70028-gir", 70028],
  ] as const;

  for (const [name, rule] of cases) {
    it(`accepts the document that trips rule ${rule}`, () => {
      const result = validateGir(fixture(name));

      expect(result.findings.filter((finding) => finding.severity === "error")).toEqual([]);
      expect(result.suppressions.map((suppression) => suppression.validationRule)).toContain(rule);
    });
  }
});

describe("suppression scope", () => {
  it("still checks ETRRate for range once 60025 is disapplied", () => {
    // Disapplying 60025 removes one check on ETRRate. It must not remove the others, or
    // the suppression has silently taken the whole element out of validation.
    const document = fixture("clean-gir");
    const broken = withText(document, "ETRRate", "1.4000");

    const findings = validateGir(broken).findings;

    expect(findings.some((finding) => finding.path.endsWith("ETRRate"))).toBe(true);
    expect(findings.every((finding) => finding.rule !== 60025)).toBe(true);
  });

  it("still checks TopUpTaxPercentage for precision once 60026 is disapplied", () => {
    const broken = withText(fixture("clean-gir"), "TopUpTaxPercentage", "0.00004");

    const findings = validateGir(broken).findings;

    expect(findings.some((finding) => finding.path.endsWith("TopUpTaxPercentage"))).toBe(true);
    expect(findings.every((finding) => finding.rule !== 60026)).toBe(true);
  });
});

describe("findings", () => {
  it("gives every finding a path with a separator, never a bare element name", () => {
    // A bare name is not an address: ETRRate is declared three times. A finding that
    // cannot say which one it means cannot be rendered against the right element.
    const broken = withText(fixture("clean-gir"), "ETRRate", "1.4000");

    for (const finding of validateGir(broken).findings) {
      expect(finding.path).toContain("/");
    }
  });

  it("rejects a rate above the maximum the type permits", () => {
    const findings = validateGir(withText(fixture("clean-gir"), "ETRRate", "1.4000")).findings;

    expect(findings).toContainEqual(expect.objectContaining({ severity: "error", rule: 60002 }));
  });

  it("rejects a rate with more than four decimal places", () => {
    const findings = validateGir(withText(fixture("clean-gir"), "ETRRate", "0.00001")).findings;

    expect(findings.some((finding) => finding.message.includes("decimal places"))).toBe(true);
  });

  it("rejects exponent notation, which xsd:decimal does not accept", () => {
    const findings = validateGir(withText(fixture("clean-gir"), "ETRRate", "1.0E-7")).findings;

    expect(findings).toContainEqual(expect.objectContaining({ severity: "error", rule: 60002 }));
  });

  it("rejects a monetary amount that is not a whole number", () => {
    const findings = validateGir(withText(fixture("clean-gir"), "TopUpTax", "50000.50")).findings;

    expect(findings).toContainEqual(expect.objectContaining({ severity: "error", rule: 60001 }));
  });

  it("warns rather than errors when an ownership percentage is zero", () => {
    // Rule 70028 made this an error and was disapplied. Raising it as an error here
    // would reintroduce exactly what the guidance removed.
    const findings = validateGir(fixture("disapplied-70028-gir")).findings;

    expect(findings).toContainEqual(
      expect.objectContaining({ severity: "warning", rule: 70029, issue: 11 }),
    );
  });

  it("accepts the smallest holding the schema can express", () => {
    const document = withText(fixture("disapplied-70028-gir"), "OwnershipPercentage", "0.0001");

    expect(validateGir(document).findings).toEqual([]);
  });

  it("warns when excess profits exceed net GloBE income", () => {
    // The substance-based exclusion is subtracted from net GloBE income and is never
    // negative, so a larger ExcessProfits means one of the two figures is wrong. Both
    // are valid on their own, which is why the schema accepts the document.
    const document = withText(fixture("clean-gir"), "ExcessProfits", "2000000");

    expect(validateGir(document).findings).toContainEqual(
      expect.objectContaining({ severity: "warning", rule: 60030 }),
    );
  });

  it("accepts excess profits equal to net GloBE income", () => {
    // Equality is the case where no substance-based exclusion was claimed at all.
    expect(validateGir(fixture("clean-gir")).findings).toEqual([]);
  });
});
