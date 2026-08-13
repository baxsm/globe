import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, api, type User } from "./api";

/**
 * The session as a Server Component sees it.
 *
 * There is no ambient cookie jar in a server fetch, so the header is read from
 * `next/headers` and passed through explicitly. `cookies()` is async in Next 16; the
 * synchronous form no longer merely warns, it fails.
 */
export const sessionCookie = async (): Promise<string> => {
  const store = await cookies();
  return store
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
};

/**
 * The signed-in user, or null.
 *
 * A network failure is deliberately not treated as "signed out". Answering null when
 * the API is unreachable would bounce the user to the login page, where signing in also
 * fails, which reads as a rejected password rather than as a backend that is down.
 */
export const currentUser = async (): Promise<User | null> => {
  try {
    const { user } = await api.me(await sessionCookie());
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) return null;
    throw error;
  }
};

/** Guards an authenticated page, sending anyone without a session to the login screen. */
export const requireUser = async (): Promise<User> => {
  const user = await currentUser();
  if (user === null) redirect("/login");
  return user;
};
