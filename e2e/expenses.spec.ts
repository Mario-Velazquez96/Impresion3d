import { expect, test } from "@playwright/test";

/**
 * Expense tracking E2E (R3, R4, R5, R6, R7).
 *
 * CREDENTIAL-GATED: these flows exercise a live dev/staging Supabase project and
 * seeded accounts. They require .env.local plus:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD        — an existing ADMIN
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD   — an existing EMPLOYEE
 * Tests skip when those vars are absent. The signed-out redirect needs no account.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL;
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD;

const hasAdmin = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);
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

/** Ensure a SupplyType exists via the catalogs UI; returns its name. */
async function ensureSupplyType(
  page: import("@playwright/test").Page,
): Promise<string> {
  const name = `e2e-supply-${Date.now()}`;
  await page.goto("/admin/catalogs");
  await page.getByRole("tab", { name: "Supply types" }).click();
  await page.getByRole("button", { name: "Add supply type" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  return name;
}

test("signed-out access to /expenses redirects to /login (R2)", async ({
  page,
}) => {
  await page.goto("/expenses");
  await expect(page).toHaveURL(/\/login$/);
});

test("admin records, edits, and deletes an expense (R3, R4, R5, R6)", async ({
  page,
}) => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run.");

  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  const supplyType = await ensureSupplyType(page);

  const reason = `e2e-reason-${Date.now()}`;
  await page.goto("/expenses");

  // Record (R3) — appears at the TOP of the date-desc list (R6) with formatted
  // MXN currency.
  await page.getByRole("button", { name: "New expense" }).click();
  const dialog = page.getByRole("dialog", { name: "New expense" });
  await dialog.getByLabel("Cost").fill("12.50");
  await dialog.getByLabel("Reason").fill(reason);
  await dialog.getByLabel("Date").fill("2026-06-15");
  await dialog.getByLabel("Supply type").selectOption({ label: supplyType });
  await dialog
    .getByLabel("Purchase link (optional)")
    .fill("https://example.com/cart");
  await dialog.getByRole("button", { name: "Create" }).click();

  const row = page.locator("tr", { hasText: reason });
  await expect(row).toBeVisible();
  await expect(row).toContainText("$12.50");
  await expect(row.getByRole("link", { name: "Link" })).toBeVisible();
  // Most recent first: the newly recorded row is in the first body row.
  await expect(page.locator("tbody tr").first()).toContainText(reason);

  // Edit (R4)
  await row.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit expense" });
  await editDialog.getByLabel("Cost").fill("99.99");
  await editDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("tr", { hasText: reason })).toContainText("$99.99");

  // Delete (R5 — admin)
  await page
    .locator("tr", { hasText: reason })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByText(reason, { exact: true })).toHaveCount(0);
});

test("employee can record but sees no delete control (R7)", async ({ page }) => {
  test.skip(
    !hasEmployee,
    "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.",
  );

  await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
  await page.goto("/expenses");

  // The Expenses page is reachable by an employee (R2 allows any authenticated
  // user), and no Delete button is rendered for the non-admin viewer (R7).
  await expect(page.getByRole("button", { name: "New expense" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});
