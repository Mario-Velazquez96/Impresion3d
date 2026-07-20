import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/**
 * Flatten stage E2E (12_flatten: R1, R2, R3, R4, R10, R16, R19, R20, R22, R26,
 * R27) — the full feature flow: posterize → flatten a block → undo →
 * Despeckle → exit → download.
 *
 * CREDENTIAL-GATED: requires .env.local plus
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD   — an existing EMPLOYEE
 * Tests skip when those vars are absent.
 *
 * This is the path that exercises the REAL Web Worker `mask`/`flatten` ops
 * and the live canvas geometry (the unit/component suites run against a
 * core-backed fake): upload the committed four-block fixture, posterize,
 * enter the flatten stage, hover + click a color block, flatten the
 * selection, undo it with `z`, run Despeckle image-wide, exit back to the
 * palette, and download.
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

test.describe("flatten stage flow", () => {
  test.skip(
    !hasEmployee,
    "Set E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD to run.",
  );

  test("posterize → flatten a block → undo → despeckle → exit → download (R1–R4, R10, R16, R19, R20, R22, R26, R27)", async ({
    page,
  }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await page.goto("/image-prep");

    // Upload the 64×64 four-block fixture and posterize it (R1 precondition).
    await page.getByLabel(/source image/i).setInputFiles(FIXTURE);
    await expect(page.getByText(/64 × 64 px/)).toBeVisible();
    await page.getByRole("button", { name: "Posterize" }).click();
    await expect(page.getByRole("heading", { name: "Palette" })).toBeVisible();

    // R1 + R2: entering hides the palette panel; counter starts at 0.
    await page.getByRole("button", { name: "Start flatten" }).click();
    await expect(page.getByRole("heading", { name: "Palette" })).toHaveCount(0);
    await expect(page.getByText("0 regions flattened")).toBeVisible();
    await expect(page.getByText(/Click add region/)).toBeVisible(); // R25

    // R4 + R10: hover the top-left block (a quadrant center), then click it —
    // the real worker computes the flood mask and the px count appears.
    const canvas = page.getByLabel("Flatten canvas");
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("Flatten canvas has no layout box");
    }
    const target = { x: box.width * 0.25, y: box.height * 0.25 };
    await canvas.hover({ position: target });
    await canvas.click({ position: target });
    await expect(page.getByText(/px selected/)).toBeVisible();

    // R16 + R22 + R26: flatten the selection via the worker; the counter
    // bumps by the one region and the selection clears.
    await page.getByRole("button", { name: "Flatten selection" }).click();
    await expect(page.getByText("1 regions flattened")).toBeVisible();
    await expect(page.getByText(/px selected/)).toHaveCount(0);

    // R20: `z` reverts the fill — pixels and counter restore together.
    await page.keyboard.press("z");
    await expect(page.getByText("0 regions flattened")).toBeVisible();

    // R19 + R26: Despeckle runs remove-small-regions image-wide through the
    // worker; the busy indicator shows and the button re-enables when it
    // completes (the counter is unchanged — cleanup collapses no region).
    await page.getByRole("button", { name: "Despeckle" }).click();
    await expect(page.getByRole("button", { name: "Despeckle" })).toBeEnabled();
    await expect(page.getByText("0 regions flattened")).toBeVisible();

    // R3: Exit restores the pre-flatten quantized stage — the palette panel
    // returns exactly as left.
    await page.getByRole("button", { name: "Exit flatten" }).click();
    await expect(page.getByRole("heading", { name: "Palette" })).toBeVisible();

    // R27: re-enter and download the flatten working image, client-side,
    // with the suggested `<base>-prepped.png` name.
    await page.getByRole("button", { name: "Start flatten" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PNG" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("image-prep-sample-prepped.png");
  });
});
