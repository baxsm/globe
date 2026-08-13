import type { Application, ErrataContext, Finding, Suppression } from "@globe/engine";
import {
  applyErrata,
  defaultContext,
  readJurisdictions,
  serializeGir,
  suppressionRecords,
  validateGir,
} from "@globe/engine";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  errataApplications,
  type ValidationStatus,
  type VersionElections,
  validationRuns,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { ENGINE_VERSION } from "@/lib/reference";
import { requireVersion, type StoredDocument, storeXml } from "./version-service";

/**
 * Runs the engine over a version and records what it found.
 *
 * This service calls the engine and stores its output. It computes nothing itself: if a
 * function here derived an ETR, the calculation would exist in two places and the one
 * with tests would not be the one in production.
 */

/** One jurisdiction's figures, as strings the response can carry. */
export interface ComputedJurisdiction {
  readonly code: string | null;
  /** Decimal strings, not floats. `0.1000` and `0.1` are different filings. */
  readonly etrRate: string | null;
  readonly topUpTaxPercentage: string | null;
  readonly topUpTax: string | null;
  readonly additionalTopUpTax: string;
  readonly excessProfits: string;
  /**
   * Why the schema cannot carry the computed rate, empty when it can.
   *
   * Carried through to the response because a rate the schema rejects is the case the
   * errata exists for. Dropping it here would leave the UI unable to tell a clean
   * jurisdiction from one that only looks clean after a clamp.
   */
  readonly breaches: readonly string[];
  /** True when four-decimal rounding moves the top-up tax past the 1 percent tolerance. */
  readonly roundingBreachesTolerance: boolean;
}

export interface ComputedResult {
  readonly jurisdictions: readonly ComputedJurisdiction[];
}

export interface ValidationRunResult {
  readonly id: string;
  readonly status: ValidationStatus;
  readonly engineVersion: string;
  readonly createdAt: Date;
  readonly findings: readonly Finding[];
  readonly suppressions: readonly Suppression[];
  readonly computed: ComputedResult;
  readonly errata: readonly StoredApplication[];
}

export interface StoredApplication {
  readonly issueNumber: number;
  readonly kind: Application["kind"];
  readonly xpath: string;
  readonly schemaExpected: unknown;
  readonly errataApplied: unknown;
  readonly paragraph: string;
  readonly reason: string;
}

/**
 * Figures are serialized as strings.
 *
 * `Decimal.toString()` rather than `toNumber()`: a top-up tax large enough to exceed
 * 2^53 is not hypothetical for a group reporting in a minor currency unit, and the four
 * decimal places the schema permits do not survive a float round trip either.
 */
const toComputed = (document: StoredDocument): ComputedResult => ({
  jurisdictions: readJurisdictions(document).map((reading) => {
    const { effectiveTaxRate, topUpTaxPercentage, topUpTax, additionalTopUpTax } =
      reading.computation;

    return {
      code: reading.code,
      etrRate: effectiveTaxRate?.value.toString() ?? null,
      topUpTaxPercentage: topUpTaxPercentage?.toString() ?? null,
      topUpTax: topUpTax?.toString() ?? null,
      additionalTopUpTax: additionalTopUpTax.toString(),
      excessProfits: reading.computation.excessProfits.toString(),
      breaches: (effectiveTaxRate?.breaches ?? []).map((breach) => breach.kind),
      roundingBreachesTolerance: reading.computation.tolerance?.withinTolerance === false,
    };
  }),
});

/**
 * Runs the engine, then persists the run whether it succeeded or not.
 *
 * An engine crash that left no row would be indistinguishable from a run nobody started,
 * so the failure is recorded with status `engine_failed` and an empty result. The
 * suppressions are still written on a failed run: the four rules were not applied then
 * either, and that remains true regardless of what else went wrong.
 */
export const runValidation = async (
  returnId: string,
  userId: string,
  version: number,
): Promise<ValidationRunResult> => {
  const stored = await requireVersion(returnId, userId, version);
  const document = stored.document as StoredDocument;

  let findings: readonly Finding[] = [];
  let applications: readonly Application[] = [];
  let computed: ComputedResult = { jurisdictions: [] };
  let status: ValidationStatus;

  // Seeded from the engine's own records rather than left empty until the run succeeds.
  // The four rules were not applied whatever happens next, and a failed run that
  // reported none of them would read as a run where they had been checked.
  let suppressions: readonly Suppression[] = suppressionRecords;

  try {
    const validation = validateGir(document);
    findings = validation.findings;
    suppressions = validation.suppressions;

    // The filing year drives issue 3, which is scoped to 2026 filings only. It comes
    // from the document's own reporting period rather than from today's date, so
    // re-running an old return next year does not change what the engine applies.
    const errata = applyErrata(document, errataContext(stored.createdAt, stored.elections));
    applications = errata.applications;

    computed = toComputed(document);
    status = findings.some((finding) => finding.severity === "error") ? "errors" : "clean";
  } catch (error) {
    logger.error("validation.run", error);
    status = "engine_failed";
  }

  const [run] = await db
    .insert(validationRuns)
    .values({
      returnVersionId: stored.id,
      status,
      findings,
      suppressions,
      computed,
      engineVersion: ENGINE_VERSION,
    })
    .returning({
      id: validationRuns.id,
      status: validationRuns.status,
      engineVersion: validationRuns.engineVersion,
      createdAt: validationRuns.createdAt,
    });

  if (run === undefined) throw new Error("insert into validation_runs returned no row");

  const errata = await replaceApplications(stored.id, applications);

  return {
    id: run.id,
    status: run.status,
    engineVersion: run.engineVersion,
    createdAt: run.createdAt,
    findings,
    suppressions,
    computed,
    errata,
  };
};

