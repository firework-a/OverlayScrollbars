import { playwrightRollup, expectSuccess } from '@~local/playwright-tooling';
import { test } from '@playwright/test';

playwrightRollup();

// required for test with a separate "app"
test.describe.configure({ mode: 'serial' });

test.describe('StructureSetup.body', () => {
  test('with native scrollbar styling', async ({ page }) => {
    await expectSuccess(page);
  });

  test('without native scrollbar styling', async ({ page }) => {
    await expectSuccess(page);
  });
});
