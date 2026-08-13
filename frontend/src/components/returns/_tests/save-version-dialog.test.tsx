import { describe, expect, it } from "vitest";
import { buildElections } from "../save-version-dialog";

const empty = {
  safeHarbourApplies: false,
  equityInclusionAmount: "",
  article712Basis: "",
  unclaimedAccrualTins: "",
};

describe("buildElections", () => {
  it("omits every field when nothing is stated", () => {
    expect(buildElections(empty)).toEqual({});
  });

  it("sends the safe harbour only when checked", () => {
    expect(buildElections({ ...empty, safeHarbourApplies: true })).toEqual({
      safeHarbourApplies: true,
    });
  });

  it("keeps the equity amount as a string", () => {
    const result = buildElections({ ...empty, equityInclusionAmount: "1250000" });
    expect(result).toEqual({ equityInclusionAmount: "1250000" });
  });

  it("accepts a negative equity amount", () => {
    expect(buildElections({ ...empty, equityInclusionAmount: "-4200" })).toEqual({
      equityInclusionAmount: "-4200",
    });
  });

  it("rejects a fractional equity amount", () => {
    const result = buildElections({ ...empty, equityInclusionAmount: "1250.75" });
    expect(result).toBeInstanceOf(Error);
  });

  it("parses basis positions into numbers", () => {
    expect(buildElections({ ...empty, article712Basis: "0, 2" })).toEqual({
      article712BasisIndices: [0, 2],
    });
  });

  it("rejects a negative basis position", () => {
    expect(buildElections({ ...empty, article712Basis: "-1" })).toBeInstanceOf(Error);
  });

  it("rejects a basis position that is not a number", () => {
    expect(buildElections({ ...empty, article712Basis: "first" })).toBeInstanceOf(Error);
  });

  it("splits TINs and drops the gaps", () => {
    expect(buildElections({ ...empty, unclaimedAccrualTins: "FR8291046, , DE5520117" })).toEqual({
      unclaimedAccrualAnnualTins: ["FR8291046", "DE5520117"],
    });
  });

  // A trailing comma is what someone typing a list actually leaves behind, and an empty
  // TIN fails the backend's `min(1)` rather than being ignored.
  it("ignores a trailing comma", () => {
    expect(buildElections({ ...empty, unclaimedAccrualTins: "FR8291046," })).toEqual({
      unclaimedAccrualAnnualTins: ["FR8291046"],
    });
  });

  it("carries all four together", () => {
    expect(
      buildElections({
        safeHarbourApplies: true,
        equityInclusionAmount: "1250000",
        article712Basis: "0",
        unclaimedAccrualTins: "FR8291046",
      }),
    ).toEqual({
      safeHarbourApplies: true,
      equityInclusionAmount: "1250000",
      article712BasisIndices: [0],
      unclaimedAccrualAnnualTins: ["FR8291046"],
    });
  });
});
