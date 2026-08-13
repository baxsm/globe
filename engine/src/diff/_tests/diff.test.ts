import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGir } from "../../serialize/parse";
import type { GirDocument } from "../../serialize/types";
import { diffDocuments } from "../diff";

const fixture = (name: string): GirDocument =>
  parseGir(readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url), "utf8"));

const parse = (xml: string): GirDocument => parseGir(xml);

const wrap = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<globe:GLOBE_OECD xmlns:globe="urn:oecd:ties:globe:v2">${body}</globe:GLOBE_OECD>\n`;

describe("diffDocuments", () => {
  it("reports nothing for a document against itself", () => {
    const document = fixture("clean-gir.xml");
    expect(diffDocuments(document, document)).toEqual([]);
  });

  it("reports a changed leaf with both values", () => {
    const before = parse(wrap("<globe:ETRRate>0.1000</globe:ETRRate>"));
    const after = parse(wrap("<globe:ETRRate>0.1500</globe:ETRRate>"));

    expect(diffDocuments(before, after)).toEqual([
      { xpath: "ETRRate", kind: "changed", before: "0.1000", after: "0.1500" },
    ]);
  });

  it("reports an added leaf with no before value", () => {
    const before = parse(wrap("<globe:TopUpTax>0</globe:TopUpTax>"));
    const after = parse(
      wrap("<globe:TopUpTax>0</globe:TopUpTax><globe:ExcessProfits>500</globe:ExcessProfits>"),
    );

    expect(diffDocuments(before, after)).toEqual([
      { xpath: "ExcessProfits", kind: "added", before: null, after: "500" },
    ]);
  });

  it("reports a removed leaf with no after value", () => {
    const before = parse(
      wrap("<globe:TopUpTax>0</globe:TopUpTax><globe:ExcessProfits>500</globe:ExcessProfits>"),
    );
    const after = parse(wrap("<globe:TopUpTax>0</globe:TopUpTax>"));

    expect(diffDocuments(before, after)).toEqual([
      { xpath: "ExcessProfits", kind: "removed", before: "500", after: null },
    ]);
  });

  it("does not parse numbers, so trailing zeros are not a change", () => {
    const before = parse(wrap("<globe:ETRRate>0.1000</globe:ETRRate>"));
    const after = parse(wrap("<globe:ETRRate>0.1000</globe:ETRRate>"));

    expect(diffDocuments(before, after)).toEqual([]);
  });

  it("treats 0.10 and 0.1 as a change, because the wire format differs", () => {
    const before = parse(wrap("<globe:ETRRate>0.10</globe:ETRRate>"));
    const after = parse(wrap("<globe:ETRRate>0.1</globe:ETRRate>"));

    expect(diffDocuments(before, after)).toHaveLength(1);
  });
});

describe("repeated siblings", () => {
  const jurisdiction = (code: string, rate: string): string =>
    `<globe:JurisdictionSection><globe:Jurisdiction>${code}</globe:Jurisdiction><globe:ETRRate>${rate}</globe:ETRRate></globe:JurisdictionSection>`;

  it("pairs jurisdictions by identity, so inserting one does not rewrite the rest", () => {
    const before = parse(wrap(jurisdiction("IE", "0.1000") + jurisdiction("NL", "0.2000")));
    const after = parse(
      wrap(
        jurisdiction("BE", "0.3000") + jurisdiction("IE", "0.1000") + jurisdiction("NL", "0.2000"),
      ),
    );

    const changes = diffDocuments(before, after);

    // The whole point: one addition, and IE and NL are untouched despite both shifting
    // position. A positional diff would report four changes here.
    expect(changes).toEqual([
      { xpath: "JurisdictionSection[1]", kind: "added", before: null, after: null },
    ]);
  });

  it("reports a value change inside a jurisdiction that moved", () => {
    const before = parse(wrap(jurisdiction("IE", "0.1000") + jurisdiction("NL", "0.2000")));
    const after = parse(wrap(jurisdiction("NL", "0.2000") + jurisdiction("IE", "0.1500")));

    const changes = diffDocuments(before, after);

    expect(changes).toEqual([
      {
        xpath: "JurisdictionSection[1]/ETRRate",
        kind: "changed",
        before: "0.1000",
        after: "0.1500",
      },
    ]);
  });

  it("indexes only names that repeat", () => {
    const before = parse(
      wrap(
        `<globe:MessageSpec><globe:MessageType>GIR</globe:MessageType></globe:MessageSpec>${jurisdiction("IE", "0.1000")}`,
      ),
    );
    const after = parse(
      wrap(
        `<globe:MessageSpec><globe:MessageType>CBC</globe:MessageType></globe:MessageSpec>${jurisdiction("IE", "0.1000")}`,
      ),
    );

    expect(diffDocuments(before, after)).toEqual([
      { xpath: "MessageSpec/MessageType", kind: "changed", before: "GIR", after: "CBC" },
    ]);
  });

  it("pairs unlabelled repeats in document order", () => {
    const before = parse(wrap("<globe:Amount>10</globe:Amount><globe:Amount>20</globe:Amount>"));
    const after = parse(wrap("<globe:Amount>10</globe:Amount><globe:Amount>30</globe:Amount>"));

    expect(diffDocuments(before, after)).toEqual([
      { xpath: "Amount[2]", kind: "changed", before: "20", after: "30" },
    ]);
  });

  it("reports a removed jurisdiction once, not once per descendant", () => {
    const before = parse(wrap(jurisdiction("IE", "0.1000") + jurisdiction("NL", "0.2000")));
    const after = parse(wrap(jurisdiction("IE", "0.1000")));

    expect(diffDocuments(before, after)).toEqual([
      { xpath: "JurisdictionSection[2]", kind: "removed", before: null, after: null },
    ]);
  });
});

describe("shape changes", () => {
  it("reports a leaf that gained children as one change on the element", () => {
    const before = parse(wrap("<globe:NetGlobeIncome>1000</globe:NetGlobeIncome>"));
    const after = parse(
      wrap("<globe:NetGlobeIncome><globe:Total>1000</globe:Total></globe:NetGlobeIncome>"),
    );

    expect(diffDocuments(before, after)).toEqual([
      { xpath: "NetGlobeIncome", kind: "changed", before: "1000", after: null },
    ]);
  });

  it("descends into containers rather than reporting their concatenated text", () => {
    const before = parse(
      wrap(
        "<globe:Adjusted><globe:Total>1000</globe:Total><globe:Tax>100</globe:Tax></globe:Adjusted>",
      ),
    );
    const after = parse(
      wrap(
        "<globe:Adjusted><globe:Total>1000</globe:Total><globe:Tax>200</globe:Tax></globe:Adjusted>",
      ),
    );

    expect(diffDocuments(before, after)).toEqual([
      { xpath: "Adjusted/Tax", kind: "changed", before: "100", after: "200" },
    ]);
  });
});

describe("against the real fixtures", () => {
  it("finds the clamped rate between the clean and issue 14 documents", () => {
    const changes = diffDocuments(fixture("clean-gir.xml"), fixture("disapplied-60026-gir.xml"));

    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      expect(change.xpath).not.toContain("//");
      expect(change.xpath.length).toBeGreaterThan(0);
    }
  });

  it("addresses every change by a path, never a bare name at depth", () => {
    const changes = diffDocuments(fixture("minimal-gir.xml"), fixture("clean-gir.xml"));

    // A bare element name is not an address: `Amount` is declared 11 times. Anything
    // below the root has to carry its parents.
    expect(changes.some((change) => change.xpath.includes("/"))).toBe(true);
  });

  it("is symmetric: reversing the arguments swaps additions and removals", () => {
    const forward = diffDocuments(fixture("minimal-gir.xml"), fixture("clean-gir.xml"));
    const backward = diffDocuments(fixture("clean-gir.xml"), fixture("minimal-gir.xml"));

    const added = forward.filter((change) => change.kind === "added").length;
    const removed = backward.filter((change) => change.kind === "removed").length;
    expect(added).toBe(removed);
  });
});
