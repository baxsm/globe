import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/_tests/**/*.test.ts"],
    environment: "node",
    /**
     * The XSD conformance cases shell out to libxml2 through a Python subprocess, and a
     * cold process spawn on Windows costs seconds on its own. The default 5s ceiling made
     * those cases fail about one run in three, which reads as a broken rule rather than a
     * slow interpreter. Raised rather than reduced in number: each of those assertions is
     * the independent oracle the whole errata layer is checked against.
     */
    testTimeout: 30_000,
  },
});
