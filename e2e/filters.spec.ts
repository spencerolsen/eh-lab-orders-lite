import { expect, test } from '@playwright/test';

import { createOrder, createPatient, markCollected } from './helpers';

test('filter the orders list by status and by patient; the filters survive a reload', async ({
  page,
  request,
}) => {
  // Patient A has a collected order, patient B an order that is still ordered.
  const a = await createPatient(request);
  const b = await createPatient(request);
  await markCollected(request, await createOrder(request, a.id, ['CBC']));
  await createOrder(request, b.id, ['UA']);

  const rowOf = (name: string) =>
    page.getByRole('row').filter({ hasText: name });
  await page.goto('/');
  await expect(rowOf(a.fullName)).toBeVisible();
  await expect(rowOf(b.fullName)).toBeVisible();

  // By status: only the collected order is left.
  await page
    .getByLabel('Filter by status')
    .selectOption({ label: 'Collected' });
  await expect(rowOf(a.fullName)).toBeVisible();
  await expect(rowOf(b.fullName)).toBeHidden();

  // By patient as well: B has no collected order.
  await page.getByLabel('Filter by patient').fill(b.lastName);
  await page.getByRole('button', { name: b.fullName }).click();
  await expect(page.getByText('No orders match these filters')).toBeVisible();

  // Both filters are kept when the page is loaded again.
  await page.reload();
  await expect(page.getByLabel('Filter by status')).toHaveValue('collected');
  await expect(
    page.getByRole('button', { name: 'Remove patient filter' }),
  ).toBeVisible();
  await expect(page.getByText('No orders match these filters')).toBeVisible();

  // Dropping the status leaves B's order only.
  await page
    .getByLabel('Filter by status')
    .selectOption({ label: 'All statuses' });
  await expect(rowOf(b.fullName)).toBeVisible();
  await expect(rowOf(a.fullName)).toBeHidden();
});
