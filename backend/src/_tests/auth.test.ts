import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";
import { app, asUser, closeDatabase, json, resetDatabase, signUp } from "./helpers";

beforeEach(resetDatabase);
afterAll(closeDatabase);

const register = async (email: string, password: string): Promise<Response> =>
  await app.request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

describe("password hashing", () => {
  it("verifies a password against its own hash", async () => {
    const stored = await hashPassword("a-sufficiently-long-password");
    expect(await verifyPassword("a-sufficiently-long-password", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("a-sufficiently-long-password");
    expect(await verifyPassword("something-else-entirely", stored)).toBe(false);
  });

  it("produces a different hash each time, so equal passwords are not equal hashes", async () => {
    const first = await hashPassword("a-sufficiently-long-password");
    const second = await hashPassword("a-sufficiently-long-password");
    expect(first).not.toBe(second);
  });

  it("never stores the password itself", async () => {
    const stored = await hashPassword("a-sufficiently-long-password");
    expect(stored).not.toContain("a-sufficiently-long-password");
  });

  it("returns false for a corrupted stored value rather than throwing", async () => {
    // A damaged row must not authenticate anyone, and must not take the login route
    // down either.
    expect(await verifyPassword("anything", "not-a-real-hash")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});

describe("registration", () => {
  it("creates an account and starts a session", async () => {
    const response = await register("new@example.com", "a-sufficiently-long-password");

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("globe_session=");
  });

  it("rejects a short password", async () => {
    const response = await register("short@example.com", "tiny");
    const body = await json<{ error: { code: string; message: string } }>(response);

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.message).toBe("Use at least 12 characters");
  });

  it("rejects an invalid email", async () => {
    const response = await register("not-an-email", "a-sufficiently-long-password");
    expect(response.status).toBe(400);
  });

  it("rejects a duplicate email", async () => {
    await register("taken@example.com", "a-sufficiently-long-password");
    const response = await register("taken@example.com", "a-sufficiently-long-password");

    expect(response.status).toBe(409);
  });

  it("treats email as case-insensitive, so one address is one account", async () => {
    await register("Mixed@Example.com", "a-sufficiently-long-password");
    const response = await register("mixed@example.com", "a-sufficiently-long-password");

    expect(response.status).toBe(409);
  });
});

describe("login", () => {
  it("accepts the right password", async () => {
    await register("known@example.com", "a-sufficiently-long-password");

    const response = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "known@example.com",
        password: "a-sufficiently-long-password",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("globe_session=");
  });

  it("gives the same answer for a wrong password and an unknown address", async () => {
    await register("known@example.com", "a-sufficiently-long-password");

    const wrongPassword = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "known@example.com", password: "the-wrong-password-here" }),
    });
    const unknownEmail = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "the-wrong-password-here" }),
    });

    // Different answers here would let anyone enumerate which addresses have accounts.
    expect(wrongPassword.status).toBe(unknownEmail.status);
    expect(await wrongPassword.text()).toBe(await unknownEmail.text());
  });
});

describe("sessions", () => {
  it("reports no user when nobody is signed in", async () => {
    const body = await json<{ user: null }>(await app.request("/api/auth/me"));
    expect(body.user).toBeNull();
  });

  it("reports the signed-in user", async () => {
    const session = await signUp("me@example.com");
    const body = await json<{ user: { email: string } }>(await asUser(session, "/api/auth/me"));

    expect(body.user.email).toBe("me@example.com");
  });

  it("rejects a cookie that was not signed by this server", async () => {
    const session = await signUp("signed@example.com");

    // The user id is real; only the signature is missing. Without one, a cookie is a
    // plain claim of identity that anyone can write.
    const response = await app.request("/api/returns", {
      headers: { cookie: `globe_session=${session.userId}` },
    });

    expect(response.status).toBe(401);
  });

  /**
   * Logout clears the cookie in the browser. It does not revoke it.
   *
   * The session is a signed value rather than a row, so a cookie captured before
   * logout still verifies afterwards. That is a real property of this design and it is
   * asserted rather than glossed over: revocation needs server-side session state,
   * which a single-user product with no device list does not currently carry. If that
   * changes, this test is what will fail and say so.
   */
  it("clears the cookie on logout, and the signed value itself stays verifiable", async () => {
    const session = await signUp("logout@example.com");

    const response = await asUser(session, "/api/auth/logout", { method: "POST" });
    expect(response.headers.get("set-cookie")).toContain("globe_session=;");

    expect((await asUser(session, "/api/returns")).status).toBe(200);
  });
});

describe("protected routes", () => {
  const paths = ["/api/returns", "/api/reference/schema", "/api/reference/issues"];

  it("rejects an anonymous request to every protected route", async () => {
    for (const path of paths) {
      const response = await app.request(path);
      expect(response.status, `${path} was reachable anonymously`).toBe(401);
    }
  });

  it("returns the documented error shape when unauthenticated", async () => {
    const body = await json<{ error: { code: string; message: string } }>(
      await app.request("/api/returns"),
    );

    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("leaves the auth routes reachable", async () => {
    expect((await app.request("/api/auth/me")).status).toBe(200);
  });
});
