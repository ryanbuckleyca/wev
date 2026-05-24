import { test, expect } from "@e2e/fixtures";
import type { Locator, Page } from "@playwright/test";

async function selectedRemoveLabels(
  container: Locator,
): Promise<Array<string | null>> {
  return container
    .getByRole("button", { name: /^remove /i })
    .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
}

async function moveFirstSelectedItemDown(
  page: Page,
  container: Locator,
): Promise<Array<string | null>> {
  const before = await selectedRemoveLabels(container);
  const handles = container.getByRole("button", {
    name: /^drag to reorder$/i,
  });

  await expect(handles.nth(1)).toBeVisible();
  await handles.first().focus();
  await page.keyboard.press("ArrowDown");

  await expect
    .poll(async () => (await selectedRemoveLabels(container))[0], {
      timeout: 10_000,
    })
    .not.toBe(before[0]);

  return selectedRemoveLabels(container);
}

test.describe("Profile editing flow", () => {
  test.setTimeout(180_000);

  test("enforces skills/values limits and persists ordering", async ({
    page,
    loggedInUser,
  }) => {
    void loggedInUser;

    await test.step("Open profile and fill basic fields", async () => {
      await page.goto("/en/profile");
      await expect(
        page.getByRole("heading", { name: /^my profile$/i }),
      ).toBeVisible({
        timeout: 10_000,
      });

      await page.getByLabel(/^full name$/i).fill("E2E Profile User");
      await page
        .getByLabel(/^bio$/i)
        .fill("This is an automated profile used for E2E tests.");

      // Work type
      await page.getByRole("button", { name: /^remote$/i }).click();

      // Location autocomplete (select first suggestion)
      const locationInput = page.getByLabel(/current city/i);
      await locationInput.fill("Tor");
      const suggestions = page.getByRole("listbox", {
        name: /location suggestions/i,
      });
      await expect(suggestions).toBeVisible({ timeout: 10_000 });
      await suggestions.getByRole("option").first().click();
    });

    await test.step("Import CV to auto-fill skills and values", async () => {

      // Mock the CV extraction API to avoid calling the real LLM in E2E tests
      await page.route("**/api/cv/extract", async (route) => {
        await route.fulfill({
          status: 200,
          json: {
            skills: [
              {
                uri: "http://data.europa.eu/esco/skill/e87498c3-f09b-4ca0-be58-3cc22b4044af",
                preferredLabel: { en: "React", fr: "React" },
                skillType: "skill",
                reuseLevel: "cross-sector",
              },
            ],
            values: ["Advancement"],
            metadata: {
              filename: "test.pdf",
              imported_at: new Date().toISOString(),
              source: "cv_upload",
              locale: "en",
            },
            warnings: [],
          },
        });
      });

      // The file input is hidden, so we need to set its files directly via the locator
      await page.locator('input[type="file"]').setInputFiles({
        name: 'test.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('dummy content'),
      });

      // Verify the extracted skill was added to the UI
      const skillsContainer = page.getByRole("button", { name: /search and add skills/i }).locator("..");
      await expect(skillsContainer.getByRole("button", { name: /^remove React/i })).toBeVisible({ timeout: 10_000 });
      
      // Verify the extracted value was added to the UI
      const valuesContainer = page.getByRole("button", { name: /search and add work values/i }).locator("..");
      await expect(valuesContainer.getByRole("button", { name: /^remove Advancement/i })).toBeVisible();
    });

    const skillsTrigger = page.getByRole("button", {
      name: /search and add skills/i,
    });
    const skillsContainer = skillsTrigger.locator("..");
    let skillsOrderAfterReorder: Array<string | null> | null = null;

    await test.step("Select too many skills and see save error", async () => {
      await skillsTrigger.click();
      const dialog = page.getByRole("dialog", {
        name: /search and select skills/i,
      });
      await expect(dialog).toBeVisible();

      await dialog.getByPlaceholder(/search to add skills/i).fill("a");

      const listbox = dialog.getByRole("listbox", {
        name: /skill search results/i,
      });
      await expect(listbox.getByRole("option").first()).toBeVisible({
        timeout: 10_000,
      });

      for (let i = 0; i < 10; i += 1) {
        await listbox.getByRole("option").nth(i).click();
      }

      await dialog.getByRole("button", { name: /^done/i }).click();
      await expect(dialog).toBeHidden();

      await expect(page.getByText(/you've selected more than/i)).toBeVisible();

      await page.getByRole("button", { name: /^save profile$/i }).click();
      await expect(page.getByText(/please remove 1 skill/i)).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step("Remove extra skill, reorder, and save", async () => {
      await skillsContainer
        .getByRole("button", { name: /^remove /i })
        .first()
        .click();
      await expect(page.getByText(/you've selected more than/i)).toHaveCount(0);

      const afterOrder = await moveFirstSelectedItemDown(page, skillsContainer);
      skillsOrderAfterReorder = afterOrder;

      await page.getByRole("button", { name: /^save profile$/i }).click();
      await expect(
        page.getByText(/profile updated successfully/i).first(),
      ).toBeVisible({
        timeout: 10_000,
      });
    });

    const valuesTrigger = page.getByRole("button", {
      name: /search and add work values/i,
    });
    const valuesContainer = valuesTrigger.locator("..");
    let valuesOrderAfterReorder: Array<string | null> | null = null;

    await test.step("Select too many values and see save error", async () => {
      await valuesTrigger.click();
      const dialog = page.getByRole("dialog", {
        name: /search and select work values/i,
      });
      await expect(dialog).toBeVisible();

      const input = dialog.getByPlaceholder(/search to add values/i);
      const picks = [
        "Location",
        "Knowledge",
        "Security",
        "Stability",
        "Independence",
      ];

      const listbox = dialog.getByRole("listbox", { name: /work values/i });

      for (const label of picks) {
        await input.fill(label);
        await listbox.getByText(label, { exact: true }).click();
      }

      await dialog.getByRole("button", { name: /^done/i }).click();
      await expect(dialog).toBeHidden();

      await expect(page.getByText(/you've selected more than/i)).toBeVisible();

      await page.getByRole("button", { name: /^save profile$/i }).click();
      await expect(page.getByText(/please remove 1 value/i)).toBeVisible({
        timeout: 10_000,
      });
    });

    await test.step("Remove extra value, reorder, and persist after reload", async () => {
      await valuesContainer
        .getByRole("button", { name: /^remove advancement$/i })
        .first()
        .click();
      await expect(page.getByText(/you've selected more than/i)).toHaveCount(0);

      const after = await moveFirstSelectedItemDown(page, valuesContainer);
      valuesOrderAfterReorder = after;

      await page.getByRole("button", { name: /^save profile$/i }).click();
      await expect(
        page.getByText(/profile updated successfully/i).first(),
      ).toBeVisible({
        timeout: 10_000,
      });

      await page.reload();
      await expect(
        page.getByRole("heading", { name: /^my profile$/i }),
      ).toBeVisible({
        timeout: 10_000,
      });

      await expect(page.getByLabel(/^full name$/i)).toHaveValue(
        "E2E Profile User",
      );
      await expect(page.getByLabel(/^bio$/i)).toHaveValue(
        "This is an automated profile used for E2E tests.",
      );

      const skillRemoveButtons = skillsContainer.getByRole("button", {
        name: /^remove /i,
      });
      await expect(skillRemoveButtons.first()).toBeVisible({ timeout: 10_000 });

      const skillsOrderAfterReload = await skillRemoveButtons.evaluateAll(
        (els) => els.map((el) => el.getAttribute("aria-label")),
      );

      if (!skillsOrderAfterReorder)
        throw new Error("Expected skills to be reordered");
      expect(skillsOrderAfterReload).toEqual(skillsOrderAfterReorder);

      const valueRemoveButtons = valuesContainer.getByRole("button", {
        name: /^remove /i,
      });
      await expect(valueRemoveButtons.first()).toBeVisible({ timeout: 10_000 });

      const valuesOrderAfterReload = await valueRemoveButtons.evaluateAll(
        (els) => els.map((el) => el.getAttribute("aria-label")),
      );

      if (!valuesOrderAfterReorder)
        throw new Error("Expected values to be reordered");
      expect(valuesOrderAfterReload).toEqual(valuesOrderAfterReorder);
    });
  });
});
