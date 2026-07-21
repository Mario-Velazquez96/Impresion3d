import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

/**
 * Crop-to-print-size E2E (13_crop: R1, R4, R5, R8, R9, R10, R13, R15) — the
 * full feature flow: posterize → Start crop → presets → swap orientation →
 * handle drag → Fit → Apply crop → Revert to uncropped → download.
 *
 * CREDENTIAL-GATED: requires .env.local plus
 *   E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD   — an existing EMPLOYEE
 * Tests skip when those vars are absent.
 *
 * This is the path that exercises the LIVE canvas geometry and layout (the
 * unit/component suites run against jsdom with a mocked
 * `getBoundingClientRect`): a real `object-contain` box, a real pointer drag
 * on the crop rectangle, and the real main-thread crop. The crop posts NO
 * worker message at all (R21) and persists nothing (R22) — a reload starts
 * from a fresh, empty tool.
 *
 * The committed fixture is 64 × 64. At the default 71.7 × 94 mm target the
 * ratio is 0.76276, so the Fit rectangle is the largest ratio-locked rect that
 * fits: width = floor(min(64, 64 × 0.76276)) = 48, height = round(48 ÷
 * 0.76276) = 63, centred at (8, 1). Those exact numbers are asserted below —
 * option A keeps the maximum available pixels and never resamples.
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

test.describe("crop stage flow", () => {
  test.skip(
    !hasEmployee,
    "Set E2E_EMPLOYEE_EMAIL / E2E_EMPLOYEE_PASSWORD to run.",
  );

  test("posterize → crop → presets → swap → handle drag → Fit → Apply → Revert → download (R1, R4, R5, R8, R9, R10, R13, R15)", async ({
    page,
  }) => {
    await login(page, EMPLOYEE_EMAIL!, EMPLOYEE_PASSWORD!);
    await page.goto("/image-prep");

    // Upload the 64 × 64 four-block fixture and posterize it, so the crop has
    // real downstream state (a palette) to discard on Apply (R13).
    await page.getByLabel(/source image/i).setInputFiles(FIXTURE);
    await expect(page.getByText(/64 × 64 px/)).toBeVisible();
    await page.getByRole("button", { name: "Posterize" }).click();
    await expect(page.getByRole("heading", { name: "Palette" })).toBeVisible();

    // R1: Start crop enters the stage on the current working image with the
    // default 71.7 × 94 mm target and the Fit rectangle; the palette panel
    // disappears (R16) and the hints strip is visible (R20).
    await page.getByRole("button", { name: "Start crop" }).click();
    await expect(
      page.getByRole("heading", { name: "Crop workspace" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Palette" })).toHaveCount(0);
    await expect(page.getByText(/Drag to move/)).toBeVisible();

    const panel = page.getByTestId("crop-size-panel");
    const readout = page.getByTestId("crop-readout");

    // R10: the live readout reports crop px, mm, px/mm and dpi. R12's note
    // about the 2048 px working cap sits alongside it.
    await expect(readout).toContainText("48 × 63 px");
    await expect(readout).toContainText("71.7 × 94 mm");
    await expect(readout).toContainText(/px\/mm/);
    await expect(readout).toContainText(/dpi/);
    await expect(panel).toContainText(/capped at 2048 px/);

    // R4: the 100 × 100 preset re-locks the rectangle to 1:1 — the readout's
    // two pixel dimensions become equal — and marks itself active.
    const square = panel.getByRole("button", { name: "100 × 100" });
    await square.click();
    await expect(square).toHaveAttribute("aria-pressed", "true");
    await expect(readout).toHaveText(/(\d+) × \1 px/);
    await expect(readout).toContainText("100 × 100 mm");

    // R4: back to the workshop's standing size.
    const workshop = panel.getByRole("button", { name: "71.7 × 94" });
    await workshop.click();
    await expect(workshop).toHaveAttribute("aria-pressed", "true");
    await expect(square).toHaveAttribute("aria-pressed", "false");
    await expect(readout).toContainText("71.7 × 94 mm");

    // R5: Swap orientation exchanges the two millimetre values, turning the
    // rectangle landscape; swapping twice returns to the original size.
    await panel.getByRole("button", { name: "Swap orientation" }).click();
    await expect(readout).toContainText("94 × 71.7 mm");
    await expect(readout).toContainText("63 × 48 px");
    await panel.getByRole("button", { name: "Swap orientation" }).click();
    await expect(readout).toContainText("71.7 × 94 mm");
    await expect(readout).toContainText("48 × 63 px");

    // R8: drag the NW corner handle inward. The image is square and the canvas
    // is `object-contain` at its own aspect ratio, so there is no letterbox and
    // image fractions map straight onto the element box. The rectangle resizes
    // ratio-locked from the opposite (SE) corner, so the readout changes.
    const canvas = page.getByLabel("Crop canvas");
    const box = await canvas.boundingBox();
    if (!box) {
      throw new Error("Crop canvas has no layout box");
    }
    // The NW corner sits at image (8, 1) of 64 × 64 → fractions (0.125, 0.016).
    await page.mouse.move(box.x + box.width * 0.125, box.y + box.height * 0.02);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(readout).not.toContainText("48 × 63 px");
    // R6: the ratio stays locked through the drag — the target mm are untouched.
    await expect(readout).toContainText("71.7 × 94 mm");

    // R9: Fit returns the largest centred ratio-locked rectangle.
    await panel.getByRole("button", { name: "Fit" }).click();
    await expect(readout).toContainText("48 × 63 px");

    // R13: Apply crops the pipeline SOURCE on the main thread and commits a
    // fresh loaded stage — the palette is gone, Adjust/Posterize are live
    // again, and the crop card reports the new size against the upload. The
    // dropzone still reports the FILE's dimensions (11/R4), which a crop does
    // not change.
    await panel.getByRole("button", { name: "Apply crop" }).click();
    await expect(
      page.getByRole("heading", { name: "Crop workspace" }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Palette" })).toHaveCount(0);
    await expect(page.getByText(/Cropped to 48 × 63 px/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start crop" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Posterize" })).toBeEnabled();
    await expect(page.getByText(/64 × 64 px/)).toBeVisible();

    // R15: Revert to uncropped restores the as-uploaded image as a fresh
    // loaded stage, and then disappears — it is a single level.
    await page.getByRole("button", { name: "Revert to uncropped" }).click();
    await expect(page.getByText(/Cropped to/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Revert to uncropped" }),
    ).toHaveCount(0);

    // The export is unchanged and still entirely client-side (11/R17).
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PNG" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("image-prep-sample-prepped.png");

    // R22: nothing is persisted — a reload starts from a fresh, empty tool.
    await page.reload();
    await expect(page.getByText(/64 × 64 px/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start crop" })).toBeDisabled();
  });
});
