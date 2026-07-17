import { expect, test } from "@playwright/test";

/**
 * Price calculator E2E (09_price_calculator: R1, R2, R3, R4, R10, R11).
 *
 * CREDENTIAL-GATED: requires .env.local plus
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD   — an existing EMPLOYEE
 * Tests skip when those vars are absent. The signed-out redirect needs no account.
 *
 * The calculator is STATELESS — it needs no seeded data and writes nothing, so the
 * flow drives it as an EMPLOYEE (proving R1's "no admin gating") through the
 * spec's worked example:
 *   2.50/h × 90 min + 30 g @ 450/kg + 20 g @ 500/kg = $27.25
 */

const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL;
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD;
const hasEmployee = Boolean(EMPLOYEE_EMAIL && EMPLOYEE_PASSWORD);

async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("signed-out users are redirected from /calculator to /login (R1)", async ({
  page,
}) => {
  await page.goto("/calculator");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("calculator flow", () => {
  test.skip(
    !hasEmployee,
    "Set E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD to run.",
  );

  test("an EMPLOYEE reaches /calculator from the nav link (R1)", async ({
    page,
  }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await page.goto("/board");

    // The link is visible to a NON-admin — it is not inside the admin block.
    await page.getByRole("link", { name: "Calculator" }).click();
    await expect(page).toHaveURL(/\/calculator/);
    await expect(
      page.getByRole("heading", { name: "Price calculator" }),
    ).toBeVisible();
  });

  test("the worked example totals $27.25 with a full breakdown (R2, R3, R4, R10, R11)", async ({
    page,
  }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await page.goto("/calculator");

    await page.getByLabel("Power price per hour").fill("2.50");
    await page.getByLabel("Print time (minutes)").fill("90");

    // Row 1: 30 g @ $450/kg → 13.50
    await page.getByLabel("Grams used (row 1)").fill("30");
    await page.getByLabel("Price per kg (row 1)").fill("450");

    // Row 2: 20 g @ $500/kg → 10.00
    await page.getByRole("button", { name: "Add filament row" }).click();
    await page.getByLabel("Grams used (row 2)").fill("20");
    await page.getByLabel("Price per kg (row 2)").fill("500");

    // R4: the breakdown re-derived client-side, with no navigation.
    await expect(page.getByTestId("electricity-cost")).toContainText("3.75");
    await expect(page.getByTestId("filament-subtotal")).toContainText("23.50");
    await expect(page.getByTestId("total-cost")).toContainText("27.25");

    // R10: pick a color if the catalog has one — its line renders with a swatch.
    const colorSelect = page.getByLabel("Color (row 1)");
    const colorOptions = await colorSelect.locator("option").count();
    if (colorOptions > 1) {
      await colorSelect.selectOption({ index: 1 });
      await expect(
        page.getByTestId("filament-lines").locator("span[aria-hidden='true']"),
      ).not.toHaveCount(0);
    }

    // R11: nothing is saved — a reload returns a fresh, empty calculator.
    await page.reload();
    await expect(page.getByTestId("total-cost")).toContainText("0.00");
  });
});
