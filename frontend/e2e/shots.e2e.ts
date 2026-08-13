import { expect, test } from "@playwright/test";

/**
 * Captures each screen for review by eye.
 *
 * Not an assertion suite. The phase's oracle is looking at these, so the job here is to
 * produce them in the states worth looking at, including the ones a manual pass reaches
 * only by accident: the empty return, the open dialog, the open palette.
 */
const API = "http://localhost:3001";
const PASSWORD = "correct-horse-battery-staple";

test("capture", async ({ page, request }, info) => {
  const project = info.project.name;

  // Next injects a dev-only indicator that otherwise appears in the corner of every
  // capture and reads as part of the interface.
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.documentElement.appendChild(style);
  });

  const email = `shots-${project}-${Date.now()}@globe.test`;
  await request.post(`${API}/api/auth/register`, { data: { email, password: PASSWORD } });

  const shot = (name: string) =>
    page.screenshot({ path: `e2e/screenshots/${project}-${name}.png`, fullPage: true });

  await page.goto("/login");
  await shot("01-login");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/returns$/);
  await shot("02-returns-empty");

  await page.getByRole("button", { name: "New return" }).first().click();
  // Overlay and panel animate in; capture after they settle rather than mid-fade.
  await page.waitForTimeout(400);
  await shot("03-create-dialog");

  await page.getByLabel("Name").fill("FY2024 group return");
  await page.getByLabel("Reporting period").fill("2024-12-31");
  await page.getByLabel("MNE group").fill("Meridian Holdings");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/returns\/[0-9a-f-]{36}$/);
  await shot("04-return-empty");

  await page.getByRole("link", { name: "Versions" }).click();
  await shot("05-versions-empty");

  await page.goto("/returns");
  await shot("06-returns-list");

  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  await shot("07-palette");
  await page.keyboard.press("Escape");

  await page.goto("/reference");
  await shot("08-reference");

  /**
   * The redline surface, on a document with corrections in it.
   *
   * Captured from the rich fixture rather than the empty return above, because an empty
   * margin proves nothing about the surface this phase exists to build.
   */
  const created = await request.post(`${API}/api/returns`, {
    data: { name: "Meridian Industries FY2024", reportingPeriod: "2024-12-31" },
    headers: {
      cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; "),
    },
  });
  const returnId = (await created.json()).return.id;
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");

  const { readFileSync } = await import("node:fs");
  const document = readFileSync(
    new URL("../../engine/fixtures/rich-gir.xml", import.meta.url),
    "utf8",
  );

  await request.post(`${API}/api/returns/${returnId}/versions`, {
    data: { document, elections: { safeHarbourApplies: true, equityInclusionAmount: "125000" } },
    headers: { cookie },
  });
  await request.post(`${API}/api/returns/${returnId}/versions/1/validate`, { headers: { cookie } });

  await page.goto(`/returns/${returnId}`);
  // The disclosure animates open where a branch carries a correction.
  await page.waitForTimeout(500);
  await shot("09-return-margin");

  await page.goto(`/returns/${returnId}/xml`);
  await shot("10-xml-marked");

  // A second version, so the comparison has something to report.
  await request.post(`${API}/api/returns/${returnId}/versions`, {
    data: {
      document: document.replace(
        "<globe:ETRRate>0.1050</globe:ETRRate>",
        "<globe:ETRRate>0.1120</globe:ETRRate>",
      ),
    },
    headers: { cookie },
  });

  await page.goto(`/returns/${returnId}/versions`);
  await page.waitForTimeout(400);
  await shot("11-version-diff");
});
