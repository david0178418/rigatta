import { expect, test } from '@playwright/test';

test('keeps workspace presentation boundaries mounted across editor modes', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByTestId('workspace-docks')).toBeVisible();
	await expect(page.getByTestId('canvas-toolbar')).toBeVisible();
	await expect(page.getByTestId('properties-inspector')).toBeVisible();
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await expect(page.getByTestId('animate-timeline')).toBeVisible();
	await expect(page.getByTestId('workspace-docks')).toBeVisible();
});
