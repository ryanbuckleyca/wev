import { test, expect } from '../../fixtures';
import { buildStrongPassword } from '../../support/auth-user';
import { deleteAuthUserByEmail } from '../../support/auth-admin';
import { createEphemeralInbox, waitForInboxLink } from '../../support/email';

test.describe('Profile editing flow @auth-email', () => {
  test.setTimeout(180_000);

  test('enforces skills/values limits and persists ordering', async ({ authPage, page }) => {
    const mailbox = await createEphemeralInbox();
    const password = buildStrongPassword('WevProfile!');

    try {
      await test.step('Sign up and confirm email', async () => {
        await authPage.gotoSignup('en');
        await authPage.signup(mailbox.emailAddress, password);
        await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

        const confirmationLink = await waitForInboxLink(mailbox.id, '/auth/callback', 90_000);
        await page.goto(confirmationLink);
        await expect(page).toHaveURL(/\/en(\/)?$/, { timeout: 10_000 });
      });

      await test.step('Open profile and fill basic fields', async () => {
        await page.goto('/en/profile');
        await expect(page.getByRole('heading', { name: /^my profile$/i })).toBeVisible({
          timeout: 10_000,
        });

        await page.getByLabel(/^full name$/i).fill('E2E Profile User');
        await page.getByLabel(/^bio$/i).fill('This is an automated profile used for E2E tests.');

        // Work type
        await page.getByRole('button', { name: /^remote$/i }).click();

        // Location autocomplete (select first suggestion)
        const locationInput = page.getByLabel(/current city/i);
        await locationInput.fill('Tor');
        const suggestions = page.getByRole('listbox', { name: /location suggestions/i });
        await expect(suggestions).toBeVisible({ timeout: 10_000 });
        await suggestions.getByRole('option').first().click();
      });

      const skillsTrigger = page.getByRole('button', { name: /search and add skills/i });
      const skillsContainer = skillsTrigger.locator('..');
      let skillsOrderAfterReorder: Array<string | null> | null = null;

      await test.step('Select too many skills and see save error', async () => {
        await skillsTrigger.click();
        const dialog = page.getByRole('dialog', { name: /search and select skills/i });
        await expect(dialog).toBeVisible();

        await dialog.getByPlaceholder(/search to add skills/i).fill('a');

        const listbox = dialog.getByRole('listbox', { name: /skill search results/i });
        await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 10_000 });

        for (let i = 0; i < 11; i += 1) {
          await listbox.getByRole('option').nth(i).click();
        }

        await dialog.getByRole('button', { name: /^done/i }).click();
        await expect(dialog).toBeHidden();

        await expect(page.getByText(/you've selected more than/i)).toBeVisible();

        await page.getByRole('button', { name: /^save profile$/i }).click();
        await expect(page.getByText(/please remove 1 skill/i)).toBeVisible({ timeout: 10_000 });
      });

      await test.step('Remove extra skill, reorder, and save', async () => {
        await skillsContainer.getByRole('button', { name: /^remove /i }).first().click();
        await expect(page.getByText(/you've selected more than/i)).toHaveCount(0);

        const beforeOrder = await skillsContainer
          .getByRole('button', { name: /^remove /i })
          .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));

        const handles = skillsContainer.getByRole('button', { name: /^drag to reorder$/i });
        const from = handles.nth(0);
        const to = handles.nth(1);

        const fromBox = await from.boundingBox();
        const toBox = await to.boundingBox();
        if (!fromBox || !toBox) throw new Error('Could not measure drag handles');

        await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height + 5, {
          steps: 12,
        });
        await page.mouse.up();

        const afterOrder = await skillsContainer
          .getByRole('button', { name: /^remove /i })
          .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));

        skillsOrderAfterReorder = afterOrder;
        expect(afterOrder[0]).not.toBe(beforeOrder[0]);

        await page.getByRole('button', { name: /^save profile$/i }).click();
        await expect(page.getByText(/profile updated successfully/i).first()).toBeVisible({
          timeout: 10_000,
        });
      });

      const valuesTrigger = page.getByRole('button', { name: /search and add work values/i });
      const valuesContainer = valuesTrigger.locator('..');
      let valuesOrderAfterReorder: Array<string | null> | null = null;

      await test.step('Select too many values and see save error', async () => {
        await valuesTrigger.click();
        const dialog = page.getByRole('dialog', { name: /search and select work values/i });
        await expect(dialog).toBeVisible();

        const input = dialog.getByPlaceholder(/search to add values/i);
        const picks = [
          'Location',
          'Knowledge',
          'Security',
          'Stability',
          'Independence',
          'Advancement',
        ];

        const listbox = dialog.getByRole('listbox', { name: /work values/i });

        for (const label of picks) {
          await input.fill(label);
          await listbox.getByText(label, { exact: true }).click();
        }

        await dialog.getByRole('button', { name: /^done/i }).click();
        await expect(dialog).toBeHidden();

        await expect(page.getByText(/you've selected more than/i)).toBeVisible();

        await page.getByRole('button', { name: /^save profile$/i }).click();
        await expect(page.getByText(/please remove 1 value/i)).toBeVisible({ timeout: 10_000 });
      });

      await test.step('Remove extra value, reorder, and persist after reload', async () => {
        await valuesContainer
          .getByRole('button', { name: /^remove advancement$/i })
          .first()
          .click();
        await expect(page.getByText(/you've selected more than/i)).toHaveCount(0);

        const before = await valuesContainer
          .getByRole('button', { name: /^remove /i })
          .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));

        const handles = valuesContainer.getByRole('button', { name: /^drag to reorder$/i });
        const from = handles.nth(0);
        const to = handles.nth(1);

        const fromBox = await from.boundingBox();
        const toBox = await to.boundingBox();
        if (!fromBox || !toBox) throw new Error('Could not measure drag handles');

        await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height + 5, {
          steps: 12,
        });
        await page.mouse.up();

        const after = await valuesContainer
          .getByRole('button', { name: /^remove /i })
          .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));

        valuesOrderAfterReorder = after;
        expect(after[0]).not.toBe(before[0]);

        await page.getByRole('button', { name: /^save profile$/i }).click();
        await expect(page.getByText(/profile updated successfully/i).first()).toBeVisible({
          timeout: 10_000,
        });

        await page.reload();
        await expect(page.getByRole('heading', { name: /^my profile$/i })).toBeVisible({
          timeout: 10_000,
        });

        await expect(page.getByLabel(/^full name$/i)).toHaveValue('E2E Profile User');
        await expect(page.getByLabel(/^bio$/i)).toHaveValue(
          'This is an automated profile used for E2E tests.',
        );

        const skillRemoveButtons = skillsContainer.getByRole('button', { name: /^remove /i });
        await expect(skillRemoveButtons.first()).toBeVisible({ timeout: 10_000 });

        const skillsOrderAfterReload = await skillRemoveButtons.evaluateAll((els) =>
          els.map((el) => el.getAttribute('aria-label')),
        );

        if (!skillsOrderAfterReorder) throw new Error('Expected skills to be reordered');
        expect(skillsOrderAfterReload).toEqual(skillsOrderAfterReorder);

        const valueRemoveButtons = valuesContainer.getByRole('button', { name: /^remove /i });
        await expect(valueRemoveButtons.first()).toBeVisible({ timeout: 10_000 });

        const valuesOrderAfterReload = await valueRemoveButtons.evaluateAll((els) =>
          els.map((el) => el.getAttribute('aria-label')),
        );

        if (!valuesOrderAfterReorder) throw new Error('Expected values to be reordered');
        expect(valuesOrderAfterReload).toEqual(valuesOrderAfterReorder);
      });
    } finally {
      await deleteAuthUserByEmail(mailbox.emailAddress).catch(() => undefined);
    }
  });
});
