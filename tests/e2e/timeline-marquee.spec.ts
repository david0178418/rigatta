import { expect, test, type Page } from '@playwright/test';

const loadExampleAnimation = async function loadExampleAnimation(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Timeline options', exact: true }).click();
	await page.getByRole('dialog', { name: 'Timeline options', exact: true }).getByRole('combobox', { name: 'Timeline rows', exact: true }).selectOption({ label: 'All keyed' });
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('animate-timeline')).toBeVisible();
};

test('starts a key marquee from an entity grid row and selects its visible property keys', async ({ page }) => {
	await loadExampleAnimation(page);

	const hipsGroup = page.locator('.timeline-group-row[data-entity-id]').filter({ hasText: 'hips' }).first();
	const hipsLane = hipsGroup.locator('.timeline-summary-lane');
	const frameOneMarker = hipsGroup.getByRole('button', { name: 'hips key at frame 1', exact: true }).first();
	const propertyRows = page.locator('.timeline-property-row').filter({ hasText: 'hips' });
	await hipsLane.scrollIntoViewIfNeeded();
	const laneBounds = await hipsLane.boundingBox();
	const markerBounds = await frameOneMarker.boundingBox();
	const lastPropertyBounds = await propertyRows.last().boundingBox();

	if (!laneBounds || !markerBounds || !lastPropertyBounds) {
		throw new Error('The hips timeline geometry is unavailable.');
	}

	const frameOneCenter = markerBounds.x + markerBounds.width / 2;
	const startX = frameOneCenter - 16;
	const endX = frameOneCenter + 16;
	const startY = laneBounds.y + laneBounds.height / 2;
	const endY = lastPropertyBounds.y + lastPropertyBounds.height - 4;

	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(endX, endY, { steps: 4 });
	await expect(page.locator('.timeline-marquee')).toBeVisible();
	await page.mouse.up();

	await expect(page.getByText('2 keys selected', { exact: false })).toBeVisible();
	await expect(page.locator('.timeline-property-row .track-key.is-selected')).toHaveCount(2);
	await expect(page.getByRole('region', { name: 'Key properties', exact: true })).toBeVisible();
	await page.getByTestId('animate-timeline').focus();
	await page.keyboard.press('Control+c');
	await expect(page.getByText('Copied 2 keys.', { exact: true })).toBeVisible();
});
