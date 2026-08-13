import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * The session secret has no default.
 *
 * A fallback value would mean a deployment that forgot to set it still boots, signing
 * every session cookie with a constant that is in the source history. Failing at startup
 * is the only safe behaviour.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export const isProduction = env.NODE_ENV === "production";
