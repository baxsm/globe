import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "@/env";
import { logger } from "@/lib/logger";

/**
 * Applies the generated migrations.
 *
 * A dedicated single connection rather than the shared pool: DDL has to run in order,
 * and a pool would spread the statements across connections.
 */
const run = async (): Promise<void> => {
  const client = postgres(env.DATABASE_URL, { max: 1 });

  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    logger.info("db.migrate", "migrations applied");
  } finally {
    await client.end();
  }
};

await run();
