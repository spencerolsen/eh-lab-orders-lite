import { expect, test } from '@playwright/test';

import { unique } from './helpers';

test('search the catalog, deactivate a test through the dialog, see it inactive', async ({
  page,
  request,
}) => {
  // A test of its own, so deactivating it does not change what other
  // journeys order.
  const code = unique('Z').toUpperCase();
  const name = `Search Panel ${code}`;
  const created = await request.post('/api/lab-tests', {
    data: { code, name, priceCents: 1234, turnaroundDays: 2 },
  });
  expect(created.ok()).toBe(true);

  await page.goto('/catalog');
  await page.getByLabel('Search by code or name').fill(code.toLowerCase());
  await expect(page.getByRole('row')).toHaveCount(2); // header and one test
  await expect(page.getByText(/^1 of \d+ tests$/)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`\\?q=${code.toLowerCase()}$`));

  // Keep active: nothing changes.
  await page.getByRole('button', { name: `Deactivate ${code}` }).click();
  const dialog = page.getByRole('dialog', { name: `Deactivate ${code}?` });
  await expect(dialog).toContainText(name);
  await expect(
    dialog.getByRole('button', { name: 'Keep active' }),
  ).toBeFocused();
  await dialog.getByRole('button', { name: 'Keep active' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(code) })).toContainText(
    'Active',
  );

  // Confirm: the row is inactive, and the search is still there after a reload.
  await page.getByRole('button', { name: `Deactivate ${code}` }).click();
  await dialog.getByRole('button', { name: 'Deactivate test' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(code) })).toContainText(
    'Inactive',
  );
  await page.reload();
  await expect(page.getByLabel('Search by code or name')).toHaveValue(
    code.toLowerCase(),
  );
  await expect(page.getByRole('row', { name: new RegExp(code) })).toContainText(
    'Inactive',
  );

  // A search that matches nothing says so.
  await page.getByLabel('Search by code or name').fill('no such test');
  await expect(
    page.getByText('No lab test matches this search.'),
  ).toBeVisible();
});
