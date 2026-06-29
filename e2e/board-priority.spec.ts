import { expect, test } from "@playwright/test";

/**
 * Task priority E2E (08_task_priority — R1, R2, R4, R5).
 *
 * CREDENTIAL-GATED, like e2e/board.spec.ts: these flows exercise a live
 * dev/staging Supabase project, a seeded account, and at least one seeded
 * TaskCategory. They require .env.local plus:
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD  — any signed-in user can use the
 *                                                 board (no admin needed).
 * Tests skip when those vars are absent.
 */

const EMAIL = process.env.E2E_EMPLOYEE_EMAIL;
const PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD;
const hasUser = Boolean(EMAIL && PASSWORD);

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

test("create a High-priority task → its card shows the High badge (R1, R2, R4)", async ({
  page,
}) => {
  test.skip(!hasUser, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");
  await login(page, EMAIL!, PASSWORD!);
  await page.goto("/board");

  const title = `e2e-priority-${Date.now()}`;

  await page.getByRole("button", { name: "New task" }).click();
  const createDialog = page.getByRole("dialog", { name: "New task" });
  await createDialog.getByLabel("Title").fill(title);
  await createDialog.getByLabel("Category").selectOption({ index: 1 });
  await createDialog.getByLabel("Column (state)").selectOption("TODO");
  await createDialog.getByLabel("Priority").selectOption("HIGH");
  await createDialog.getByRole("button", { name: "Create" }).click();

  // The card carries a visible "High" priority badge.
  const card = page.locator("li", { hasText: title });
  await expect(card.getByText("High", { exact: true })).toBeVisible();
});

test("filtering by priority narrows the board and is reflected in ?priority= (R5)", async ({
  page,
}) => {
  test.skip(!hasUser, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");
  await login(page, EMAIL!, PASSWORD!);
  await page.goto("/board");

  // Selecting a priority pushes it into the URL.
  await page.getByLabel("Priority").selectOption("HIGH");
  await expect(page).toHaveURL(/priority=HIGH/);

  // It composes with the existing state filter.
  await page.getByLabel("State").selectOption("TODO");
  await expect(page).toHaveURL(/priority=HIGH/);
  await expect(page).toHaveURL(/state=TODO/);

  // "All priorities" clears just the priority param.
  await page.getByLabel("Priority").selectOption("");
  await expect(page).not.toHaveURL(/priority=/);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/board$/);
});
