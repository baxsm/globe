import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGir } from "../../serialize/parse";
import type { GirDocument } from "../../serialize/types";
import { readJurisdictions } from "../read-jurisdictions";

const fixture = (name: string): GirDocument =>
  parseGir(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url), "utf8"));

describe("readJurisdictions", () => {
  it("reads the jurisdiction code and computes its figures", () => {
    const readings = readJurisdictions(fixture("clean-gir.xml"));

    expect(readings).toHaveLength(1);
    expect(readings[0]?.code).toBe("IE");
  });

  it("recomputes the effective tax rate from the reported figures", () => {
    const reading = readJurisdictions(fixture("clean-gir.xml"))[0];

    // The fixture reports 100000 of covered tax on 1000000 of income, and an ETRRate of
    // 0.1000. The engine agrees, which is the case where nothing is wrong.
    expect(reading?.computation.effectiveTaxRate?.value.toString()).toBe("0.1");
  });

  it("derives the top-up tax percentage as the shortfall from the minimum rate", () => {
    const reading = readJurisdictions(fixture("clean-gir.xml"))[0];

    // 15 percent minus the 10 percent effective rate.
    expect(reading?.computation.topUpTaxPercentage?.toString()).toBe("0.05");
  });

  it("skips a section with no overall computation rather than reporting zeros", () => {
    // A jurisdiction that never stated a rate must not come back claiming a rate of
    // zero, which reads as a low-tax jurisdiction and is a different filing.
    const document = parseGir(
      '<?xml version="1.0" encoding="UTF-8"?>\n<globe:GLOBE_OECD xmlns:globe="urn:oecd:ties:globe:v2"><globe:GLOBEBody><globe:JurisdictionSection><globe:Jurisdiction>NL</globe:Jurisdiction></globe:JurisdictionSection></globe:GLOBEBody></globe:GLOBE_OECD>\n',
    );

    expect(readJurisdictions(document)).toEqual([]);
  });

  it("returns no readings for a document with no jurisdiction section", () => {
    expect(readJurisdictions(fixture("minimal-gir.xml"))).toEqual([]);
  });

  it("treats a missing amount as zero rather than as not a number", () => {
    // An absent monetary element means the filer reported nothing. NaN here would
    // propagate through every figure derived from it and surface as null much later.
    const document = parseGir(
      '<?xml version="1.0" encoding="UTF-8"?>\n<globe:GLOBE_OECD xmlns:globe="urn:oecd:ties:globe:v2"><globe:GLOBEBody><globe:JurisdictionSection><globe:Jurisdiction>NL</globe:Jurisdiction><globe:GLoBETax><globe:ETR><globe:ETRStatus><globe:ETRComputation><globe:OverallComputation><globe:NetGlobeIncome><globe:Total>1000</globe:Total></globe:NetGlobeIncome></globe:OverallComputation></globe:ETRComputation></globe:ETRStatus></globe:ETR></globe:GLoBETax></globe:JurisdictionSection></globe:GLOBEBody></globe:GLOBE_OECD>\n',
    );

    const reading = readJurisdictions(document)[0];

    expect(reading?.computation.effectiveTaxRate?.value.toString()).toBe("0");
    expect(reading?.computation.excessProfits.toString()).toBe("1000");
  });

  it("reads every jurisdiction in a multi-jurisdiction document", () => {
    const section = (code: string, tax: string): string =>
      `<globe:JurisdictionSection><globe:Jurisdiction>${code}</globe:Jurisdiction><globe:GLoBETax><globe:ETR><globe:ETRStatus><globe:ETRComputation><globe:OverallComputation><globe:NetGlobeIncome><globe:Total>1000</globe:Total></globe:NetGlobeIncome><globe:AdjustedCoveredTax><globe:Total>${tax}</globe:Total></globe:AdjustedCoveredTax></globe:OverallComputation></globe:ETRComputation></globe:ETRStatus></globe:ETR></globe:GLoBETax></globe:JurisdictionSection>`;

    const document = parseGir(
      `<?xml version="1.0" encoding="UTF-8"?>\n<globe:GLOBE_OECD xmlns:globe="urn:oecd:ties:globe:v2"><globe:GLOBEBody>${section("IE", "100")}${section("NL", "250")}</globe:GLOBEBody></globe:GLOBE_OECD>\n`,
    );

    const readings = readJurisdictions(document);

    expect(readings.map((reading) => reading.code)).toEqual(["IE", "NL"]);
    expect(readings[0]?.computation.effectiveTaxRate?.value.toString()).toBe("0.1");
    expect(readings[1]?.computation.effectiveTaxRate?.value.toString()).toBe("0.25");
  });
});
