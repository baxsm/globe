import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "@/lib/context";
import { ApiError } from "@/lib/error";
import { clearSession, readSession, setSession } from "@/lib/session";
import { validate } from "@/lib/validate";
import { findUser, registerUser, verifyCredentials } from "@/services/auth-service";

const credentials = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(12, "Use at least 12 characters"),
});

/**
 * These routes are the only ones outside `requireAuth`.
 *
 * `/me` is here rather than under the guard on purpose: it answers "is anyone signed in"
 * and has to be callable when the answer is no, otherwise the frontend cannot tell an
 * expired session from a network failure.
 */
export const authRoutes = new Hono<AppEnv>()
  .post("/register", validate("json", credentials), async (c) => {
    const { email, password } = c.req.valid("json");
    const user = await registerUser(email, password);

    await setSession(c, user.id);
    return c.json({ user }, 201);
  })
  .post("/login", validate("json", credentials), async (c) => {
    const { email, password } = c.req.valid("json");
    const user = await verifyCredentials(email, password);

    // One message for both an unknown address and a wrong password, so the response
    // cannot be used to find out which addresses have accounts.
    if (user === null) throw new ApiError("UNAUTHORIZED", "Email or password is incorrect");

    await setSession(c, user.id);
    return c.json({ user });
  })
  .post("/logout", (c) => {
    clearSession(c);
    return c.json({ ok: true });
  })
  .get("/me", async (c) => {
    const userId = await readSession(c);
    if (userId === null) return c.json({ user: null });

    // A session can outlive the user it names, if the account was deleted. Reading the
    // row rather than trusting the cookie means that returns null instead of a ghost.
    return c.json({ user: await findUser(userId) });
  });
