/**
 * Points the suite at the test database before anything imports the client.
 *
 * `resetDatabase` truncates every table, so running against the development database
 * would delete real work. The URL is overridden here rather than in a shell script so
 * that is true however the suite is started.
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://globe:globe@localhost:5433/globe_test";

process.env.NODE_ENV = "test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-chars";
