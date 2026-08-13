import Decimal from "decimal.js";
import { findByPath, rawText } from "../errata/path";
import type { GirDocument, GirElement } from "../serialize/types";
import { computeJurisdiction } from "./jurisdiction";
import type { JurisdictionComputation } from "./top-up-tax";

/**
 * Reads the reported figures for each jurisdiction out of a document.
 *
 * This lives in the engine rather than in a caller because it is knowledge of where the
 * schema puts things, and the whole point of the engine boundary is that nothing outside
 * it needs to know that. A backend handler that walked these paths itself would be a
 * second, drifting copy of the schema's shape.
 *
 * The figures read here are what the filer reported. They are fed back through the same
 * calculation the engine would use to produce them, which is what makes a discrepancy
 * between the two visible instead of assumed away.
 */

const JURISDICTION_SECTION = "GLOBEBody/JurisdictionSection";

const OVERALL_COMPUTATION = "GLoBETax/ETR/ETRStatus/ETRComputation/OverallComputation";

export interface JurisdictionReading {
  /** The two-letter code from `Jurisdiction`, or null when the element is absent. */
  readonly code: string | null;
  readonly computation: JurisdictionComputation;
}

/** The first descendant matching a path, as a trimmed string, or undefined. */
const readAt = (root: GirElement, path: string): string | undefined => {
  const [found] = findByPath(root, path);
  if (found === undefined) return undefined;
  const value = rawText(found.element).trim();
  return value.length === 0 ? undefined : value;
};

/**
 * A reported amount as a Decimal, defaulting to zero.
 *
 * Monetary elements are `xsd:integer` in the schema, so a missing one means the filer
 * reported nothing rather than reported an unknown. Zero is the honest reading, and any
 * value that is present but not a number is left as zero rather than becoming NaN, which
 * would propagate silently through every figure derived from it.
 */
const amountAt = (root: GirElement, path: string): Decimal => {
  const raw = readAt(root, path);
  if (raw === undefined) return new Decimal(0);

  try {
    return new Decimal(raw);
  } catch {
    return new Decimal(0);
  }
};

/**
 * Every jurisdiction in the document, computed.
 *
 * A `JurisdictionSection` with no `OverallComputation` is skipped rather than reported
 * with zeros: a section that carries only a UTPR attribution has no ETR to state, and
 * emitting one would assert a rate of zero for a jurisdiction that never claimed a rate.
 */
export const readJurisdictions = (document: GirDocument): readonly JurisdictionReading[] => {
  const readings: JurisdictionReading[] = [];

  for (const section of findByPath(document.root, JURISDICTION_SECTION)) {
    const overall = findByPath(section.element, OVERALL_COMPUTATION)[0];
    if (overall === undefined) continue;

    const computation = overall.element;

    readings.push({
      code: readAt(section.element, "Jurisdiction") ?? null,
      computation: computeJurisdiction({
        adjustedCoveredTax: amountAt(computation, "AdjustedCoveredTax/Total"),
        netGlobeIncome: amountAt(computation, "NetGlobeIncome/Total"),
        substanceExclusion: amountAt(computation, "SubstanceBasedIncomeExclusion/Total"),
        qdmtt: amountAt(computation, "QDMTT"),
      }),
    });
  }

  return readings;
};
