import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { ApiError } from "@/lib/error";
import { hashPassword, verifyPassword } from "@/lib/password";

export const registerUser = async (email: string, password: string) => {
  const normalized = email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  if (existing !== undefined) {
    throw new ApiError("CONFLICT", "An account with that email already exists");
  }

  const [created] = await db
    .insert(users)
    .values({ email: normalized, passwordHash: await hashPassword(password) })
    .returning({ id: users.id, email: users.email });

  if (created === undefined) throw new Error("insert into users returned no row");
  return created;
};

/**
 * Verifies a password, returning the user or null.
 *
 * An unknown email and a wrong password both return null and the route reports the same
 * message for each. Distinguishing them would let anyone enumerate which addresses have
 * accounts.
 */
export const verifyCredentials = async (email: string, password: string) => {
  const normalized = email.trim().toLowerCase();

  const [found] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  if (found === undefined) return null;

  const valid = await verifyPassword(password, found.passwordHash);
  if (!valid) return null;

  return { id: found.id, email: found.email };
};

export const findUser = async (userId: string) => {
  const [found] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return found ?? null;
};
