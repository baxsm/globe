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
    // The bug this replaced: matching on the element name alone marked every `Total` in
    // the document, claiming corrections that never happened.
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
