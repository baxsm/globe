import { describe, expect, it } from "vitest";
import { parseGir } from "../../serialize/parse";
import { serializeGir } from "../../serialize/serialize";
import { findByPath, rawText } from "../path";
import { applyErrata, defaultContext, type ErrataContext, KNOWN_ISSUES } from "../registry";
import { suppressionRules } from "../suppressions";

const gir = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<globe:GLOBE_OECD xmlns:globe="urn:oecd:ties:globe:v2">${body}</globe:GLOBE_OECD>`;

const BODY = `<globe:GLOBEBody><globe:JurisdictionSection>
  <globe:JurWithTaxingRights><globe:ReportDifference><globe:AdjCoveredTaxDifference>
    <globe:AggCurrentTaxExpense>100</globe:AggCurrentTaxExpense>
  </globe:AdjCoveredTaxDifference></globe:ReportDifference></globe:JurWithTaxingRights>
  <globe:GLOBETax><globe:ETR><globe:ETRStatus><globe:ETRComputation>
    <globe:OverallComputation>
      <globe:FANIL>500</globe:FANIL>
      <globe:ETRRate>1.4</globe:ETRRate>
    </globe:OverallComputation>
  </globe:ETRComputation></globe:ETRStatus></globe:ETR></globe:GLOBETax>
</globe:JurisdictionSection></globe:GLOBEBody>`;

const document = parseGir(gir(BODY));
const context = defaultContext(2026);

const ETR_PATH =
  "GLOBEBody/JurisdictionSection/GLOBETax/ETR/ETRStatus/ETRComputation/OverallComputation/ETRRate";

const textAt = (result: ReturnType<typeof applyErrata>, path: string): string[] =>
  findByPath(result.document.root, path).map((found) => rawText(found.element));

describe("citation integrity", () => {
  // A rule whose paragraph drifts is worse than one with no citation, because the
  // margin will confidently cite the wrong paragraph.
  it("gives every application a non empty paragraph", () => {
    const result = applyErrata(document, {
      ...context,
      article712BasisIndices: [],
      safeHarbourApplies: true,
      equityInclusionAmount: "10",
      unclaimedAccrualAnnualTins: ["FR1"],
    });

    for (const application of result.applications) {
      expect(application.paragraph, `issue ${application.issue}`).toMatch(/^\d+(-\d+)?$/);
      expect(application.reason.length).toBeGreaterThan(20);
      expect(application.path.length).toBeGreaterThan(0);
    }
  });

  it("gives every suppression a paragraph and a rule number", () => {
    const { suppressions } = applyErrata(document, context);

    for (const suppression of suppressions) {
      expect(suppression.paragraph).toMatch(/^\d+(-\d+)?$/);
      expect(suppression.validationRule).toBeGreaterThan(0);
    }
  });

  it("knows all fourteen issues", () => {
    expect(KNOWN_ISSUES).toHaveLength(14);
    expect(new Set(KNOWN_ISSUES).size).toBe(14);
  });

  it("never reports an application whose path is only an element name", () => {
    // Element names are not unique in the schema, so a bare name is not an address.
    const result = applyErrata(document, { ...context, safeHarbourApplies: true });

    for (const application of result.applications) {
      expect(application.path, `issue ${application.issue}`).toContain("/");
    }
  });
});

describe("suppressions always run", () => {
  it("reports all four regardless of document content", () => {
    const empty = parseGir(gir("<globe:GLOBEBody/>"));
    const { suppressions } = applyErrata(empty, context);

    expect(suppressions.map((suppression) => suppression.validationRule)).toEqual([
      60025, 60026, 70092, 70028,
    ]);
  });

  it("matches the rules the suppression module exposes", () => {
    const { suppressions } = applyErrata(document, context);

    expect(suppressions).toHaveLength(suppressionRules.length);
  });
});

describe("idempotency", () => {
  it("produces the same document when run twice", () => {
    const once = applyErrata(document, context);
    const twice = applyErrata(once.document, context);

    expect(serializeGir(twice.document)).toBe(serializeGir(once.document));
  });

  it("is idempotent with the coercions active", () => {
    const active: ErrataContext = { ...context, safeHarbourApplies: true };
    const once = applyErrata(document, active);
    const twice = applyErrata(once.document, active);

    expect(serializeGir(twice.document)).toBe(serializeGir(once.document));
  });

  it("stops reporting a coercion once the value is already in range", () => {
    const once = applyErrata(document, context);
    const twice = applyErrata(once.document, context);

    expect(once.applications.some((application) => application.issue === 14)).toBe(true);
    expect(twice.applications.some((application) => application.issue === 14)).toBe(false);
  });
});

describe("rule ordering", () => {
  /**
   * Issue 7 zeros ETRRate; issue 14 clamps it. Both touch the same element, so the
   * order decides what the record says. 7 runs first, so under a safe harbour the value
   * is a structural zero and issue 14 correctly finds nothing out of range.
   */
  it("lets the safe harbour zero win over the clamp", () => {
    const result = applyErrata(document, { ...context, safeHarbourApplies: true });

    expect(textAt(result, ETR_PATH)).toEqual(["0"]);
    expect(result.applications.some((application) => application.issue === 7)).toBe(true);
    expect(result.applications.some((application) => application.issue === 14)).toBe(false);
  });

  it("clamps when no safe harbour applies", () => {
    const result = applyErrata(document, context);

    expect(textAt(result, ETR_PATH)).toEqual(["1"]);
    expect(result.applications.some((application) => application.issue === 14)).toBe(true);
  });
});

describe("the default context is the safe one", () => {
  // Every conditional rule defaults to off. Over-application is the failure that
  // produces a valid document making a different claim.
  it("applies no conditional rule without being asked", () => {
    const result = applyErrata(document, defaultContext(2026));
    const issues = new Set(result.applications.map((application) => application.issue));

    expect(issues.has(2)).toBe(false);
    expect(issues.has(4)).toBe(false);
    expect(issues.has(6)).toBe(false);
    expect(issues.has(7)).toBe(false);
  });
});
