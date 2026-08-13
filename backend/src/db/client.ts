import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

/**
 * One pool for the process.
 *
 * postgres.js pools by default. `prepare: false` is not set because nothing here runs
 * behind a transaction-mode pooler; if that changes it has to be, or prepared statements
 * will be reused across connections that never declared them.
 */
export const sql = postgres(env.DATABASE_URL);

export const db = drizzle(sql, { schema });

export type Database = typeof db;
