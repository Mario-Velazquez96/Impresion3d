import { expect, test } from "@playwright/test";

/**
 * Task board E2E (R4, R5, R6, R7, R8).
 *
 * CREDENTIAL-GATED: these flows exercise a live dev/staging Supabase project, a
 * seeded account, and at least one seeded TaskCategory. They require .env.local
 * plus:
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD  — any signed-in user can use the
 *                                                 board (no admin needed).
 * Tests skip when those vars are absent. The signed-out redirect needs no account.
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

test("signed-out access to /board redirects to /login (R3)", async ({
  page,
}) => {
  await page.goto("/board");
  await expect(page).toHaveURL(/\/login$/);
});

test("board renders all six columns in fixed order (R8)", async ({ page }) => {
  test.skip(!hasUser, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");
  await login(page, EMAIL!, PASSWORD!);
  await page.goto("/board");

  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings).toHaveCount(6);
  await expect(headings.nth(0)).toContainText("Backlog");
  await expect(headings.nth(5)).toContainText("Done");
});

test("create a task in a chosen column, then move it via the state field (R4, R5, R8)", async ({
  page,
}) => {
  test.skip(!hasUser, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");
  await login(page, EMAIL!, PASSWORD!);
  await page.goto("/board");

  const title = `e2e-task-${Date.now()}`;

  // Create in the "To do" column.
  await page.getByRole("button", { name: "New task" }).click();
  const createDialog = page.getByRole("dialog", { name: "New task" });
  await createDialog.getByLabel("Title").fill(title);
  // Pick the first available category (seed provides at least one).
  await createDialog.getByLabel("Category").selectOption({ index: 1 });
  await createDialog.getByLabel("Column (state)").selectOption("TODO");
  await createDialog.getByRole("button", { name: "Create" }).click();

  // The card appears in the To do column.
  const todoColumn = page
    .getByRole("heading", { name: /To do/ })
    .locator("xpath=ancestor::section");
  await expect(todoColumn.getByText(title, { exact: true })).toBeVisible();

  // Edit it to the Done column.
  const card = page.locator("li", { hasText: title });
  await card.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit task" });
  await editDialog.getByLabel("Column (state)").selectOption("DONE");
  await editDialog.getByRole("button", { name: "Save" }).click();

  // On reload it sits in the Done column.
  await page.reload();
  const doneColumn = page
    .getByRole("heading", { name: /Done/ })
    .locator("xpath=ancestor::section");
  await expect(doneColumn.getByText(title, { exact: true })).toBeVisible();
});

test("add and check off a subtask; state persists on reload (R6)", async ({
  page,
}) => {
  test.skip(!hasUser, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");
  await login(page, EMAIL!, PASSWORD!);
  await page.goto("/board");

  const title = `e2e-subtask-${Date.now()}`;
  const subtask = `step-${Date.now()}`;

  await page.getByRole("button", { name: "New task" }).click();
  const createDialog = page.getByRole("dialog", { name: "New task" });
  await createDialog.getByLabel("Title").fill(title);
  await createDialog.getByLabel("Category").selectOption({ index: 1 });
  await createDialog.getByRole("button", { name: "Create" }).click();

  const card = page.locator("li", { hasText: title });
  await card.getByLabel("New subtask title").fill(subtask);
  await card.getByRole("button", { name: "Add" }).click();

  const checkbox = card.getByLabel(subtask);
  await expect(checkbox).toBeVisible();
  await checkbox.check();

  await page.reload();
  const cardAfter = page.locator("li", { hasText: title });
  await expect(cardAfter.getByLabel(subtask)).toBeChecked();
});

test("filtering by owner/category/state is reflected in the URL (R7)", async ({
  page,
}) => {
  test.skip(!hasUser, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");
  await login(page, EMAIL!, PASSWORD!);
  await page.goto("/board");

  await page.getByLabel("State").selectOption("BLOCKER");
  await expect(page).toHaveURL(/state=BLOCKER/);

  await page.getByLabel("Category").selectOption({ index: 1 });
  await expect(page).toHaveURL(/category=/);
  await expect(page).toHaveURL(/state=BLOCKER/);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/board$/);
});
