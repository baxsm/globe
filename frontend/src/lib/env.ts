import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * The backend origin is needed in two places that resolve it differently.
 *
 * The browser reaches the API across the public origin, so that value has to be
 * bundled and is `NEXT_PUBLIC_`. A Server Component reaches the same API from inside
 * the network, which can be a different address entirely. Keeping them as separate
 * variables means a deployment where those two differ does not have to fight the
 * client bundle to say so.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    INTERNAL_API_URL: z.url().optional(),
  },
  client: {
    NEXT_PUBLIC_API_URL: z.url().default("http://localhost:3001"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    INTERNAL_API_URL: process.env.INTERNAL_API_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  // `next build` runs this module during static analysis, where nothing is set.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  emptyStringAsUndefined: true,
});
