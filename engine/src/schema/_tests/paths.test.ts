import { describe, expect, it } from "vitest";
import { SAFE_HARBOUR_ZERO_ELEMENTS } from "../../errata/issue-07-safe-harbour-zeros";
import { declaredPaths, isDeclaredPath } from "../paths";

/**
 * A rule that addresses a path the schema does not declare finds nothing, and finding
 * nothing is indistinguishable from a condition that was not met. Neither the unit tests
 * nor the XSD conformance tests catch it: the rule stays quiet and the document stays
 * valid.
 *
 * So every path any rule targets is checked against the schema's own declarations.
 */

describe("the declared path index", () => {
  it("reads the whole schema, not a truncated part of it", () => {
    // 564 is what the committed XSD declares. The number matters because the natural bug
    // in a tree walk is stopping early, and stopping early still yields a plausible set.
    expect(declaredPaths().size).toBe(564);
  });

  it("follows complexContent extension, where the tree is easiest to truncate", () => {
    // JurisdictionSection inherits its children through an extension base. A walker that
    // ignores extensions sees an empty element and every path below it disappears.
    expect(
      isDeclaredPath(
        "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/OverallComputation/ETRRate",
      ),
    ).toBe(true);
  });

  it("rejects a path the schema does not declare", () => {
    expect(isDeclaredPath("GLOBEBody/JurisdictionSection/NotAnElement")).toBe(false);
  });

  it("declares the element as GLoBETax, which is not how the guidance spells it", () => {
    // The schema's element is GLoBETax; only its type is GLOBETax. The June 2026
    // guidance writes GloBETax and GlobeTax in different paragraphs, and none of the
    // three match. Path matching is case-insensitive for exactly this reason.
    expect(declaredPaths().has("GLOBEBody/JurisdictionSection/GLoBETax")).toBe(true);
    expect(declaredPaths().has("GLOBEBody/JurisdictionSection/GLOBETax")).toBe(false);
  });
});

describe("every rule targets a real element", () => {
  // Kept in step with the path constants in src/errata and src/validate by hand. Two of
  // these were fragments rather than full paths when this test was written, so both
  // rules ran on synthetic fixtures and silently did nothing on a real filing.
  it("checks the paths the errata rules write to", () => {
    const targets = [
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/OverallComputation",
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/OverallComputation/ETRRate",
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/OverallComputation/TopUpTaxPercentage",
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/Election/Art3.2.1.c",
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/CEComputation/Elections/Art4.4.7",
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedIncomeTax/Total",
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedFANIL/Adjustment/UPEAdjustments/Basis",
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedFANIL/Adjustment/UPEAdjustments/Reductions/Amount",
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedFANIL/Adjustment/UPEAdjustments/Reductions/Exception",
      "GLOBEBody/JurisdictionSection/JurWithTaxingRights/ReportDifference/AdjCoveredTaxDifference",
      "GLOBEBody/JurisdictionSection/AdditionalDataPoint",
      "GLOBEBody/JurisdictionSection/LowTaxJurisdiction/UTPR/UTPRSafeHarbour",
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRException/UTPRSafeHarbour",
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/CEComputation/AdjustedCoveredTax/DeferTaxAdjustAmt/Adjustment",
      "GLOBEBody/GeneralSection/CorporateStructure/CE/Ownership/OwnershipPercentage",
      "GLOBEBody/UTPRAttribution",
    ];

    for (const target of targets) {
      expect(isDeclaredPath(target), target).toBe(true);
    }
  });

  it("checks every element issue 7 writes a zero into", () => {
    const overall =
      "GLOBEBody/JurisdictionSection/GLoBETax/ETR/ETRStatus/ETRComputation/OverallComputation";

    expect(SAFE_HARBOUR_ZERO_ELEMENTS).toHaveLength(9);
    for (const element of SAFE_HARBOUR_ZERO_ELEMENTS) {
      expect(isDeclaredPath(`${overall}/${element}`), element).toBe(true);
    }
  });
});