/**
 * The applications for a version, replaced rather than appended.
 *
 * A second run of the same version must not double the margin's annotations. The rows
 * describe the version, not the run, so the latest run's view of them is the correct one.
 */
const replaceApplications = async (
  versionId: string,
  applications: readonly Application[],
): Promise<readonly StoredApplication[]> => {
  await db.delete(errataApplications).where(eq(errataApplications.returnVersionId, versionId));

  if (applications.length === 0) return [];

  const rows = applications.map((application) => ({
    returnVersionId: versionId,
    issueNumber: application.issue,
    kind: application.kind,
    xpath: application.path,
    schemaExpected: application.schemaExpected,
    errataApplied: application.errataApplied,
    paragraph: application.paragraph,
    reason: application.reason,
  }));

  await db.insert(errataApplications).values(rows);

  return rows.map((row) => ({
    issueNumber: row.issueNumber,
    kind: row.kind,
    xpath: row.xpath,
    schemaExpected: row.schemaExpected,
    errataApplied: row.errataApplied,
    paragraph: row.paragraph,
    reason: row.reason,
  }));
};

/** The most recent run for a version, or null when it has never been validated. */
export const latestRun = async (
  returnId: string,
  userId: string,
  version: number,
): Promise<ValidationRunResult | null> => {
  const stored = await requireVersion(returnId, userId, version);

  const [run] = await db
    .select({
      id: validationRuns.id,
      status: validationRuns.status,
      engineVersion: validationRuns.engineVersion,
      createdAt: validationRuns.createdAt,
      findings: validationRuns.findings,
      suppressions: validationRuns.suppressions,
      computed: validationRuns.computed,
    })
    .from(validationRuns)
    .where(eq(validationRuns.returnVersionId, stored.id))
    .orderBy(desc(validationRuns.createdAt))
    .limit(1);

  if (run === undefined) return null;

  const errata = await db
    .select({
      issueNumber: errataApplications.issueNumber,
      kind: errataApplications.kind,
      xpath: errataApplications.xpath,
      schemaExpected: errataApplications.schemaExpected,
      errataApplied: errataApplications.errataApplied,
      paragraph: errataApplications.paragraph,
      reason: errataApplications.reason,
    })
    .from(errataApplications)
    .where(eq(errataApplications.returnVersionId, stored.id))
    .orderBy(errataApplications.issueNumber);

  return {
    id: run.id,
    status: run.status,
    engineVersion: run.engineVersion,
    createdAt: run.createdAt,
    findings: run.findings,
    suppressions: run.suppressions,
    computed: run.computed as ComputedResult,
    errata,
  };
};

/**
 * Serializes a version with the errata applied, and caches the result.
 *
 * The XML is generated from the corrected document, not the stored one. The whole point
 * of the product is that what gets filed differs from what the schema literally asks for,
 * and exporting the uncorrected document would hand the filer the version the guidance
 * says is wrong.
 */
export const generateXml = async (
  returnId: string,
  userId: string,
  version: number,
): Promise<{ xml: string; byteLength: number }> => {
  const stored = await requireVersion(returnId, userId, version);
  const document = stored.document as StoredDocument;

  const errata = applyErrata(document, errataContext(stored.createdAt, stored.elections));
  const xml = serializeGir(errata.document);

  await storeXml(stored.id, xml);

  return { xml, byteLength: Buffer.byteLength(xml, "utf8") };
};

/**
 * The exported XML without writing anything.
 *
 * `generateXml` caches its result on the version, which is correct for the POST that asks
 * for an export to be produced. Serving the GET through it would make a read mutate a row
 * on every page load, so the read path serializes and returns without storing. The bytes
 * are identical either way: both run the same errata over the same stored document.
 */
export const readXml = async (
  returnId: string,
  userId: string,
  version: number,
): Promise<string> => {
  const stored = await requireVersion(returnId, userId, version);
  const document = stored.document as StoredDocument;

  const errata = applyErrata(document, errataContext(stored.createdAt, stored.elections));
  return serializeGir(errata.document);
};

/** The year a version belongs to, used to scope the first-cycle-only rules. */
const reportingYear = (createdAt: Date): number => createdAt.getUTCFullYear();

/**
 * The engine's context, built from what the filer stated about this version.
 *
 * `defaultContext` enables nothing, which is the right default: writing `GIR1910`
 * unconditionally would rewrite every legitimate Article 7.2.2 filing into a different
 * claim. But passing it alone, which is what this service did before `elections` existed,
 * left issues 2, 4, 6 and 7 unreachable from any document the API could store. The
 * elections are the filer's answer, so they are spread over the default rather than
 * replacing it.
 */
const errataContext = (createdAt: Date, elections: VersionElections): ErrataContext => {
  const base = defaultContext(reportingYear(createdAt));

  return {
    ...base,
    article712BasisIndices: elections.article712BasisIndices ?? base.article712BasisIndices,
    safeHarbourApplies: elections.safeHarbourApplies ?? base.safeHarbourApplies,
    // Both stay undefined when unstated. The registry keys off `undefined` to decide
    // whether the rule runs at all, so an empty string or an empty array would turn the
    // rule on with nothing to say.
    ...(elections.equityInclusionAmount === undefined
      ? {}
      : { equityInclusionAmount: elections.equityInclusionAmount }),
    ...(elections.unclaimedAccrualAnnualTins === undefined
      ? {}
      : { unclaimedAccrualAnnualTins: elections.unclaimedAccrualAnnualTins }),
  };
};
