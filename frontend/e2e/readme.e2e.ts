import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * The README images, captured from the running application.
 *
 * Separate from `shots.e2e.ts`, which exists for review by eye and captures every state
 * including the empty ones. These are the four a reader sees first, so they are framed
 * rather than full-page, and the account is named like a filer's rather than like a test
 * fixture: the signed-in address is on screen in every one of them.
 *
 * Run with `npx playwright test readme --project=desktop`.
 */
const API = "http://localhost:3001";
const PASSWORD = "correct-horse-battery-staple";
const OUT = "public/readme";

test("readme", async ({ page, request }) => {
  test.skip(test.info().project.name !== "desktop", "README images are captured at desktop width");

  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.documentElement.appendChild(style);
  });

  const email = "filings@meridian.example";
  await request.post(`${API}/api/auth/register`, { data: { email, password: PASSWORD } });

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/returns$/);

  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

  const created = await request.post(`${API}/api/returns`, {
    data: {
      name: "Meridian Industries FY2024",
      reportingPeriod: "2024-12-31",
      mneGroupName: "Meridian Industries SA",
    },
    headers: { cookie },
  });
  const returnId = (await created.json()).return.id;

  const document = readFileSync(
    new URL("../../engine/fixtures/rich-gir.xml", import.meta.url),
    "utf8",
  );

  // Every election stated, so the four rules that cannot be read off the document all
  // fire. Without them the margin is missing issues 2, 4, 6 and 7.
  await request.post(`${API}/api/returns/${returnId}/versions`, {
    data: {
      document,
      elections: {
        safeHarbourApplies: true,
        equityInclusionAmount: "1250000",
        article712BasisIndices: [0],
        unclaimedAccrualAnnualTins: ["FR8291046", "DE5520117"],
      },
    },
    headers: { cookie },
  });
  await request.post(`${API}/api/returns/${returnId}/versions/1/validate`, { headers: { cookie } });

  const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });

  // The hero. Scrolled to where the document, the three ink roles and the margin are all
  // on screen at once; the top of the page is chrome and an explanation, not the product.
  await page.goto(`/returns/${returnId}`);
  await page.waitForTimeout(600);
  // Landed on the ETR computation, where several corrections sit close together. Higher
  // up the tree the rows are sparse and one annotation leaves the margin mostly empty.
  await page.evaluate(() => window.scrollTo(0, 2100));
  await page.waitForTimeout(400);
  await shot("redline");

  // The suppressions, which are the half of the thesis the redline does not carry.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await shot("suppressions");

  await page.goto(`/returns/${returnId}/xml`);
  await page.waitForTimeout(500);
  // Step to the first marked line so the export shows a correction rather than a preamble.
  await page.getByRole("button", { name: "Next correction" }).click();
  await page.waitForTimeout(500);
  await shot("export");

  await page.goto("/reference");
  await page.waitForTimeout(400);
  await shot("reference");
});
