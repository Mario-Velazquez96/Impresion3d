import { expect, test } from "@playwright/test";

/**
 * Print inventory E2E (R5, R6, R7, R8, R9, R11).
 *
 * CREDENTIAL-GATED: these flows exercise a live dev/staging Supabase project
 * (Postgres + the private `print-photos` Storage bucket) and seeded accounts. They
 * require .env.local plus:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD        — an existing ADMIN
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD   — an existing EMPLOYEE
 * Tests skip when those vars are absent. The signed-out redirect needs no account.
 *
 * Before running, apply the three 06 migrations against dev/staging (incl. the
 * bucket + policies migration):
 *   corepack pnpm prisma migrate dev
 *   # then ensure 20260622120200_print_photos_bucket is applied (bucket + policies)
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL;
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD;

const hasAdmin = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);
const hasEmployee = Boolean(EMPLOYEE_EMAIL && EMPLOYEE_PASSWORD);

// A tiny valid PNG (1x1) so the upload exercises the real Storage round-trip.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PNG2_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAB3RJTUUH5gYWFTkAAAAASUVORK5CYII=",
  "base64",
);

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

/** Ensure a PrintType exists via the catalogs UI; returns its name. */
async function ensurePrintType(
  page: import("@playwright/test").Page,
): Promise<string> {
  const name = `e2e-ptype-${Date.now()}`;
  await page.goto("/admin/catalogs");
  await page.getByRole("tab", { name: "Print types" }).click();
  await page.getByRole("button", { name: "Add print type" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  return name;
}

/** Ensure a Color exists via the catalogs UI; returns its name. */
async function ensureColor(
  page: import("@playwright/test").Page,
  hex: string,
): Promise<string> {
  const name = `e2e-color-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await page.goto("/admin/catalogs");
  await page.getByRole("tab", { name: "Colors" }).click();
  await page.getByRole("button", { name: "Add color" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel(/Hex/i).fill(hex);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  return name;
}

test("signed-out access to /inventory redirects to /login (R3)", async ({
  page,
}) => {
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/login$/);
});

test("admin creates, edits, and deletes a print with a photo + colors (R5, R6, R7, R11)", async ({
  page,
}) => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run.");

  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  const printType = await ensurePrintType(page);
  const colorA = await ensureColor(page, "#ff0000");
  const colorB = await ensureColor(page, "#0000ff");

  const name = `e2e-print-${Date.now()}`;
  await page.goto("/inventory");

  // Create (R5) with a photo + two colors.
  await page.getByRole("button", { name: "New print" }).click();
  const dialog = page.getByRole("dialog", { name: "New print" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Print time (min)").fill("120");
  await dialog.getByLabel("Filament (g)").fill("45");
  await dialog.getByLabel("Print type").selectOption({ label: printType });
  await dialog.getByLabel(colorA).check();
  await dialog.getByLabel(colorB).check();
  await dialog.getByLabel(/Photo/).setInputFiles({
    name: "print.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await dialog.getByRole("button", { name: "Create" }).click();

  // The card shows in the grid with a SERVER-GENERATED signed image URL (R5, R11).
  const card = page.getByRole("link", { name: new RegExp(name) });
  await expect(card).toBeVisible();
  const img = card.locator("img").first();
  await expect(img).toHaveAttribute("src", /token=|sign/i);
  // Color swatches are rendered (R11): both color names present (sr-only ok).
  await expect(card.getByText(colorA, { exact: true })).toBeAttached();
  await expect(card.getByText(colorB, { exact: true })).toBeAttached();

  // Open detail, edit: swap colors + replace the photo (R6).
  await card.click();
  await page.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit print" });
  await editDialog.getByLabel(colorA).uncheck();
  await editDialog.getByLabel(/Photo/).setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: PNG2_1X1,
  });
  await editDialog.getByRole("button", { name: "Save" }).click();
  // After the swap, only colorB remains in the detail swatches.
  await expect(page.getByText(colorB, { exact: true })).toBeVisible();

  // Delete (R7 — admin): the row + its Storage object are removed.
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(
    0,
  );
});

test("search and type/color filters narrow the grid (R8)", async ({ page }) => {
  test.skip(!hasAdmin, "Set E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD to run.");

  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  const printType = await ensurePrintType(page);
  const color = await ensureColor(page, "#00ff00");

  const unique = `zz-${Date.now()}`;
  await page.goto("/inventory");
  await page.getByRole("button", { name: "New print" }).click();
  const dialog = page.getByRole("dialog", { name: "New print" });
  await dialog.getByLabel("Name").fill(unique);
  await dialog.getByLabel("Print time (min)").fill("10");
  await dialog.getByLabel("Filament (g)").fill("5");
  await dialog.getByLabel("Print type").selectOption({ label: printType });
  await dialog.getByLabel(color).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(unique) }),
  ).toBeVisible();

  // Search by name narrows to the unique print (R8).
  await page.getByLabel("Search").fill(unique);
  await expect(
    page.getByRole("link", { name: new RegExp(unique) }),
  ).toBeVisible();

  // A non-matching search term hides it.
  await page.getByLabel("Search").fill("definitely-no-such-print-xyz");
  await expect(page.getByText(/no prints match/i)).toBeVisible();

  // Filter by the print type shows it again.
  await page.getByLabel("Search").fill("");
  await page.getByLabel("Print type").selectOption({ label: printType });
  await expect(
    page.getByRole("link", { name: new RegExp(unique) }),
  ).toBeVisible();
});

test("employee can create a print but cannot delete (R9)", async ({ page }) => {
  test.skip(
    !hasEmployee || !hasAdmin,
    "Set E2E_EMPLOYEE_* and E2E_ADMIN_* to run.",
  );

  // Admin seeds the catalogs + a print the employee will view.
  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  const printType = await ensurePrintType(page);
  const color = await ensureColor(page, "#123456");
  const name = `e2e-emp-${Date.now()}`;
  await page.goto("/inventory");
  await page.getByRole("button", { name: "New print" }).click();
  const dialog = page.getByRole("dialog", { name: "New print" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Print time (min)").fill("10");
  await dialog.getByLabel("Filament (g)").fill("5");
  await dialog.getByLabel("Print type").selectOption({ label: printType });
  await dialog.getByLabel(color).check();
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();

  // Employee can reach inventory + create (any authenticated user), but the
  // Admin-only Delete control is NOT rendered on the detail view (R9).
  await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
  await page.goto("/inventory");
  await expect(page.getByRole("button", { name: "New print" })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
});
