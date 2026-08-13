import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { GUIDANCE_VERSION, SCHEMA_VERSION } from "@/lib/reference";
import {
  asUser,
  closeDatabase,
  fixture,
  json,
  resetDatabase,
  returnWithVersion,
  signUp,
} from "./helpers";

beforeEach(resetDatabase);
afterAll(closeDatabase);

interface ReturnBody {
  return: {
    id: string;
    name: string;
    mneGroupName: string | null;
    schemaVersion: string;
    guidanceVersion: string;
  };
}

describe("creating a return", () => {
  it("pins the schema and guidance versions at creation", async () => {
    const session = await signUp("pinned@example.com");

    const body = await json<ReturnBody>(
      await asUser(session, "/api/returns", {
        method: "POST",
        body: { name: "FY2024", reportingPeriod: "2024-12-31" },
      }),
    );

    // Per return, never global. A revision of the guidance must not silently
    // re-interpret a return authored under the previous one.
    expect(body.return.schemaVersion).toBe(SCHEMA_VERSION);
    expect(body.return.guidanceVersion).toBe(GUIDANCE_VERSION);
  });

  it("rejects a reporting period that is not an ISO date", async () => {
    const session = await signUp("baddate@example.com");

    const response = await asUser(session, "/api/returns", {
      method: "POST",
      body: { name: "FY2024", reportingPeriod: "31/12/2024" },
    });

    expect(response.status).toBe(400);
  });

  it("rejects an empty name", async () => {
    const session = await signUp("noname@example.com");

    const response = await asUser(session, "/api/returns", {
      method: "POST",
      body: { name: "", reportingPeriod: "2024-12-31" },
    });

    expect(response.status).toBe(400);
  });
});

describe("listing returns", () => {
  it("lists only the signed-in user's returns", async () => {
    const owner = await signUp("owner@example.com");
    const other = await signUp("other@example.com");

    await asUser(owner, "/api/returns", {
      method: "POST",
      body: { name: "Mine", reportingPeriod: "2024-12-31" },
    });

    const body = await json<{ returns: readonly unknown[] }>(await asUser(other, "/api/returns"));
    expect(body.returns).toEqual([]);
  });

  it("reports the latest version number, and zero before any save", async () => {
    const session = await signUp("latest@example.com");

    await asUser(session, "/api/returns", {
      method: "POST",
      body: { name: "Empty", reportingPeriod: "2024-12-31" },
    });

    const before = await json<{ returns: readonly { latestVersion: number }[] }>(
      await asUser(session, "/api/returns"),
    );
    expect(before.returns[0]?.latestVersion).toBe(0);
  });
});

describe("updating and deleting", () => {
  it("renames a return without touching its document", async () => {
    const session = await signUp("rename@example.com");
    const { returnId } = await returnWithVersion(session, fixture("clean-gir.xml"));

    const body = await json<ReturnBody>(
      await asUser(session, `/api/returns/${returnId}`, {
        method: "PATCH",
        body: { name: "Renamed" },
      }),
    );

    expect(body.return.name).toBe("Renamed");

    const versions = await json<{ versions: readonly unknown[] }>(
      await asUser(session, `/api/returns/${returnId}/versions`),
    );
    expect(versions.versions).toHaveLength(1);
  });

  it("rejects a patch that changes nothing", async () => {
    const session = await signUp("nochange@example.com");
    const { returnId } = await returnWithVersion(session, fixture("clean-gir.xml"));

    const response = await asUser(session, `/api/returns/${returnId}`, {
      method: "PATCH",
      body: {},
    });

    expect(response.status).toBe(400);
  });

  it("cascades a delete to versions and runs", async () => {
    const session = await signUp("cascade@example.com");
    const { returnId, version } = await returnWithVersion(session, fixture("clean-gir.xml"));

    await asUser(session, `/api/returns/${returnId}/versions/${version}/validate`, {
      method: "POST",
    });

    expect((await asUser(session, `/api/returns/${returnId}`, { method: "DELETE" })).status).toBe(
      200,
    );
    expect((await asUser(session, `/api/returns/${returnId}`)).status).toBe(404);
  });
});

