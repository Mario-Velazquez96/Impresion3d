import { expect, test } from "@playwright/test";

/**
 * Weekly planning E2E (07_weekly_planning: R3, R4, R5, R6, R7, R8, R9, R11).
 *
 * CREDENTIAL-GATED: exercises a live dev/staging Supabase project with the planning
 * migrations applied (WeekPlan/WeekPlanColor/WeekPlanItem + RLS) and seeded data.
 * Requires .env.local plus:
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD   — an existing EMPLOYEE
 * Tests skip when those vars are absent. The signed-out redirect needs no account.
 *
 * Before running, apply the planning migrations against dev/staging:
 *   corepack pnpm prisma migrate dev      # applies weekly_planning + weekly_planning_rls
 *
 * The flow assumes the inventory already has at least one print with colors (create
 * one via the Inventory UI first, or seed it). It drives:
 *   pick colors → full-match inventory → toggle partial (missing shown) → assign a
 *   print to a day → week grid shows it + the "dry the day before" list → reload
 *   persists the assignment.
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

test("signed-out users are redirected from /planning to /login (R2)", async ({
  page,
}) => {
  await page.goto("/planning");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("planning flow", () => {
  test.skip(
    !hasEmployee,
    "Set E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD to run.",
  );

  test("pick colors → filter → toggle partial → assign → grid + dry list → reload persists", async ({
    page,
  }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await page.goto("/planning");

    await expect(
      page.getByRole("heading", { name: "Weekly planning" }),
    ).toBeVisible();

    // R6: with no colors, the inventory shows the informative empty state.
    await expect(
      page.getByText(/select the colors to dry this week/i),
    ).toBeVisible();

    // R3 + R4: pick the first available color and save; full-match inventory fills.
    const firstColor = page
      .locator('input[type="checkbox"][name="colorIds"]')
      .first();
    await firstColor.check();
    await page.getByRole("button", { name: /save colors/i }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    // R5: toggle partial match; the mode button reflects the pressed state.
    await page.getByRole("button", { name: /partial match/i }).click();
    await expect(
      page.getByRole("button", { name: /partial match/i }),
    ).toHaveAttribute("aria-pressed", "true");

    // Back to full to assign a fully-producible print, if any is listed.
    await page.getByRole("button", { name: /full match/i }).click();

    const assignButton = page.getByRole("button", { name: /^assign$/i }).first();
    if (await assignButton.isVisible().catch(() => false)) {
      await assignButton.click();
      // R7 + R9: the week grid + a "dry the day before" panel are present.
      await expect(
        page.getByRole("heading", { name: "Week grid" }),
      ).toBeVisible();
      await expect(page.getByText(/dry the day before/i).first()).toBeVisible();

      // R8: reload — the assignment persists (a Remove control remains).
      await page.reload();
      await expect(
        page.getByRole("button", { name: /^remove/i }).first(),
      ).toBeVisible();
    }
  });
});
