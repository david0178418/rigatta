import { expect, test } from '@playwright/test';

test('reloads trimmed atlas metadata through PixiJS', async ({ page }) => {
	await page.goto('/?atlas-validation');

	const result = page.locator('#atlas-validation-result');
	await expect(result).toContainText('"ok":true');
	await expect(result).toContainText('"frame":{"x":3,"y":4,"w":2,"h":2}');
	await expect(result).toContainText('"sourceSize":{"w":4,"h":3}');
	await expect(result).toContainText('"spriteSourceSize":{"x":1,"y":0,"w":2,"h":2}');
});
