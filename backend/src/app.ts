import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { env } from "@/env";
import type { AppEnv } from "@/lib/context";
import { ApiError, ERROR_STATUS, errorBody, sanitizeErrorMessage } from "@/lib/error";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/middleware/require-auth";
import { authRoutes } from "@/routes/auth";
import { referenceRoutes } from "@/routes/reference";
import { returnRoutes } from "@/routes/returns";

export const createApp = () => {
  const app = new Hono<AppEnv>();

  app.use(
    "/api/*",
    cors({
      origin: env.FRONTEND_URL,
      // The session is a cookie, so the browser only sends it when credentials are
      // allowed and the origin is stated exactly. A wildcard origin silently drops it.
      credentials: true,
    }),
  );

  // Auth mounts before the guard, everything else after it. A route added later is
  // protected unless someone deliberately puts it above this line.
  app.route("/api/auth", authRoutes);

  app.use("/api/*", requireAuth);

  app.route("/api/returns", returnRoutes);
  app.route("/api/reference", referenceRoutes);

  app.get("/health", (c) => c.json({ ok: true }));

  app.notFound((c) => c.json(errorBody("NOT_FOUND", "No such route"), 404));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json(errorBody(error.code, error.message, error.details), ERROR_STATUS[error.code]);
    }

    if (error instanceof HTTPException) {
      return c.json(errorBody("BAD_REQUEST", error.message), error.status);
    }

    // Anything else is unexpected. The message is logged in full and never returned:
    // a Postgres error carries the failing statement, and its parameters are the
    // contents of a filer's return.
    logger.error("app.unhandled", error);
    return c.json(errorBody("INTERNAL", sanitizeErrorMessage(error)), 500);
  });

  return app;
};
