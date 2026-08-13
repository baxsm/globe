import { Hono } from "hono";
import type { AppEnv } from "@/lib/context";
import {
  GUIDANCE_APPROVED,
  GUIDANCE_VERSION,
  ISSUES,
  SCHEMA_FILES,
  SCHEMA_VERSION,
} from "@/lib/reference";

/**
 * What the engine is validating against, so the UI can state it rather than imply it.
 *
 * A filer looking at a finding needs to know which schema and which guidance produced
 * it, especially once a second revision exists and two returns are being read under
 * different versions.
 */
export const referenceRoutes = new Hono<AppEnv>()
  .get("/schema", (c) =>
    c.json({
      schemaVersion: SCHEMA_VERSION,
      guidanceVersion: GUIDANCE_VERSION,
      guidanceApproved: GUIDANCE_APPROVED,
      files: SCHEMA_FILES,
    }),
  )
  .get("/issues", (c) => c.json({ issues: ISSUES }));
