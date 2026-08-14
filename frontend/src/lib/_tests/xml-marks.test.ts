import { describe, expect, it } from "vitest";
import type { ErrataApplication } from "@/lib/api";
import { markXml } from "@/lib/xml-marks";

const application = (xpath: string, issueNumber: number): ErrataApplication => ({
  issueNumber,
  kind: "substitution",
  xpath,
  schemaExpected: "expected",
  errataApplied: "applied",
  paragraph: "38",
  reason: "reason",
});

/**
 * Two jurisdictions, each with a `Total` in a different branch.
 *
 * `Total` appearing in unrelated places is the whole reason marking is path-based: the
 * schema declares it in half a dozen branches and `Amount` eleven times.
 */
const XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  "<globe:GLOBE_OECD>",
  "\t<globe:GLOBEBody>",
  "\t\t<globe:JurisdictionSection>",
  "\t\t\t<globe:AdjustedFANIL>",
  "\t\t\t\t<globe:Total>2400000</globe:Total>",
  "\t\t\t</globe:AdjustedFANIL>",
  "\t\t\t<globe:AdjustedIncomeTax>",
  "\t\t\t\t<globe:Total>252000</globe:Total>",
  "\t\t\t</globe:AdjustedIncomeTax>",
  "\t\t</globe:JurisdictionSection>",
  "\t\t<globe:JurisdictionSection>",
  "\t\t\t<globe:AdjustedIncomeTax>",
  "\t\t\t\t<globe:Total>728000</globe:Total>",
  "\t\t\t</globe:AdjustedIncomeTax>",
  "\t\t</globe:JurisdictionSection>",
  "\t</globe:GLOBEBody>",
  "</globe:GLOBE_OECD>",
].join("\n");

const markedText = (xml: string, applications: readonly ErrataApplication[]) =>
  markXml(xml, applications)
    .filter((line) => line.issue !== null)
    .map((line) => line.text.trim());

describe("markXml", () => {
  it("marks only the element the application addressed", () => {
    // The document holds several `Total` elements. Matching on the element name alone
    // marks all of them and claims corrections that never happened.
    const marked = markedText(XML, [
      application("globe:JurisdictionSection[1]/globe:AdjustedIncomeTax/globe:Total", 5),
    ]);

    expect(marked).toEqual(["<globe:Total>252000</globe:Total>"]);
  });

  it("keeps two repeats of a section apart", () => {
    const marked = markedText(XML, [
      application("globe:JurisdictionSection[2]/globe:AdjustedIncomeTax/globe:Total", 5),
    ]);

    expect(marked).toEqual(["<globe:Total>728000</globe:Total>"]);
  });

  it("marks every repeat when the engine gave no ordinal", () => {
    // The engine omits the ordinal where a name occurs once among its siblings, so a key
    // without one is not a claim about position.
    const marked = markedText(XML, [application("globe:AdjustedIncomeTax/globe:Total", 5)]);

    expect(marked).toHaveLength(2);
  });

  it("leaves the filer's own values unmarked", () => {
    const lines = markXml(XML, [
      application("globe:JurisdictionSection[1]/globe:AdjustedIncomeTax/globe:Total", 5),
    ]);

    expect(lines.find((line) => line.text.includes("2400000"))?.issue).toBeNull();
  });

  it("keeps every line, marked or not", () => {
    // The view is the wire format, not a filtered extract of it. Dropping lines would
    // make the document unverifiable against what was actually sent.
    expect(markXml(XML, [])).toHaveLength(18);
  });

  it("does not let a closing tag reopen an element", () => {
    const marked = markedText(XML, [application("globe:GLOBEBody/globe:JurisdictionSection", 3)]);

    expect(marked).toEqual(["<globe:JurisdictionSection>", "<globe:JurisdictionSection>"]);
  });

  it("takes the lowest issue where two rules touch one element", () => {
    const path = "globe:JurisdictionSection[1]/globe:AdjustedIncomeTax/globe:Total";
    const lines = markXml(XML, [application(path, 13), application(path, 7)]);

    expect(lines.find((line) => line.text.includes("252000"))?.issue).toBe(7);
  });

  it("keeps every issue where one line carries several corrected elements", () => {
    // The real shape, and the one every other case here misses: the serializer emits all
    // three `AdditionalDataPoint` augmentations onto a single line, 933 characters on the
    // rich fixture, so issues 2, 4 and 6 sit on separate elements of one line. Stopping
    // at the first match tagged it "issue 02" and left issues 4 and 6 accounted for
    // nowhere in the export, which is the silent omission this view exists to prevent.
    //
    // A fixture with one element per line cannot express this, which is why it survived.
    const oneLine = [
      "<globe:GLOBE_OECD>",
      "\t<globe:GLOBEBody>",
      "\t\t<globe:JurisdictionSection>",
      "\t\t\t<globe:ADT1><globe:Amount>62000</globe:Amount></globe:ADT1><globe:ADT2><globe:Amount>1250000</globe:Amount></globe:ADT2><globe:ADT3><globe:Amount>0</globe:Amount></globe:ADT3>",
      "\t\t</globe:JurisdictionSection>",
      "\t</globe:GLOBEBody>",
      "</globe:GLOBE_OECD>",
    ].join("\n");

    const base = "globe:GLOBEBody/globe:JurisdictionSection";
    const lines = markXml(oneLine, [
      application(`${base}/globe:ADT3`, 6),
      application(`${base}/globe:ADT1`, 2),
      application(`${base}/globe:ADT2`, 4),
    ]);

    const line = lines.find((entry) => entry.text.includes("ADT1"));

    expect(line?.issues).toEqual([2, 4, 6]);
    expect(line?.issue).toBe(2);
  });

  it("reports no issues on a line the errata left alone", () => {
    const lines = markXml(XML, [
      application("globe:JurisdictionSection[1]/globe:AdjustedIncomeTax/globe:Total", 5),
    ]);

    expect(lines.find((line) => line.text.includes("2400000"))?.issues).toEqual([]);
  });

  it("handles a self-closing element without losing its place", () => {
    const withEmpty = XML.replace(
      "<globe:AdjustedFANIL>",
      "<globe:Empty/>\n\t\t\t<globe:AdjustedFANIL>",
    );

    const marked = markedText(withEmpty, [
      application("globe:JurisdictionSection[1]/globe:AdjustedIncomeTax/globe:Total", 5),
    ]);

    expect(marked).toEqual(["<globe:Total>252000</globe:Total>"]);
  });

  it("marks nothing when the run produced no applications", () => {
    expect(markXml(XML, []).every((line) => line.issue === null)).toBe(true);
  });
});
