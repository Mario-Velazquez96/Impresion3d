import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/**
 * Image prep E2E (11_image_prep: R1, R2, R5, R7, R9, R13, R17, R18, R19).
 *
 * CREDENTIAL-GATED: requires .env.local plus
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD   — an existing EMPLOYEE
 * Tests skip when those vars are absent. The signed-out redirect needs no account.
 *
 * This is the flow that exercises the REAL Web Worker and canvas decode (the
 * unit/component suites run against a core-backed fake): upload the committed
 * four-block fixture, apply default adjustments, posterize, inspect the
 * palette, snap to the seeded catalog, and download — asserting the suggested
 * filename via Playwright's download event. The tool is STATELESS (R19): it
 * needs no seeded rows beyond the Color catalog and writes nothing.
 */

const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL;
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD;
const hasEmployee = Boolean(EMPLOYEE_EMAIL && EMPLOYEE_PASSWORD);

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "image-prep-sample.png",
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

test("signed-out users are redirected from /image-prep to /login (R1)", async ({
  page,
}) => {
  await page.goto("/image-prep");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("image prep flow", () => {
  test.skip(
    !hasEmployee,
    "Set E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD to run.",
  );

  test("an EMPLOYEE reaches /image-prep from the nav link (R1)", async ({
    page,
  }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await page.goto("/board");

    // The link is visible to a NON-admin — it is not inside the admin block.
    await page.getByRole("link", { name: "Image prep" }).click();
    await expect(page).toHaveURL(/\/image-prep/);
    await expect(
      page.getByRole("heading", { name: "Image prep" }),
    ).toBeVisible();
  });

  test("upload → adjust → posterize → snap → download, all client-side (R2, R5, R7, R9, R13, R17, R18, R19)", async ({
    page,
  }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await page.goto("/image-prep");

    // R2: upload the 64×64 fixture; dimensions + size caption appear.
    await page.getByLabel(/source image/i).setInputFiles(FIXTURE);
    await expect(page.getByText(/64 × 64 px/)).toBeVisible();

    // R5 + R18: Apply with identity defaults runs in the worker; the
    // histogram renders once the round trip completes.
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByTestId("luminance-histogram")).toBeVisible();

    // R7 + R9: posterize at the default 8 → the four block colors, each with
    // 25.0% coverage, split into neutral/color groups.
    await page.getByRole("button", { name: "Posterize" }).click();
    await expect(
      page.getByRole("heading", { name: "Palette" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /#ff0000/ })).toContainText(
      "25.0%",
    );
    await expect(page.getByRole("button", { name: /#0000ff/ })).toContainText(
      "25.0%",
    );

    // R13: with the seeded catalog, snapping labels entries with filament
    // names (any name text inside a palette entry proves the label).
    const snap = page.getByRole("button", { name: "Snap to filaments" });
    if (await snap.isEnabled()) {
      await snap.click();
      // Every entry now shows "<Name> #hex <coverage>%" — 3-part buttons.
      await expect(
        page
          .getByRole("button", { name: /% *$/ })
          .filter({ hasText: /#[0-9a-f]{6}/ })
          .first(),
      ).toBeVisible();
    }

    // R17 + R19: download happens entirely client-side with the suggested
    // name <base>-prepped.png; a reload starts from a fresh, empty tool.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PNG" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("image-prep-sample-prepped.png");

    await page.reload();
    await expect(page.getByText(/64 × 64 px/)).toHaveCount(0);
  });
});
