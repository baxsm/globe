import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;

if (url === undefined || url.length === 0) {
  throw new Error("DATABASE_URL is required to generate or apply migrations");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
