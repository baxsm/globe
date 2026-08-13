import { readFileSync } from "node:fs";
import type { Hono } from "hono";
import { createApp } from "@/app";
import { db, sql } from "@/db/client";
import { errataApplications, returns, returnVersions, users, validationRuns } from "@/db/schema";
import type { AppEnv } from "@/lib/context";

/**
 * The suite runs against a real Postgres and a real engine.
 *
 * Nothing is mocked. The failure this phase guards against lives exactly at the
 * boundaries between engine, database and HTTP, and a mock at any of them removes the
 * boundary being tested. That is why these are integration tests rather than unit tests
 * with a fake `db`.
 */

export const app: Hono<AppEnv> = createApp();

/** Every table, cleared in foreign-key order. */
export const resetDatabase = async (): Promise<void> => {
  await db.delete(errataApplications);
  await db.delete(validationRuns);
  await db.delete(returnVersions);
  await db.delete(returns);
  await db.delete(users);
};

export const closeDatabase = async (): Promise<void> => {
  await sql.end();
};

export const fixture = (name: string): string =>
  readFileSync(new URL(`../../../engine/fixtures/${name}`, import.meta.url), "utf8");

interface Session {
  readonly cookie: string;
  readonly userId: string;
}

/**
 * Registers a user and keeps the session cookie.
 *
 * The cookie is read off the real `set-cookie` header rather than constructed, so a
 * change to how sessions are signed breaks these tests instead of passing under a
 * cookie the server would never have issued.
 */
export const signUp = async (email: string): Promise<Session> => {
  const response = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "a-sufficiently-long-password" }),
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie === null) throw new Error("register did not set a session cookie");

  const body = (await response.json()) as { user: { id: string } };

  return { cookie: setCookie.split(";")[0] ?? "", userId: body.user.id };
};

type Body = Record<string, unknown>;

/** A request carrying a session cookie. */
export const asUser = async (
  session: Session,
  path: string,
  init: { method?: string; body?: Body } = {},
): Promise<Response> => {
  const headers: Record<string, string> = { cookie: session.cookie };
  if (init.body !== undefined) headers["content-type"] = "application/json";

  return await app.request(path, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
};

export const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

/** A return with one saved version, which most tests need before anything interesting. */
export const returnWithVersion = async (
  session: Session,
  document: string,
): Promise<{ returnId: string; version: number }> => {
  const created = await json<{ return: { id: string } }>(
    await asUser(session, "/api/returns", {
      method: "POST",
      body: { name: "Test return", reportingPeriod: "2024-12-31" },
    }),
  );

  const saved = await json<{ version: { version: number } }>(
    await asUser(session, `/api/returns/${created.return.id}/versions`, {
      method: "POST",
      body: { document },
    }),
  );

  return { returnId: created.return.id, version: saved.version.version };
};
