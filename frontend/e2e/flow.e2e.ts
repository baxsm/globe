import { expect, test } from "@playwright/test";

/**
 * The flow a filer actually performs, in a real browser.
 *
 * The account is created through the API rather than the UI because there is no
 * registration screen: the product is single-user and the account exists before anyone
 * opens it. Each run uses its own email so the suite can be run repeatedly against the
 * same database without a reset step.
 */
const API = process.env.E2E_API_URL ?? "http://localhost:3001";
const PASSWORD = "correct-horse-battery-staple";

const uniqueEmail = (project: string) => `e2e-${project}-${Date.now()}@globe.test`;

test.describe("returns", () => {
  let email: string;

  test.beforeEach(async ({ request }, testInfo) => {
    email = uniqueEmail(testInfo.project.name);

    const response = await request.post(`${API}/api/auth/register`, {
      data: { email, password: PASSWORD },
    });

    expect(response.ok()).toBe(true);
  });

  test("signs in, creates a return, and navigates the shell", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/returns$/);
    await expect(page.getByRole("heading", { name: "Returns" })).toBeVisible();
    await expect(page.getByText("No returns yet.")).toBeVisible();

    // Two controls carry this label: the header action and the empty state's own copy.
    // The header one is what a filer with existing returns uses, so the test drives that.
    await page.getByRole("button", { name: "New return" }).first().click();
    await page.getByLabel("Name").fill("FY2024 group return");
    await page.getByLabel("Reporting period").fill("2024-12-31");
    await page.getByRole("button", { name: "Create" }).click();

    // Creating navigates straight into the return it just made.
    await expect(page).toHaveURL(/\/returns\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "FY2024 group return" })).toBeVisible();
    await expect(page.getByText("No document saved yet.")).toBeVisible();

    await page.getByRole("link", { name: "Versions" }).click();
    await expect(page).toHaveURL(/\/versions$/);
    await expect(page.getByText("No versions saved yet.")).toBeVisible();

    await page.getByRole("link", { name: "Reference" }).click();
    await expect(page).toHaveURL(/\/reference$/);

    // The count the guidance actually states. Counting the suppression kind gives five.
    await expect(
      page.getByText("4 of these are validation rules that must not be applied."),
    ).toBeVisible();
    await expect(page.getByText("Rule 60025 not applied")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("rejects a wrong password without navigating", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Next renders its own `role="alert"` route announcer, so the form's alert is
    // addressed by its text rather than by the role alone.
    await expect(page.getByText("Email or password is incorrect")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("sends a signed-out visitor to login", async ({ page }) => {
    await page.goto("/returns");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("never scrolls the page horizontally", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/returns$/);

    /**
     * The check every layout defect in this project has shown up as.
     *
     * A row that overflows its container widens the document rather than erroring, so
     * nothing fails until someone looks at it on a narrow screen. Asserting the
     * document is no wider than the viewport catches it on every page instead.
     */
    for (const path of ["/returns", "/reference"]) {
      await page.goto(path);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      // Names the offending element rather than only the pixel count, because the
      // number alone does not say which row to fix.
      if (overflow > 0) {
        const widest = await page.evaluate(() => {
          const limit = document.documentElement.clientWidth;
          return [...document.querySelectorAll<HTMLElement>("*")]
            .filter((el) => el.getBoundingClientRect().right > limit + 1)
            .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`)
            .slice(0, 5);
        });
        expect(overflow, `${path} scrolls horizontally; widest: ${widest.join(" | ")}`).toBe(0);
      }

      expect(overflow, `${path} scrolls horizontally`).toBeLessThanOrEqual(0);
    }
  });
});
