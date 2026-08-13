import { defineConfig, devices } from "@playwright/test";

/**
 * The e2e suite runs against an already-running stack.
 *
 * `webServer` is deliberately not configured: the backend needs Postgres and the engine
 * on the same machine, so a Playwright-managed frontend alone would start and then fail
 * every request. Running both services first and pointing at them keeps a failure here
 * meaning "the app is broken" rather than "the harness could not boot it".
 */
export default defineConfig({
  testDir: "./e2e",
  // The suite names files `*.e2e.ts`, which the default `*.spec.ts` glob does not match.
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI === "true" ? "line" : "list",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
