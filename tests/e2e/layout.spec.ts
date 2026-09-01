import { expect, test } from '@playwright/test';

const supportedViewports = [
	{ width: 1120, height: 720 },
	{ width: 1440, height: 900 },
	{ width: 1920, height: 1080 }
] as const;

test('keeps the desktop editor usable at supported viewport sizes', async ({ page }) => {
	await supportedViewports.reduce(async (previous, viewport) => {
		await previous;
		await page.setViewportSize(viewport);
		await page.goto('/');

		await expect(page.getByRole('button', { name: 'Setup' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Animate' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Load example' })).toBeVisible();
		await expect(page.locator('canvas.pixi-canvas')).toBeVisible();
		await expect(page.getByRole('contentinfo', { name: 'Animation timeline' })).toBeVisible();

		const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);

		expect(scrollWidth, `horizontal overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.width);
	}, Promise.resolve());
});
