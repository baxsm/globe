import { describe, expect, it } from "vitest";
import { AnnotationIndex } from "@/lib/annotations";
import type { ErrataApplication, Finding } from "@/lib/api";

const application = (xpath: string, issueNumber = 5): ErrataApplication => ({
  issueNumber,
  kind: "substitution",
  xpath,
  schemaExpected: "what the schema asks for",
  errataApplied: "what the guidance requires",
  paragraph: "16",
  reason: "because the guidance says so",
});

const finding = (path: string): Finding => ({
  rule: 70029,
  severity: "warning",
  path,
  message: "a warning",
  issue: 11,
});

/** The address the engine reports, prefixed and indexed. */
const ENGINE_PATH =
  "globe:GLOBEBody/globe:JurisdictionSection[1]/globe:GLoBETax/globe:ETR/globe:ETRRate";

/** The address the tree builds, from the root element down. */
const TREE_PATH = "GLOBE_OECD/GLOBEBody/JurisdictionSection[1]/GLoBETax/ETR/ETRRate";

describe("AnnotationIndex", () => {
  it("finds an application the engine addressed with prefixes", () => {
    const index = new AnnotationIndex([application(ENGINE_PATH)], []);

    expect(index.at(TREE_PATH)?.errata).toHaveLength(1);
  });

  it("keeps repeated sections apart", () => {
    // The failure the whole path scheme exists to prevent. Three jurisdictions each
    // carry an issue 5 application, and an annotation on the wrong one reads as
    // plausible rather than as broken.
    const index = new AnnotationIndex(
      [
        application("globe:GLOBEBody/globe:JurisdictionSection[1]/globe:Total"),
        application("globe:GLOBEBody/globe:JurisdictionSection[3]/globe:Total"),
      ],
      [],
    );

    expect(index.at("GLOBE_OECD/GLOBEBody/JurisdictionSection[1]/Total")?.errata).toHaveLength(1);
    expect(index.at("GLOBE_OECD/GLOBEBody/JurisdictionSection[2]/Total")).toBeNull();
    expect(index.at("GLOBE_OECD/GLOBEBody/JurisdictionSection[3]/Total")?.errata).toHaveLength(1);
  });

  it("does not match a node whose name merely ends with the same text", () => {
    const index = new AnnotationIndex([application("globe:GLOBEBody/globe:ETRRate")], []);

    expect(index.at("GLOBE_OECD/GLOBEBody/TopUpTaxETRRate")).toBeNull();
  });

  it("groups several applications on one node", () => {
    const index = new AnnotationIndex(
      [application(ENGINE_PATH, 5), application(ENGINE_PATH, 14)],
      [],
    );

    expect(index.at(TREE_PATH)?.errata).toHaveLength(2);
  });

  it("carries findings beside errata on the same node", () => {
    const index = new AnnotationIndex([application(ENGINE_PATH)], [finding(ENGINE_PATH)]);
    const found = index.at(TREE_PATH);

    expect(found?.errata).toHaveLength(1);
    expect(found?.findings).toHaveLength(1);
  });

  it("ignores the casing the guidance and the schema disagree about", () => {
    const index = new AnnotationIndex([application("GloBEBody/GLOBETax")], []);

    expect(index.at("GLOBE_OECD/GLOBEBody/GLoBETax")?.errata).toHaveLength(1);
  });

  it("reports empty when the run produced nothing", () => {
    expect(new AnnotationIndex([], []).isEmpty).toBe(true);
  });
});

describe("unattached", () => {
  const rendered = [TREE_PATH, "GLOBE_OECD/GLOBEBody/JurisdictionSection[1]"];

  it("reports a correction whose target the document does not contain", () => {
    // An augmentation adds an element the filer never wrote, so no row in the tree can
    // carry it. Reported by the engine and shown nowhere is a silent omission, which is
    // the one thing this surface must not do.
    const added = application("globe:JurisdictionSection[1]/globe:AdditionalDataPoint", 4);
    const index = new AnnotationIndex([application(ENGINE_PATH), added], []);

    expect(index.unattached(rendered)).toEqual([added]);
  });

  it("says nothing about a correction a node did carry", () => {
    const index = new AnnotationIndex([application(ENGINE_PATH)], []);

    expect(index.unattached(rendered)).toEqual([]);
  });

  it("orders what it reports by issue number", () => {
    const six = application("globe:JurisdictionSection[1]/globe:Later", 6);
    const two = application("globe:JurisdictionSection[1]/globe:Earlier", 2);
    const index = new AnnotationIndex([six, two], []);

    expect(index.unattached(rendered).map((a) => a.issueNumber)).toEqual([2, 6]);
  });
});

describe("repeats", () => {
  it("marks every application after the first of its issue", () => {
    // Issue 7 writes nine zeros per jurisdiction, each carrying the same sentence about
    // the safe harbour. Printed twenty-seven times it stops being an explanation.
    const first = application("globe:A/globe:FANIL", 7);
    const second = application("globe:A/globe:ETRRate", 7);
    const index = new AnnotationIndex([first, second], []);

    expect(index.repeats(first)).toBe(false);
    expect(index.repeats(second)).toBe(true);
  });

  it("does not carry the mark across different issues", () => {
    const seven = application("globe:A/globe:FANIL", 7);
    const five = application("globe:B/globe:Total", 5);
    const index = new AnnotationIndex([seven, five], []);

    expect(index.repeats(five)).toBe(false);
  });
});

describe("hasAnnotationBelow", () => {
  const index = new AnnotationIndex([application(ENGINE_PATH)], []);

  it("reports an ancestor of an annotated node", () => {
    // Every errata target in a real GIR is deeper than the two levels the tree opens by
    // default, so without this the margin looks empty on a return full of corrections.
    expect(index.hasAnnotationBelow("GLOBE_OECD/GLOBEBody/JurisdictionSection[1]/GLoBETax")).toBe(
      true,
    );
  });

  it("reports the root, which is above everything", () => {
    expect(index.hasAnnotationBelow("GLOBE_OECD/GLOBEBody")).toBe(true);
  });

  it("does not report a branch with nothing beneath it", () => {
    expect(index.hasAnnotationBelow("GLOBE_OECD/MessageSpec")).toBe(false);
  });

  it("does not report the annotated node itself as having one below", () => {
    // The node carries the annotation; it does not contain one. Reporting true here would
    // open a leaf's own disclosure, which it does not have.
    expect(index.hasAnnotationBelow(TREE_PATH)).toBe(false);
  });

  it("keeps repeated sections apart", () => {
    const repeats = new AnnotationIndex(
      [application("globe:GLOBEBody/globe:JurisdictionSection[2]/globe:GLoBETax/globe:Total")],
      [],
    );

    expect(repeats.hasAnnotationBelow("GLOBE_OECD/GLOBEBody/JurisdictionSection[2]")).toBe(true);
    expect(repeats.hasAnnotationBelow("GLOBE_OECD/GLOBEBody/JurisdictionSection[1]")).toBe(false);
  });
});
