import { expect, test } from "@playwright/test";

/**
 * Catalog management E2E (R4, R6, R7, R8).
 *
 * CREDENTIAL-GATED: these flows exercise a live dev/staging Supabase project and
 * a seeded admin account. They require .env.local plus:
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

test("signed-out access to /admin/catalogs redirects to /login (R7)", async ({
  page,
}) => {
  await page.goto("/admin/catalogs");
  await expect(page).toHaveURL(/\/login$/);
});

test("employee cannot reach /admin/catalogs (R7)", async ({ page }) => {
  test.skip(!hasEmployee, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");
  await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
  await page.goto("/admin/catalogs");
  await expect(page.getByText("403")).toBeVisible();
});

test("admin adds, renames, and deletes a print type (R4)", async ({ page }) => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run.");

  const unique = Date.now();
  const name = `e2e-type-${unique}`;
  const renamed = `${name}-renamed`;

  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await page.goto("/admin/catalogs");
  await page.getByRole("tab", { name: "Print types" }).click();

  // Add
  await page.getByRole("button", { name: "Add print type" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();

  // Rename
  const row = page.locator("tr", { hasText: name });
  await row.getByRole("button", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit print type" });
  await dialog.getByLabel("Name").fill(renamed);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(renamed, { exact: true })).toBeVisible();

  // Delete (free value succeeds)
  const renamedRow = page.locator("tr", { hasText: renamed });
  await renamedRow.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(renamed, { exact: true })).toHaveCount(0);
});

test("admin sees a swatch on the Colors tab and a duplicate name is rejected (R5, R8)", async ({
  page,
}) => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run.");

  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await page.goto("/admin/catalogs");
  // Colors tab is default; a seeded color row exists with a swatch.
  await expect(page.locator('span[aria-hidden="true"]').first()).toBeVisible();

  // Adding a duplicate of a seeded color name is rejected with a field error.
  await page.getByRole("button", { name: "Add color" }).click();
  await page.getByLabel("Name").fill("Piel MM");
  await page.getByLabel("Hex (#RRGGBB)").fill("#123456");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("alert")).toContainText(/already in use/i);
});
