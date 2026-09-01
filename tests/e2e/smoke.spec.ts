import { expect, test } from '@playwright/test';

test('opens the empty editor shell', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('Bone Animation Utility');
	await expect(page.getByRole('heading', { name: 'Untitled project' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Animate' })).toBeVisible();
	await expect(page.getByText('Drop image parts here')).toBeVisible();
});

test('recovers a committed root edit after reload', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await expect(page.getByText('root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
	await page.waitForTimeout(700);
	await page.reload();

	await expect(page.getByRole('heading', { name: 'Untitled project' })).toBeVisible();
	await expect(page.getByText('root', { exact: true })).toBeVisible();
});
