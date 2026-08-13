import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { env, isProduction } from "@/env";

/**
 * The session is a signed cookie holding the user id.
 *
 * Signed rather than opaque-with-a-table because there is one user and no revocation
 * story to build: nothing here needs to invalidate a session from another device. The
 * signature is what stops the id being edited to another user's; without it the cookie
 * would be a plain claim of identity.
 */
const COOKIE_NAME = "globe_session";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

export const setSession = async (c: Context, userId: string): Promise<void> => {
  await setSignedCookie(c, COOKIE_NAME, userId, env.SESSION_SECRET, {
    httpOnly: true,
    // Set only in production: a secure cookie is dropped over plain http, so setting it
    // in development silently produces a login that never persists.
    secure: isProduction,
    sameSite: "Lax",
    path: "/",
    maxAge: THIRTY_DAYS_IN_SECONDS,
  });
};

/**
 * The user id from the cookie, or null.
 *
 * `getSignedCookie` returns `false` when the signature does not verify, which is a
 * tampered cookie rather than an absent one. Both mean no session, and neither is worth
 * telling the client apart.
 */
export const readSession = async (c: Context): Promise<string | null> => {
  const value = await getSignedCookie(c, env.SESSION_SECRET, COOKIE_NAME);
  return typeof value === "string" && value.length > 0 ? value : null;
};

export const clearSession = (c: Context): void => {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
};
