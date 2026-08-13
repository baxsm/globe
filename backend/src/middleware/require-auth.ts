import { createMiddleware } from "hono/factory";
import type { AppEnv } from "@/lib/context";
import { ApiError } from "@/lib/error";
import { readSession } from "@/lib/session";

/**
 * Rejects anything without a valid session.
 *
 * Applied to `/api/*` as a whole and lifted only for `/api/auth/*`, so a route added
 * later is protected by default. The opposite arrangement, listing the protected paths,
 * leaves a new route open until someone remembers to add it.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const userId = await readSession(c);

  if (userId === null) {
    throw new ApiError("UNAUTHORIZED", "Sign in to continue");
  }

  c.set("userId", userId);
  await next();
});
