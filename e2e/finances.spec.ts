import { expect, test } from "@playwright/test";

/**
 * Sales & balance E2E (10_sales_and_balance R1, R2, R3, R7, R9, R10).
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

type Page = import("@playwright/test").Page;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Record one sale via the dialog. */
async function recordSale(
  page: Page,
  amount: string,
  printName: string,
  buyer?: string,
) {
  await page.goto("/finances");
  await page.getByRole("button", { name: "Record sale" }).click();
  const dialog = page.getByRole("dialog", { name: "Record sale" });
  await dialog.getByLabel("Amount").fill(amount);
  await dialog.getByLabel("Date").fill("2026-07-15");
  await dialog.getByLabel("Print").selectOption({ label: printName });
  if (buyer) await dialog.getByLabel("Buyer (optional)").fill(buyer);
  await dialog.getByRole("button", { name: "Record" }).click();
  await expect(dialog).toBeHidden();
}

/** Record one withdrawal via the dialog (Admin only). */
async function recordWithdrawal(page: Page, amount: string, reason: string) {
  await page.goto("/finances");
  await page.getByRole("button", { name: "Record withdrawal" }).click();
  const dialog = page.getByRole("dialog", { name: "Record withdrawal" });
  await dialog.getByLabel("Amount").fill(amount);
  await dialog.getByLabel("Date").fill("2026-07-15");
  await dialog.getByLabel("Reason").fill(reason);
  await dialog.getByRole("button", { name: "Record" }).click();
  await expect(dialog).toBeHidden();
}

test("signed-out access to /finances redirects to /login (R1)", async ({
  page,
}) => {
  await page.goto("/finances");
  await expect(page).toHaveURL(/\/login$/);
});

