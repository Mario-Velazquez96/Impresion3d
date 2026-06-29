import { expect, test } from "@playwright/test";

/**
 * Drag-and-drop board E2E (04: R1, R2, R8).
 *
 * CREDENTIAL-GATED: these flows exercise a live dev/staging Supabase project, a
 * seeded account, and at least one seeded TaskCategory. They require .env.local
 * plus E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD (any signed-in user can use the
 * board). Tests skip when those vars are absent. Run with:
 *   corepack pnpm test:e2e
 *
 * Drag is driven via the dnd-kit KeyboardSensor (focus the drag handle, Space to
 * pick up, arrow keys to move, Space to drop) — more deterministic in CI than a
 * synthetic pointer drag.
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

async function createTaskInColumn(
  page: import("@playwright/test").Page,
  title: string,
  state: string,
) {
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Category").selectOption({ index: 1 });
  await dialog.getByLabel("Column (state)").selectOption(state);
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

function column(page: import("@playwright/test").Page, name: RegExp) {
  return page.getByRole("heading", { name }).locator("xpath=ancestor::section");
}

test("drag a card to another column persists across reload (R1, R8)", async ({
  page,
}) => {
  test.skip(!hasUser, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");
  await login(page, EMAIL!, PASSWORD!);
  await page.goto("/board");

  const title = `e2e-dnd-cross-${Date.now()}`;
  await createTaskInColumn(page, title, "TODO");

  // Keyboard-drag the card from To do toward Done (arrow right moves columns).
  const handle = page.getByRole("button", { name: `Drag ${title}` });
  await handle.focus();
  await page.keyboard.press("Space");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");

  // It should leave To do and land in Done; confirm after a reload (durability).
  await page.reload();
  await expect(
    column(page, /Done/).getByText(title, { exact: true }),
  ).toBeVisible();
  await expect(
    column(page, /To do/).getByText(title, { exact: true }),
  ).toHaveCount(0);
});

test("reorder a card within a column persists across reload (R2, R8)", async ({
  page,
}) => {
  test.skip(!hasUser, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");
  await login(page, EMAIL!, PASSWORD!);
  await page.goto("/board");

  const stamp = Date.now();
  const first = `e2e-dnd-a-${stamp}`;
  const second = `e2e-dnd-b-${stamp}`;
  await createTaskInColumn(page, first, "BACKLOG");
  await createTaskInColumn(page, second, "BACKLOG");

  const backlog = column(page, /Backlog/);
  // Initially 'first' precedes 'second'. Move 'first' down past 'second'.
  const handle = page.getByRole("button", { name: `Drag ${first}` });
  await handle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  await page.reload();
  // After reload, 'second' should now appear before 'first' in the column.
  const cards = backlog.locator("h3");
  const texts = await cards.allInnerTexts();
  const idxFirst = texts.indexOf(first);
  const idxSecond = texts.indexOf(second);
  expect(idxSecond).toBeGreaterThanOrEqual(0);
  expect(idxFirst).toBeGreaterThan(idxSecond);
});
