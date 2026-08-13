import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@globe/engine": fileURLToPath(new URL("../engine/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/_tests/**/*.test.ts"],
    environment: "node",
    // Runs before any module is imported, so the database client is constructed
    // against the test database rather than whatever `.env` happens to hold.
    setupFiles: ["./src/_tests/setup.ts"],
    // The suite runs against one real Postgres database. Parallel files would race on
    // the same tables, so a failure would depend on scheduling rather than on the code.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