test("an EMPLOYEE sees the nav link, the balance and both ledgers — but no withdrawal control (R1)", async ({
  page,
}) => {
  test.skip(!hasEmployee, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");

  await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);

  // The link is outside the showAdmin block: an employee can navigate to it.
  await page.getByRole("link", { name: "Finances" }).click();
  await expect(page).toHaveURL(/\/finances$/);

  // The whole page is viewable by any authenticated user (no admin gating).
  await expect(page.getByRole("heading", { name: "Finances" })).toBeVisible();
  await expect(page.getByTestId("balance-figure")).toBeVisible();
  await expect(
    page.getByText("Sales minus withdrawals — does not include expenses"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Withdrawals" })).toBeVisible();

  // Admin-only CONTROLS are hidden (UX; the server action is the real gate).
  await expect(
    page.getByRole("button", { name: "Record withdrawal" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});

test("an EMPLOYEE can record a sale (R10)", async ({ page }) => {
  test.skip(!hasEmployee, "Set E2E_EMPLOYEE_EMAIL/E2E_EMPLOYEE_PASSWORD to run.");

  await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
  await page.goto("/finances");

  // Recording revenue is open to any authenticated user (requireUser).
  await expect(page.getByRole("button", { name: "Record sale" })).toBeVisible();

  const buyer = `e2e-buyer-${Date.now()}`;
  const firstPrint = await page
    .getByRole("button", { name: "Record sale" })
    .click()
    .then(async () => {
      const dialog = page.getByRole("dialog", { name: "Record sale" });
      const options = dialog.getByLabel("Print").locator("option:not([value=''])");
      return (await options.first().textContent()) ?? "";
    });
  test.skip(firstPrint === "", "No prints in the inventory to sell.");

  const dialog = page.getByRole("dialog", { name: "Record sale" });
  await dialog.getByLabel("Amount").fill("42.50");
  await dialog.getByLabel("Date").fill("2026-07-15");
  await dialog.getByLabel("Print").selectOption({ label: firstPrint });
  await dialog.getByLabel("Buyer (optional)").fill(buyer);
  await dialog.getByRole("button", { name: "Record" }).click();

  const row = page.locator("tr", { hasText: buyer });
  await expect(row).toBeVisible();
  await expect(row).toContainText("$42.50");
});

test("THE WORKED EXAMPLE: sales $1,350.25 − withdrawals $850.25 = $500.00, and a $2,000 expense changes NOTHING (R2, R3, R7)", async ({
  page,
}) => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run.");

  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

  // This test asserts DELTAS, so it is safe on a database that already has rows:
  // it reads the starting balance, records the example, and checks the movement.
  await page.goto("/finances");
  const balanceBefore = (await page.getByTestId("balance-figure").textContent()) ?? "";

  // Pick a print to attribute the sales to.
  await page.getByRole("button", { name: "Record sale" }).click();
  const printName =
    (await page
      .getByRole("dialog", { name: "Record sale" })
      .getByLabel("Print")
      .locator("option:not([value=''])")
      .first()
      .textContent()) ?? "";
  test.skip(printName === "", "No prints in the inventory to sell.");
  await page.getByRole("dialog", { name: "Record sale" }).getByRole("button", { name: "Cancel" }).click();

  // Sales: 1250.00 + 0.10 + 0.20 + 99.95 = 1350.25. The 0.10/0.20 pair is the
  // float-drift trap: a JS float sum would give 0.30000000000000004.
  for (const amount of ["1250.00", "0.10", "0.20", "99.95"]) {
    await recordSale(page, amount, printName);
  }

  // Withdrawals: 500.00 + 350.25 = 850.25.
  for (const amount of ["500.00", "350.25"]) {
    await recordWithdrawal(page, amount, "Owner draw");
  }

  // An expense of $2,000.00 — deliberately EXCLUDED from the balance (R3).
  await page.goto("/expenses");
  await page.getByRole("button", { name: "New expense" }).click();
  const expenseDialog = page.getByRole("dialog", { name: "New expense" });
  const supplyType =
    (await expenseDialog
      .getByLabel("Supply type")
      .locator("option:not([value=''])")
      .first()
      .textContent()) ?? "";
  test.skip(supplyType === "", "No supply types available for the expense.");
  const expenseReason = `e2e-excluded-${Date.now()}`;
  await expenseDialog.getByLabel("Cost").fill("2000.00");
  await expenseDialog.getByLabel("Reason").fill(expenseReason);
  await expenseDialog.getByLabel("Date").fill("2026-07-15");
  await expenseDialog.getByLabel("Supply type").selectOption({ label: supplyType });
  await expenseDialog.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("tr", { hasText: expenseReason })).toBeVisible();

  // The balance moved by exactly +500.00 — the $2,000 expense did NOT touch it.
  await page.goto("/finances");
  const parse = (s: string) => Number(s.replace(/[^0-9.-]/g, ""));
  const balanceAfter = (await page.getByTestId("balance-figure").textContent()) ?? "";
  expect(parse(balanceAfter) - parse(balanceBefore)).toBeCloseTo(500, 2);

  // Deleting the expense also leaves the balance untouched (R3).
  await page.goto("/expenses");
  await page
    .locator("tr", { hasText: expenseReason })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByText(expenseReason, { exact: true })).toHaveCount(0);

  await page.goto("/finances");
  const balanceAfterExpenseDelete =
    (await page.getByTestId("balance-figure").textContent()) ?? "";
  expect(parse(balanceAfterExpenseDelete)).toBeCloseTo(parse(balanceAfter), 2);
});

test("a print with a sale cannot be deleted — 'in use' message, print remains (R9)", async ({
  page,
}) => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run.");

  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await page.goto("/finances");

  await page.getByRole("button", { name: "Record sale" }).click();
  const printName =
    (await page
      .getByRole("dialog", { name: "Record sale" })
      .getByLabel("Print")
      .locator("option:not([value=''])")
      .first()
      .textContent()) ?? "";
  test.skip(printName === "", "No prints in the inventory to sell.");
  await page
    .getByRole("dialog", { name: "Record sale" })
    .getByRole("button", { name: "Cancel" })
    .click();

  await recordSale(page, "10.00", printName);

  // The print now has a sale: the pre-check reports it in use, and the FK
  // Restrict is the backstop behind that. Either way the print survives.
  await page.goto("/inventory");
  const card = page.locator("article, li, div").filter({ hasText: printName }).first();
  await card.getByRole("button", { name: "Delete" }).first().click();

  await expect(
    page.getByText("This print has sales recorded and cannot be deleted"),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText(printName).first()).toBeVisible();
});
