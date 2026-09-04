import { expect, test } from '@playwright/test';

test('characterizes the empty-selection timeline requirement', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Animate', exact: true }).click();

	const timeline = page.getByTestId('animate-timeline');

	await expect(timeline).toBeVisible();
	await expect(page.getByRole('combobox', { name: 'Timeline rows', exact: true })).toHaveValue('auto');
	await expect(timeline.locator('.timeline-property-row')).not.toHaveCount(0);
});
