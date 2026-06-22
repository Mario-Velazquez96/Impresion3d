import { expect, test } from "@playwright/test";

/**
 * Auth + user-management E2E (R3, R4, R5, R8, R9, R10).
 *
 * CREDENTIAL-GATED: these flows exercise a live dev/staging Supabase project.
 * They require .env.local plus the following test-account env vars (set in CI /
 * locally; never committed):
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD     — an existing ADMIN user
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD — an existing EMPLOYEE user
 * When those vars are absent the credential-gated tests skip (so the suite still
 * runs the unauthenticated-redirect and bad-credential checks, which need no
 * accounts). The signed-out redirect (R3) and bad-credential (R5) tests run
 * against any deployment.
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

test("redirects signed-out access to /board to /login (R3)", async ({ page }) => {
  await page.goto("/board");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("shows an error on invalid credentials and stays signed out (R5)", async ({
  page,
}) => {
  await login(page, "nobody@example.com", "wrongpw");
  await expect(page.getByRole("alert")).toContainText(/invalid/i);
  await expect(page).toHaveURL(/\/login$/);
});

test("admin signs in and lands on /board (R4)", async ({ page }) => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run.");
  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible();
});

test("employee cannot reach /admin/users (R9)", async ({ page }) => {
  test.skip(
    !hasEmployee,
    "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.",
  );
  await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
  await expect(page).toHaveURL(/\/board$/);
  await page.goto("/admin/users");
  await expect(page.getByText("403")).toBeVisible();
});

test("admin invites a user; the invitee can sign in immediately (R8)", async ({
  page,
  browser,
}) => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run.");

  const unique = Date.now();
  const inviteeEmail = `e2e-invitee-${unique}@example.com`;
  const tempPassword = `temp-${unique}`;

  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Invite user" }).click();
  await page.getByLabel("Name").fill("E2E Invitee");
  await page.getByLabel("Email").fill(inviteeEmail);
  await page.getByLabel("Temporary password").fill(tempPassword);
  await page.getByRole("button", { name: "Invite" }).click();

  await expect(page.getByText(inviteeEmail)).toBeVisible();

  // The invited user can sign in immediately with the temporary password.
  const inviteeContext = await browser.newContext();
  const inviteePage = await inviteeContext.newPage();
  await login(inviteePage, inviteeEmail, tempPassword);
  await expect(inviteePage).toHaveURL(/\/board$/);
  await inviteeContext.close();
});

test("admin changes a user's role (R10)", async ({ page }) => {
  test.skip(
    !hasAdmin || !hasEmployee,
    "Set both admin and employee test accounts to run.",
  );

  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await page.goto("/admin/users");

  const row = page.locator("tr", { hasText: EMPLOYEE_EMAIL! });
  const select = row.getByRole("combobox");
  await select.selectOption("ADMIN");
  await row.getByRole("button", { name: "Save" }).click();

  // After revalidation the persisted value is reflected.
  await expect(select).toHaveValue("ADMIN");

  // Revert so the test is idempotent.
  await select.selectOption("EMPLOYEE");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(select).toHaveValue("EMPLOYEE");
});