describe("versions", () => {
  it("numbers versions from one, monotonically", async () => {
    const session = await signUp("numbering@example.com");
    const { returnId } = await returnWithVersion(session, fixture("clean-gir.xml"));

    for (let i = 0; i < 3; i += 1) {
      await asUser(session, `/api/returns/${returnId}/versions`, {
        method: "POST",
        body: { document: fixture("clean-gir.xml") },
      });
    }

    const body = await json<{ versions: readonly { version: number }[] }>(
      await asUser(session, `/api/returns/${returnId}/versions`),
    );

    expect(body.versions.map((v) => v.version)).toEqual([1, 2, 3, 4]);
  });

  it("allocates distinct numbers under concurrent writes", async () => {
    const session = await signUp("concurrent@example.com");
    const { returnId } = await returnWithVersion(session, fixture("clean-gir.xml"));

    // Two saves both reading `max(version)` as 1 would both write 2. The unique
    // constraint turns the loser into a retry rather than a silent overwrite.
    const saves = Array.from({ length: 8 }, () =>
      asUser(session, `/api/returns/${returnId}/versions`, {
        method: "POST",
        body: { document: fixture("clean-gir.xml") },
      }),
    );

    await Promise.all(saves);

    const body = await json<{ versions: readonly { version: number }[] }>(
      await asUser(session, `/api/returns/${returnId}/versions`),
    );

    const numbers = body.versions.map((v) => v.version);
    expect(numbers).toHaveLength(9);
    expect(new Set(numbers).size).toBe(9);
  });

  it("rejects a malformed document rather than storing a repaired one", async () => {
    const session = await signUp("malformed@example.com");
    const { returnId } = await returnWithVersion(session, fixture("clean-gir.xml"));

    // The parser silently closes `<not><closed>` into `<not><closed/></not>`, so
    // without the well-formedness check a filer's broken document would be stored as a
    // different, valid one.
    const response = await asUser(session, `/api/returns/${returnId}/versions`, {
      method: "POST",
      body: { document: "<not><closed>" },
    });

    expect(response.status).toBe(422);
  });

  it("round-trips a document byte for byte through storage", async () => {
    const session = await signUp("roundtrip@example.com");
    const document = fixture("clean-gir.xml");
    const { returnId, version } = await returnWithVersion(session, document);

    const response = await asUser(session, `/api/returns/${returnId}/versions/${version}/xml`);

    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(await response.text()).toBe(document);
  });

  it("rejects a version number that is not a positive whole number", async () => {
    const session = await signUp("badversion@example.com");
    const { returnId } = await returnWithVersion(session, fixture("clean-gir.xml"));

    for (const bad of ["0", "-1", "abc", "1.5"]) {
      const response = await asUser(session, `/api/returns/${returnId}/versions/${bad}`);
      expect(response.status, `version ${bad} was accepted`).toBe(400);
    }
  });

  it("returns 404 for a version that does not exist", async () => {
    const session = await signUp("noversion@example.com");
    const { returnId } = await returnWithVersion(session, fixture("clean-gir.xml"));

    expect((await asUser(session, `/api/returns/${returnId}/versions/99`)).status).toBe(404);
  });
});

describe("diff", () => {
  it("reports the one element that changed between two versions", async () => {
    const session = await signUp("diff@example.com");
    const { returnId } = await returnWithVersion(session, fixture("clean-gir.xml"));

    await asUser(session, `/api/returns/${returnId}/versions`, {
      method: "POST",
      body: {
        document: fixture("clean-gir.xml").replace(
          "<globe:ETRRate>0.1000</globe:ETRRate>",
          "<globe:ETRRate>0.1500</globe:ETRRate>",
        ),
      },
    });

    const body = await json<{
      changes: readonly { xpath: string; kind: string; before: string; after: string }[];
    }>(await asUser(session, `/api/returns/${returnId}/versions/1/diff/2`));

    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]?.kind).toBe("changed");
    expect(body.changes[0]?.before).toBe("0.1000");
    expect(body.changes[0]?.after).toBe("0.1500");
    expect(body.changes[0]?.xpath).toContain("ETRRate");
  });

  it("reports nothing between identical versions", async () => {
    const session = await signUp("samediff@example.com");
    const { returnId } = await returnWithVersion(session, fixture("clean-gir.xml"));

    await asUser(session, `/api/returns/${returnId}/versions`, {
      method: "POST",
      body: { document: fixture("clean-gir.xml") },
    });

    const body = await json<{ changes: readonly unknown[] }>(
      await asUser(session, `/api/returns/${returnId}/versions/1/diff/2`),
    );

    expect(body.changes).toEqual([]);
  });
});

describe("ownership on nested routes", () => {
  it("hides another user's return behind a 404 on every nested route", async () => {
    const owner = await signUp("hasreturn@example.com");
    const intruder = await signUp("intruder@example.com");
    const { returnId, version } = await returnWithVersion(owner, fixture("clean-gir.xml"));

    const paths: readonly [string, string][] = [
      ["GET", `/api/returns/${returnId}`],
      ["GET", `/api/returns/${returnId}/versions`],
      ["GET", `/api/returns/${returnId}/versions/${version}`],
      ["GET", `/api/returns/${returnId}/versions/${version}/xml`],
      ["GET", `/api/returns/${returnId}/versions/${version}/validation`],
      ["GET", `/api/returns/${returnId}/versions/1/diff/1`],
      ["POST", `/api/returns/${returnId}/versions/${version}/validate`],
      ["POST", `/api/returns/${returnId}/versions/${version}/xml`],
      ["DELETE", `/api/returns/${returnId}`],
    ];

    for (const [method, path] of paths) {
      const response = await asUser(intruder, path, { method });
      expect(response.status, `${method} ${path} leaked another user's return`).toBe(404);
    }
  });

  it("does not let another user write a version onto the return", async () => {
    const owner = await signUp("writeowner@example.com");
    const intruder = await signUp("writeintruder@example.com");
    const { returnId } = await returnWithVersion(owner, fixture("clean-gir.xml"));

    const response = await asUser(intruder, `/api/returns/${returnId}/versions`, {
      method: "POST",
      body: { document: fixture("clean-gir.xml") },
    });

    expect(response.status).toBe(404);
  });

  it("answers 404 rather than 500 for an id that is not a uuid", async () => {
    const session = await signUp("baduuid@example.com");

    // Postgres rejects a malformed uuid at the cast, so without a check at the route
    // the driver error would surface as a server fault.
    expect((await asUser(session, "/api/returns/not-a-uuid")).status).toBe(404);
    expect((await asUser(session, "/api/returns/not-a-uuid/versions/1")).status).toBe(404);
  });
});
