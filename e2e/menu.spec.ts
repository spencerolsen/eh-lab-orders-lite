import { expect, test } from '@playwright/test';

test('the menu bar has only Orders, Patients and Catalog', async ({ page }) => {
  await page.goto('/');

  const menu = page.getByRole('navigation', { name: 'Main' });
  await expect(menu.getByRole('link')).toHaveText([
    'Orders',
    'Patients',
    'Catalog',
  ]);
  // Orders are placed from the pages, not from the menu bar.
  await expect(page.getByRole('banner').getByRole('button')).toHaveCount(0);
});
