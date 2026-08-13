import { parseGir, suppressionRecords, validateGir } from "@globe/engine";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { returnVersions, validationRuns } from "@/db/schema";
import {
  asUser,
  closeDatabase,
  fixture,
  json,
  resetDatabase,
  returnWithVersion,
  signUp,
} from "./helpers";

/**
 * The phase's oracle: the API returns exactly what the engine produced.
 *
 * The engine's own suite already proves the calculations are right. What is unproven
 * until here is that nothing between the engine and the HTTP response drops, reshapes or
 * quietly reorders any of it. So these assertions compare against the engine's real
 * output rather than against literals copied out of it.
 */

interface RunResponse {
  run: {
    status: string;
    findings: readonly { rule: number; severity: string }[];
    suppressions: readonly { issue: number; validationRule: number; paragraph: string }[];
    computed: { jurisdictions: readonly Record<string, unknown>[] };
  };
  errata: readonly { issueNumber: number; kind: string; xpath: string }[];
}

beforeEach(resetDatabase);
afterAll(closeDatabase);

describe("suppressions surviving into the response", () => {
  it("reports all four disapplied rules on a clean return", async () => {
    const session = await signUp("clean@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("clean-gir.xml"));

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    // The whole thesis. A clean run is exactly where a suppression is easiest to drop
    // and hardest to notice missing.
    expect(body.run.status).toBe("clean");
    expect(body.run.suppressions).toHaveLength(4);
    expect(body.run.suppressions.map((s) => s.validationRule)).toEqual([
      60025, 60026, 70092, 70028,
    ]);
  });

  it("returns the engine's suppression records unmodified", async () => {
    const session = await signUp("unmodified@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("clean-gir.xml"));

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    // Compared against the engine's own value rather than a copy of it, so a change to
    // a paragraph number or a reason cannot pass here by being changed in both places.
    expect(body.run.suppressions).toEqual(suppressionRecords);
  });

  it("persists the suppressions rather than recomputing them on read", async () => {
    const session = await signUp("persisted@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("clean-gir.xml"));

    await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
      method: "POST",
    });

    const [row] = await db
      .select({ suppressions: validationRuns.suppressions, status: validationRuns.status })
      .from(validationRuns)
      .limit(1);

    expect(row?.suppressions).toHaveLength(4);
    expect(row?.status).toBe("clean");
  });

  it("reports them again when the run is read back", async () => {
    const session = await signUp("readback@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("clean-gir.xml"));

    await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
      method: "POST",
    });

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validation`),
    );

    expect(body.run.suppressions).toEqual(suppressionRecords);
  });

  it("reports them on every one of the four disapplied-rule fixtures", async () => {
    const session = await signUp("everyfixture@example.com");

    for (const name of [
      "disapplied-60025-gir.xml",
      "disapplied-60026-gir.xml",
      "disapplied-70092-gir.xml",
      "disapplied-70028-gir.xml",
    ]) {
      const { returnId, version } = await returnWithVersion(session, fixture(name));

      const body = await json<RunResponse>(
        await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
          method: "POST",
        }),
      );

      expect(body.run.suppressions, `${name} lost its suppressions`).toHaveLength(4);
    }
  });
});

describe("findings match the engine", () => {
  it("returns the same findings the engine produces for the same document", async () => {
    const session = await signUp("findings@example.com");
    const document = fixture("clean-gir.xml");
    const { returnId, version } = await returnWithVersion(session, document);

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    const direct = validateGir(parseGir(document));

    expect(body.run.findings).toEqual(direct.findings);
  });

  it("computes a jurisdiction's figures as exact decimal strings", async () => {
    const session = await signUp("computed@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("clean-gir.xml"));

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    expect(body.run.computed.jurisdictions).toEqual([
      {
        code: "IE",
        etrRate: "0.1",
        topUpTaxPercentage: "0.05",
        topUpTax: "50000",
        additionalTopUpTax: "0",
        excessProfits: "1000000",
        breaches: [],
        roundingBreachesTolerance: false,
      },
    ]);
  });
});

describe("errata applications", () => {
  const outOfRange = (): string =>
    fixture("clean-gir.xml").replace(
      "<globe:ETRRate>0.1000</globe:ETRRate>",
      "<globe:ETRRate>1.4000</globe:ETRRate>",
    );

  it("records the clamp with both the schema expectation and the applied value", async () => {
    const session = await signUp("clamp@example.com");
    const { returnId, version } = await returnWithVersion(session, outOfRange());

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    expect(body.errata).toHaveLength(1);
    const [application] = body.errata;
    expect(application?.issueNumber).toBe(14);
    expect(application?.kind).toBe("coercion");
    // A full path, never a bare name: `ETRRate` is declared three times.
    expect(application?.xpath).toContain("/");
  });

  it("does not double the applications when a version is validated twice", async () => {
    const session = await signUp("twice@example.com");
    const { returnId, version } = await returnWithVersion(session, outOfRange());

    await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
      method: "POST",
    });
    const second = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    // The rows describe the version, not the run. Appending would grow the margin's
    // annotations by one copy per run.
    expect(second.errata).toHaveLength(1);
  });

  it("keeps every run in the history even when applications are replaced", async () => {
    const session = await signUp("history@example.com");
    const { returnId, version } = await returnWithVersion(session, outOfRange());

    await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
      method: "POST",
    });
    await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
      method: "POST",
    });

    const rows = await db.select({ id: validationRuns.id }).from(validationRuns);
    expect(rows).toHaveLength(2);
  });

  it("reports no applications for a document nothing targets", async () => {
    const session = await signUp("notargets@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("clean-gir.xml"));

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    expect(body.errata).toEqual([]);
    // Still four suppressions. Nothing to fix is not the same as nothing to report.
    expect(body.run.suppressions).toHaveLength(4);
  });
});

describe("engine failure", () => {
  /**
   * The document is corrupted in the database rather than posted through the API.
   *
   * The save route parses what it is given, so a malformed document never reaches
   * storage through the front door. Writing it directly is the only way to put the
   * engine in front of something it cannot read, which is the situation this guards.
   */
  const corruptStoredDocument = async (returnId: string): Promise<void> => {
    await db
      .update(returnVersions)
      .set({ document: { root: null, declaration: null, epilogue: "" } })
      .where(eq(returnVersions.returnId, returnId));
  };

  it("records a run with status engine_failed rather than losing it", async () => {
    const session = await signUp("enginefail@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("clean-gir.xml"));

    await corruptStoredDocument(returnId);

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    expect(body.run.status).toBe("engine_failed");

    // A crash that left no row would look exactly like a run nobody started.
    const rows = await db
      .select({ status: validationRuns.status })
      .from(validationRuns)
      .where(eq(validationRuns.status, "engine_failed"));

    expect(rows).toHaveLength(1);
  });

  it("still reports the four suppressions on a failed run", async () => {
    const session = await signUp("failsuppress@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("clean-gir.xml"));

    await corruptStoredDocument(returnId);

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    // The four rules were not applied on this run either, and that stays true whatever
    // else went wrong.
    expect(body.run.suppressions).toEqual(suppressionRecords);
  });
});

/**
 * The conditional rules were unreachable until the API could carry an election.
 *
 * Issues 2, 4, 6 and 7 fire only where the filer states a condition the document cannot
 * express: a 7.1.2 and a 7.2.2 election are identical once written, and a safe harbour
 * looks like an ordinary computation. The service passed `defaultContext` alone, which
 * enables none of them, so four of the fourteen fixes could not be triggered by any
 * document the API would accept. A green suite over rules nothing can reach looks exactly
 * like a green suite over live ones.
 */
describe("elections reaching the conditional rules", () => {
  it("fires the unconditional rules without any election", async () => {
    const session = await signUp("unconditional@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("rich-gir.xml"));

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    const issues = [...new Set(body.errata.map((application) => application.issueNumber))];
    expect(issues.sort((a, b) => a - b)).toEqual([1, 5, 13]);
  });

  it("fires issues 4, 6 and 7 once the filer states the condition", async () => {
    const session = await signUp("elected@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("rich-gir.xml"), {
      safeHarbourApplies: true,
      equityInclusionAmount: "125000",
      unclaimedAccrualAnnualTins: ["IE4455667T"],
    });

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    const issues = new Set(body.errata.map((application) => application.issueNumber));
    expect(issues.has(4)).toBe(true);
    expect(issues.has(6)).toBe(true);
    expect(issues.has(7)).toBe(true);
  });

  it("addresses every application to a distinct node", async () => {
    // Three jurisdictions each produce an issue 5 application. Identical paths mean the
    // margin cannot tell which node an annotation belongs to, and it lands on whichever
    // matched first. That misalignment reads as plausible rather than broken.
    const session = await signUp("distinct@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("rich-gir.xml"));

    const body = await json<RunResponse>(
      await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
        method: "POST",
      }),
    );

    const paths = body.errata.map((application) => application.xpath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("rejects an unknown election rather than ignoring the typo", async () => {
    const session = await signUp("typo@example.com");
    const created = await json<{ return: { id: string } }>(
      await asUser(session, "/api/returns", {
        method: "POST",
        body: { name: "Typo", reportingPeriod: "2024-12-31" },
      }),
    );

    const response = await asUser(session, `/api/returns/${created.return.id}/versions`, {
      method: "POST",
      body: {
        document: fixture("rich-gir.xml"),
        elections: { safeHarbourApplys: true },
      },
    });

    // Without `.strict()` the misspelling is stripped and the safe harbour silently does
    // not apply, which is indistinguishable from choosing not to elect it.
    expect(response.status).toBe(400);
  });
});
