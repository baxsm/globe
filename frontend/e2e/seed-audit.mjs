/**
 * Seeds the fixture `audit.e2e.ts` measures against.
 *
 * The audit has to run over a return that actually carries corrections. Pointed at an
 * empty account it measures the empty state and reports a clean sweep, which is how a
 * document surface ships unexamined: the checks pass because there is nothing on screen
 * to fail them.
 *
 * Run it before the audit spec:
 *   node ./e2e/seed-audit.mjs
 *   npx playwright test audit.e2e.ts
 *
 * Writes `e2e/.audit-fixture.json`, which is gitignored: it holds a session cookie and
 * ids that only exist in one local database.
 */
import { readFileSync, writeFileSync } from "node:fs";

const API = process.env.E2E_API_URL ?? "http://localhost:3001";
const PASSWORD = "correct-horse-battery-staple";
const FIXTURE = new URL("../../engine/fixtures/rich-gir.xml", import.meta.url);

/**
 * The four elections, all stated.
 *
 * Issues 2, 4, 6 and 7 cannot be read off a document and fire only when the filer
 * declares them, so a fixture that leaves them out exercises nine rules rather than
 * thirteen and the margin renders a fraction of what it should.
 */
const ELECTIONS = {
  article712BasisIndices: [0],
  safeHarbourApplies: true,
  equityInclusionAmount: "48120000",
  unclaimedAccrualAnnualTins: ["NL856214997B01"],
};

let cookie = "";

const call = async (path, options = {}) => {
  const response = await fetch(`${API}/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie === "" ? {} : { Cookie: cookie }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie !== null) cookie = setCookie.split(";")[0];

  const text = await response.text();
  const body = text.length === 0 ? null : JSON.parse(text);

  if (!response.ok) {
    throw new Error(`${path} answered ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
  }

  return body;
};

const document = readFileSync(FIXTURE, "utf8");
const email = `audit-${Date.now()}@local.test`;

await call("/auth/register", { method: "POST", body: { email, password: PASSWORD } });

const created = await call("/returns", {
  method: "POST",
  body: {
    name: "FY2024 Meridian Industries",
    mneGroupName: "Meridian Industries",
    reportingPeriod: "2024-12-31",
  },
});
const id = created.return.id;

// Two versions, and the richer one saved last. The document page reads the latest, so
// saving the fully elected version first leaves the audit measuring the poorer one.
const first = await call(`/returns/${id}/versions`, {
  method: "POST",
  body: { document, elections: { safeHarbourApplies: false } },
});
await call(`/returns/${id}/versions/${first.version.version}/validate`, { method: "POST" });

const latest = await call(`/returns/${id}/versions`, {
  method: "POST",
  body: { document, elections: ELECTIONS },
});
const version = latest.version.version;

const validated = await call(`/returns/${id}/versions/${version}/validate`, { method: "POST" });
await call(`/returns/${id}/versions/${version}/xml`, { method: "POST" });

// A second return with nothing saved, so the audit covers the empty document state too.
const second = await call("/returns", {
  method: "POST",
  body: {
    name: "FY2023 Meridian Industries",
    mneGroupName: "Meridian Industries",
    reportingPeriod: "2023-12-31",
  },
});

writeFileSync(
  new URL("./.audit-fixture.json", import.meta.url),
  `${JSON.stringify({ email, password: PASSWORD, id, version, secondId: second.return.id, cookie }, null, 2)}\n`,
);

console.log(
  `seeded ${email}: v${version} with ${validated.errata.length} errata applications, ` +
    `${validated.run.suppressions.length} suppressions, ${validated.run.findings.length} findings`,
);
