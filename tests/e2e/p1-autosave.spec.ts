import { expect, test } from '@playwright/test';

test('shows autosave lifecycle status without changing history or layout', async ({ page }) => {
	await page.goto('/');

	const shell = page.locator('.app-shell');
	const undo = page.getByRole('button', { name: 'Undo', exact: true });

	await expect(shell).toBeVisible();
	await expect(undo).toBeDisabled();
	const timelineHeightBefore = await shell.evaluate((element) => getComputedStyle(element).getPropertyValue('--timeline-height'));

	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await expect(undo).toBeEnabled();
	await expect(page.getByText('Saving...', { exact: true })).toBeVisible();
	await expect(page.getByText('Saved locally', { exact: true })).toBeVisible({ timeout: 5000 });

	await expect(undo).toBeEnabled();
	await expect(shell).toHaveCSS('--timeline-height', timelineHeightBefore);
});
