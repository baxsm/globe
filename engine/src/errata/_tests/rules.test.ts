import { describe, expect, it } from "vitest";
import { parseGir } from "../../serialize/parse";
import { serializeGir } from "../../serialize/serialize";
import {
  ADT2_DESCRIPTION,
  ADT3_DESCRIPTION,
  applyIssue4,
  applyIssue6,
} from "../additional-data-points";
import { applyIssue1, applyIssue5 } from "../definitional";
import {
  ADT1_DESCRIPTION,
  ARTICLE_712_SUBSTITUTE,
  applyIssue2,
} from "../issue-02-article-712-basis";
import { applyIssue3 } from "../issue-03-utpr-attribution";
import { applyIssue7, SAFE_HARBOUR_ZERO_ELEMENTS } from "../issue-07-safe-harbour-zeros";
import { applyIssue12 } from "../issue-12-utpr-safe-harbour";
import {
  applyIssue13,
  RECAST_DUMMY_ADJUSTMENT_ITEM,
  RECAST_DUMMY_AMOUNT,
} from "../issue-13-recast-dummy";
import { applyIssue14 } from "../issue-14-percentage-clamp";
import { findByPath, rawText } from "../path";
import { suppressionRules } from "../suppressions";

const gir = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<globe:GLOBE_OECD xmlns:globe="urn:oecd:ties:globe:v2">${body}</globe:GLOBE_OECD>`;

const parse = (body: string) => parseGir(gir(body));

const textAt = (document: ReturnType<typeof parse>, path: string): string[] =>
  findByPath(document.root, path).map((found) => rawText(found.element));

const CONTEXT = { filingYear: 2026, article712BasisIndices: [], safeHarbourApplies: false };

/**
 * Two fixtures per issue: one where the rule fires, one where it must not.
 *
 * The second is the one that matters. A rule that fires when it should not produces a
 * document that still validates and is a different filing, and that failure is invisible
 * to every check except this one.
 */

describe("issue 1, the missing 3.1.6 total", () => {
  const body = `<globe:GLOBEBody><globe:JurisdictionSection><globe:JurWithTaxingRights>
    <globe:ReportDifference><globe:AdjCoveredTaxDifference>
      <globe:AggCurrentTaxExpense>100</globe:AggCurrentTaxExpense>
    </globe:AdjCoveredTaxDifference></globe:ReportDifference>
  </globe:JurWithTaxingRights></globe:JurisdictionSection></globe:GLOBEBody>`;

  it("records the substitution where the element is present", () => {
    const result = applyIssue1(parse(body));

    expect(result.applications).toHaveLength(1);
    expect(result.applications[0]?.issue).toBe(1);
    expect(result.applications[0]?.paragraph).toBe("2");
  });

  it("does not modify the document", () => {
    const document = parse(body);

    expect(serializeGir(applyIssue1(document).document)).toBe(serializeGir(document));
  });

  it("records nothing where the element is absent", () => {
    expect(applyIssue1(parse("<globe:GLOBEBody/>")).applications).toEqual([]);
  });
});

describe("issue 2, Article 7.1.2 basis", () => {
  const body = `<globe:GLOBEBody><globe:JurisdictionSection><globe:GLOBETax><globe:ETR><globe:ETRStatus>
    <globe:ETRComputation><globe:CEComputation><globe:AdjustedFANIL><globe:Adjustment>
      <globe:UPEAdjustments>
        <globe:Basis>GIR1908</globe:Basis>
        <globe:Reductions><globe:Amount>5000</globe:Amount></globe:Reductions>
      </globe:UPEAdjustments>
    </globe:Adjustment></globe:AdjustedFANIL></globe:CEComputation></globe:ETRComputation>
  </globe:ETRStatus></globe:ETR></globe:GLOBETax></globe:JurisdictionSection></globe:GLOBEBody>`;

  const BASIS_PATH =
    "GLOBEBody/JurisdictionSection/GLOBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedFANIL/Adjustment/UPEAdjustments/Basis";

  it("substitutes GIR1910 where 7.1.2 was elected", () => {
    const result = applyIssue2(parse(body), { article712BasisIndices: [0] });

    expect(textAt(result.document, BASIS_PATH)).toEqual([ARTICLE_712_SUBSTITUTE]);
  });

  it("emits the data point carrying the truth", () => {
    const result = applyIssue2(parse(body), { article712BasisIndices: [0] });
    const descriptions = textAt(
      result.document,
      "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Description",
    );

    expect(descriptions).toEqual([ADT1_DESCRIPTION]);
    expect(
      textAt(result.document, "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Amount"),
    ).toEqual(["5000"]);
    expect(
      textAt(result.document, "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Text")[0],
    ).toContain("Article 7.1.2");
  });

  it("produces both a substitution and an augmentation", () => {
    const result = applyIssue2(parse(body), { article712BasisIndices: [0] });

    expect(result.applications.map((application) => application.kind)).toEqual([
      "substitution",
      "augmentation",
    ]);
  });

  // The worst failure in the phase: a legitimate Article 7.2.2 filing rewritten into a
  // different claim, with both versions valid against the schema.
  it("leaves a document alone where 7.1.2 was not elected", () => {
    const document = parse(body);
    const result = applyIssue2(document, { article712BasisIndices: [] });

    expect(serializeGir(result.document)).toBe(serializeGir(document));
    expect(result.applications).toEqual([]);
  });

  it("says Exception in the text where a Reductions Exception is reported", () => {
    const withException = body.replace(
      "<globe:Amount>5000</globe:Amount>",
      "<globe:Amount>5000</globe:Amount><globe:Exception>x</globe:Exception>",
    );
    const result = applyIssue2(parse(withException), { article712BasisIndices: [0] });

    expect(
      textAt(result.document, "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Text")[0],
    ).toContain("Article 7.1.2, Exception");
  });
});

describe("issue 3, UTPRAttribution", () => {
  const body =
    "<globe:GLOBEBody><globe:UTPRAttribution><globe:X>1</globe:X></globe:UTPRAttribution></globe:GLOBEBody>";

  it("records that the element must not be used in 2026", () => {
    const result = applyIssue3(parse(body), CONTEXT);

    expect(result.applications).toHaveLength(1);
    expect(result.applications[0]?.paragraph).toBe("10");
  });

  it("does not apply to a later filing year", () => {
    // The guidance scopes this to 2026. Suppressing it later would hide real UTPR data.
    expect(applyIssue3(parse(body), { ...CONTEXT, filingYear: 2027 }).applications).toEqual([]);
  });

  it("records nothing where the element is absent", () => {
    expect(applyIssue3(parse("<globe:GLOBEBody/>"), CONTEXT).applications).toEqual([]);
  });
});

describe("issues 4 and 6, additional data points", () => {
  const body = "<globe:GLOBEBody><globe:JurisdictionSection/></globe:GLOBEBody>";

  it("tags an equity gain with ADT2", () => {
    const result = applyIssue4(parse(body), "1234");

    expect(
      textAt(result.document, "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Description"),
    ).toEqual([ADT2_DESCRIPTION]);
    expect(
      textAt(result.document, "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Amount"),
    ).toEqual(["1234"]);
  });

  it("tags an unclaimed accrual annual election with ADT3 and no amount", () => {
    // Paragraph 20: no other element under the data point is completed.
    const result = applyIssue6(parse(body), ["FR123"]);

    expect(
      textAt(result.document, "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Description"),
    ).toEqual([ADT3_DESCRIPTION]);
    expect(
      textAt(result.document, "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Amount"),
    ).toEqual([]);
    expect(
      textAt(result.document, "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Text")[0],
    ).toContain("FR123");
  });

  it("says aggregate reporting when no TINs are given", () => {
    const result = applyIssue6(parse(body), []);

    expect(
      textAt(result.document, "GLOBEBody/JurisdictionSection/AdditionalDataPoint/Text")[0],
    ).toContain("aggregate reporting");
  });

  it("leaves a document without a jurisdiction section alone", () => {
    const document = parse("<globe:GLOBEBody/>");

    expect(serializeGir(applyIssue4(document, "1").document)).toBe(serializeGir(document));
  });
});

describe("issue 7, safe harbour zeros", () => {
  const body = `<globe:GLOBEBody><globe:JurisdictionSection><globe:GLOBETax><globe:ETR><globe:ETRStatus>
    <globe:ETRComputation><globe:OverallComputation>
      <globe:FANIL>500</globe:FANIL>
      <globe:ETRRate>0.12</globe:ETRRate>
      <globe:SubstanceExclusion>300</globe:SubstanceExclusion>
    </globe:OverallComputation></globe:ETRComputation>
  </globe:ETRStatus></globe:ETR></globe:GLOBETax></globe:JurisdictionSection></globe:GLOBEBody>`;

  const BASE =
    "GLOBEBody/JurisdictionSection/GLOBETax/ETR/ETRStatus/ETRComputation/OverallComputation";

  it("zeros the listed siblings under a safe harbour", () => {
    const result = applyIssue7(parse(body), { safeHarbourApplies: true });

    expect(textAt(result.document, `${BASE}/FANIL`)).toEqual(["0"]);
    expect(textAt(result.document, `${BASE}/ETRRate`)).toEqual(["0"]);
  });

  it("leaves the SBIE alone, since it is the one figure actually required", () => {
    const result = applyIssue7(parse(body), { safeHarbourApplies: true });

    expect(textAt(result.document, `${BASE}/SubstanceExclusion`)).toEqual(["300"]);
  });

  it("records every zero it writes so padding is never mistaken for data", () => {
    const result = applyIssue7(parse(body), { safeHarbourApplies: true });

    expect(result.applications).toHaveLength(2);
    expect(result.applications.every((application) => application.kind === "coercion")).toBe(true);
  });

  it("does nothing where no safe harbour applies", () => {
    const document = parse(body);
    const result = applyIssue7(document, { safeHarbourApplies: false });

    expect(serializeGir(result.document)).toBe(serializeGir(document));
    expect(result.applications).toEqual([]);
  });

  it("lists the nine elements paragraph 22 names", () => {
    expect(SAFE_HARBOUR_ZERO_ELEMENTS).toEqual([
      "FANIL",
      "AdjustedFANIL",
      "NetGlobeIncome",
      "IncomeTaxExpense",
      "ETRRate",
      "TopUpTaxPercentage",
      "ExcessProfits",
      "TopUpTax",
      "ExcessNegTaxExpense",
    ]);
  });
});

describe("issue 12, the redundant UTPR safe harbour", () => {
  // Nested where the schema puts it. A fragment rooted at LowTaxJurisdiction matches
  // nothing in a real filing, and a rule that matches nothing reports nothing, which
  // reads exactly like a document with no target.
  const UTPR_PATH = "GLOBEBody/JurisdictionSection/LowTaxJurisdiction/UTPR/UTPRSafeHarbour";

  const jurisdiction = (safeHarbour: string): string =>
    `<globe:GLOBEBody><globe:JurisdictionSection><globe:LowTaxJurisdiction><globe:UTPR>
    ${safeHarbour}
  </globe:UTPR></globe:LowTaxJurisdiction></globe:JurisdictionSection></globe:GLOBEBody>`;

  it("removes the redundant element rather than emptying it", () => {
    // `UTPRSafeHarbour` is optional but its `CITRate` child is mandatory, so an element
    // present with no children is invalid. Emptying it, which is the intuitive reading of
    // "left blank", turns a filing the schema accepts into one it refuses.
    const result = applyIssue12(
      parse(jurisdiction("<globe:UTPRSafeHarbour>GIR701</globe:UTPRSafeHarbour>")),
    );

    expect(textAt(result.document, UTPR_PATH)).toEqual([]);
    expect(result.applications[0]?.paragraph).toBe("36");
  });

  it("takes the empty UTPR wrapper with it", () => {
    // `UTPR` is an xsd:choice requiring one of UTPRSafeHarbour or UTPRCalculation, so
    // removing the only child and leaving the wrapper is invalid too. `UTPR` is itself
    // optional, so the wrapper can go.
    const result = applyIssue12(
      parse(jurisdiction("<globe:UTPRSafeHarbour>GIR701</globe:UTPRSafeHarbour>")),
    );

    expect(
      findByPath(result.document.root, "GLOBEBody/JurisdictionSection/LowTaxJurisdiction/UTPR"),
    ).toEqual([]);
  });

  it("reports nothing once the element is gone", () => {
    const result = applyIssue12(parse(jurisdiction("")));

    expect(result.applications).toEqual([]);
  });

  it("does not fire on a fragment that is not rooted at the document root", () => {
    const loose =
      "<globe:LowTaxJurisdiction><globe:UTPR><globe:UTPRSafeHarbour>GIR701</globe:UTPRSafeHarbour></globe:UTPR></globe:LowTaxJurisdiction>";

    expect(applyIssue12(parse(loose)).applications).toEqual([]);
  });
});

describe("issue 13, the misplaced Recast", () => {
  // Only the CEComputation branch has a Recast under Adjustment. The sibling under
  // OverallComputation spells the element Adjustments and has no Recast child, so a
  // rule that matched on the bare fragment would have been addressing neither.
  const ADJUSTMENT =
    "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedCoveredTax/DeferTaxAdjustAmt/Adjustment";

  const adjustment = (extra: string): string =>
    `<globe:GLOBEBody><globe:JurisdictionSection><globe:GLoBETax><globe:ETR><globe:ETRStatus>
      <globe:ETRComputation><globe:CEComputation><globe:AdjustedCoveredTax>
      <globe:DeferTaxAdjustAmt><globe:Adjustment>
        <globe:AdjustmentItem>GIR2501</globe:AdjustmentItem>
        <globe:Amount>4200</globe:Amount>${extra}
      </globe:Adjustment></globe:DeferTaxAdjustAmt>
      </globe:AdjustedCoveredTax></globe:CEComputation></globe:ETRComputation>
    </globe:ETRStatus></globe:ETR></globe:GLoBETax></globe:JurisdictionSection></globe:GLOBEBody>`;

  const withRecast = adjustment("<globe:Recast>yes</globe:Recast>");
  const withoutRecast = adjustment("");

  it("writes the dummy item and a zero amount", () => {
    const result = applyIssue13(parse(withRecast));

    expect(textAt(result.document, `${ADJUSTMENT}/AdjustmentItem`)).toEqual([
      RECAST_DUMMY_ADJUSTMENT_ITEM,
    ]);
    expect(textAt(result.document, `${ADJUSTMENT}/Amount`)).toEqual([RECAST_DUMMY_AMOUNT]);
  });

  // Without the Recast these are a real adjustment. Overwriting them would replace a
  // genuine 4200 with zero in a document that still validates.
  it("leaves an ordinary adjustment untouched", () => {
    const document = parse(withoutRecast);
    const result = applyIssue13(document);

    expect(serializeGir(result.document)).toBe(serializeGir(document));
    expect(result.applications).toEqual([]);
  });

  // `Adjustment` is an xsd:sequence of Amount, AdjustmentItem, Recast. Inserting either
  // missing child at the end puts it after the Recast and the document stops validating,
  // which defeats the point of a rule that exists to make a Recast filable. The earlier
  // cases all supply both children, so only this one pins the order.
  it("inserts the missing children in the order the sequence requires", () => {
    const bare = `<globe:GLOBEBody><globe:JurisdictionSection><globe:GLoBETax><globe:ETR><globe:ETRStatus>
      <globe:ETRComputation><globe:CEComputation><globe:AdjustedCoveredTax>
      <globe:DeferTaxAdjustAmt><globe:Adjustment>
        <globe:Recast><globe:Higher>5</globe:Higher></globe:Recast>
      </globe:Adjustment></globe:DeferTaxAdjustAmt>
      </globe:AdjustedCoveredTax></globe:CEComputation></globe:ETRComputation>
    </globe:ETRStatus></globe:ETR></globe:GLoBETax></globe:JurisdictionSection></globe:GLOBEBody>`;

    const result = applyIssue13(parse(bare));
    const serialized = serializeGir(result.document);

    expect(result.applications).toHaveLength(1);
    expect(serialized.indexOf("<globe:Amount>")).toBeLessThan(
      serialized.indexOf("<globe:AdjustmentItem>"),
    );
    expect(serialized.indexOf("<globe:AdjustmentItem>")).toBeLessThan(
      serialized.indexOf("<globe:Recast>"),
    );
  });
});

describe("issue 14, percentages outside the interval", () => {
  const rate = (value: string): string =>
    `<globe:GLOBEBody><globe:JurisdictionSection><globe:GLOBETax><globe:ETR><globe:ETRStatus>
      <globe:ETRComputation><globe:OverallComputation>
        <globe:ETRRate>${value}</globe:ETRRate>
      </globe:OverallComputation></globe:ETRComputation>
    </globe:ETRStatus></globe:ETR></globe:GLOBETax></globe:JurisdictionSection></globe:GLOBEBody>`;

  const PATH =
    "GLOBEBody/JurisdictionSection/GLOBETax/ETR/ETRStatus/ETRComputation/OverallComputation/ETRRate";

  it("reports a value above the maximum as the maximum", () => {
    const result = applyIssue14(parse(rate("1.4")));

    expect(textAt(result.document, PATH)).toEqual(["1"]);
    expect(result.applications[0]?.schemaExpected).toContain("1.4");
  });

  it("reports a negative value as zero", () => {
    const result = applyIssue14(parse(rate("-0.2")));

    expect(textAt(result.document, PATH)).toEqual(["0"]);
  });

  it("leaves a value inside the interval alone", () => {
    const document = parse(rate("0.1234"));
    const result = applyIssue14(document);

    expect(serializeGir(result.document)).toBe(serializeGir(document));
    expect(result.applications).toEqual([]);
  });

  it("ignores a non numeric value rather than throwing", () => {
    expect(applyIssue14(parse(rate("n/a"))).applications).toEqual([]);
  });
});

describe("issues 8 to 11, the suppressions", () => {
  const document = parse("<globe:GLOBEBody/>");

  it("names all four disapplied validation rules", () => {
    const rules = suppressionRules.flatMap((rule) => rule.apply(document, CONTEXT).suppressions);

    expect(rules.map((suppression) => suppression.validationRule)).toEqual([
      60025, 60026, 70092, 70028,
    ]);
  });

  it("changes nothing in the document", () => {
    for (const rule of suppressionRules) {
      expect(serializeGir(rule.apply(document, CONTEXT).document)).toBe(serializeGir(document));
    }
  });

  it("gives every suppression a reason and a paragraph", () => {
    for (const rule of suppressionRules) {
      const [suppression] = rule.apply(document, CONTEXT).suppressions;

      expect(suppression?.paragraph).toMatch(/\d/);
      expect(suppression?.reason.length).toBeGreaterThan(20);
    }
  });
});

describe("issue 5, the AdjustedIncomeTax total", () => {
  const body = `<globe:GLOBEBody><globe:JurisdictionSection><globe:GLOBETax><globe:ETR><globe:ETRStatus>
    <globe:ETRComputation><globe:CEComputation><globe:AdjustedIncomeTax>
      <globe:Total>900</globe:Total>
    </globe:AdjustedIncomeTax></globe:CEComputation></globe:ETRComputation>
  </globe:ETRStatus></globe:ETR></globe:GLOBETax></globe:JurisdictionSection></globe:GLOBEBody>`;

  it("records that Total means something other than the User Guide says", () => {
    const result = applyIssue5(parse(body));

    expect(result.applications).toHaveLength(1);
    expect(result.applications[0]?.errataApplied).toContain("deferred");
  });

  it("does not silently recompute the filer's figure", () => {
    const document = parse(body);

    expect(serializeGir(applyIssue5(document).document)).toBe(serializeGir(document));
  });

  it("records nothing where the element is absent", () => {
    expect(applyIssue5(parse("<globe:GLOBEBody/>")).applications).toEqual([]);
  });
});
