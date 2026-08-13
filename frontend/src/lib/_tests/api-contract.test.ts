import { describe, expect, it } from "vitest";
import { api } from "../api";

/**
 * The response types in `api.ts` are written by hand, so a field renamed in the backend
 * compiles here and fails in the browser. These run against a live server and assert the
 * shapes the components actually read.
 *
 * Skipped when nothing is listening, so the unit suite stays runnable offline. Point
 * `NEXT_PUBLIC_API_URL` at a running backend to exercise them.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const PASSWORD = "correct-horse-battery-staple";

const reachable = await fetch(`${API}/api/auth/me`)
  .then(() => true)
  .catch(() => false);

/**
 * Everything but `/api/auth` sits behind the guard, so the reads need a session. The
 * cookie is passed explicitly rather than relying on a jar, which is the same path a
 * Server Component takes.
 */
const signIn = async (): Promise<string> => {
  const response = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `contract-${Date.now()}@globe.test`, password: PASSWORD }),
  });

  const cookie = response.headers.get("set-cookie");
  if (cookie === null) throw new Error("register did not set a session cookie");
  return cookie.split(";")[0] ?? "";
};

const live = reachable ? describe : describe.skip;

live("api contract", () => {
  it("reference schema carries the pinned versions and three files", async () => {
    const schema = await api.referenceSchema(await signIn());

    expect(typeof schema.schemaVersion).toBe("string");
    expect(typeof schema.guidanceVersion).toBe("string");
    expect(typeof schema.guidanceApproved).toBe("string");
    expect(schema.files).toHaveLength(3);

    for (const file of schema.files) {
      expect(typeof file.name).toBe("string");
      expect(typeof file.bytes).toBe("number");
    }
  });

  it("reference issues carry all fourteen with the fields the page reads", async () => {
    const { issues } = await api.referenceIssues(await signIn());

    expect(issues).toHaveLength(14);

    for (const issue of issues) {
      expect(typeof issue.number).toBe("number");
      expect(typeof issue.title).toBe("string");
      expect(typeof issue.paragraph).toBe("string");
      expect(typeof issue.summary).toBe("string");
      expect(["substitution", "augmentation", "suppression", "coercion"]).toContain(issue.kind);
      // Null where the issue disapplies no numbered rule. `undefined` would mean the
      // field was renamed, and the reference page counts on the difference.
      expect(issue.validationRule === null || typeof issue.validationRule === "number").toBe(true);
    }
  });

  it("reports the four disapplied rules the reference page counts", async () => {
    const { issues } = await api.referenceIssues(await signIn());
    const disapplied = issues.filter((issue) => issue.validationRule !== null);

    expect(disapplied).toHaveLength(4);
    expect(disapplied.map((issue) => issue.validationRule).sort()).toEqual([
      60025, 60026, 70028, 70092,
    ]);
  });

  it("rejects an unauthenticated read with a 401 the shell redirects on", async () => {
    await expect(api.listReturns()).rejects.toMatchObject({ status: 401 });
  });

  it("answers a bad login with the uniform error body", async () => {
    await expect(api.login(`missing-${Date.now()}@globe.test`, PASSWORD)).rejects.toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
    });
  });
});
