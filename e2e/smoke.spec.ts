import { test, expect } from "@playwright/test";

test("home route renders the placeholder landing", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Tower Layers" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();
});
