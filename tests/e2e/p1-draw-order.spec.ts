import { expect, test, type Page } from '@playwright/test';

const addTwoSlots = async function addTwoSlots(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Slot', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Slot', exact: true }).click();
};

test('shows every slot back to front and directly reorders setup order', async ({ page }) => {
	await page.goto('/');
	await addTwoSlots(page);

	await page.getByRole('tab', { name: 'Draw Order', exact: true }).click();
	const panel = page.getByTestId('draw-order-panel');
	const items = panel.locator('.draw-order-item');

	await expect(panel).toHaveAttribute('data-mode', 'setup');
	await expect(panel).toContainText('Setup · Setup order · back to front');
	await expect(panel).toContainText('Back');
	await expect(panel).toContainText('Front');
	await expect(items).toHaveCount(2);

	const firstSlotId = await items.nth(0).getAttribute('data-slot-id');
	const secondSlotId = await items.nth(1).getAttribute('data-slot-id');

	if (!firstSlotId || !secondSlotId) {
		throw new Error('The draw-order slot IDs are unavailable.');
	}

	await items.nth(0).locator('.draw-order-row').dragTo(items.nth(1).locator('.draw-order-row'));
	await expect(items.nth(0)).toHaveAttribute('data-slot-id', secondSlotId);
	await expect(items.nth(1)).toHaveAttribute('data-slot-id', firstSlotId);
});

test('distinguishes setup from a preceding keyed override and keys the evaluated order', async ({ page }) => {
	await page.goto('/');
	await addTwoSlots(page);
	await page.getByRole('tab', { name: 'Draw Order', exact: true }).click();

	const panel = page.getByTestId('draw-order-panel');
	const items = panel.locator('.draw-order-item');
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Create animation clip', exact: true }).click();

	await expect(panel).toHaveAttribute('data-mode', 'animate');
	await expect(panel).toHaveAttribute('data-draw-order-source', 'setup');
	await expect(panel).toContainText('Animate · Setup order · back to front');

	const firstSlotId = await items.nth(0).getAttribute('data-slot-id');
	const secondSlotId = await items.nth(1).getAttribute('data-slot-id');

	if (!firstSlotId || !secondSlotId) {
		throw new Error('The draw-order slot IDs are unavailable.');
	}

	await items.nth(0).locator('.draw-order-row').dragTo(items.nth(1).locator('.draw-order-row'));
	await expect(panel).toHaveAttribute('data-draw-order-source', 'keyed');
	await expect(panel).toContainText('Animate · Keyed order at frame 1 · current override from frame 1 · back to front');
	await expect(items.nth(0)).toHaveAttribute('data-slot-id', secondSlotId);

	await page.getByLabel('Playhead').fill('1');
	await expect(panel).toHaveAttribute('data-draw-order-source', 'keyed');
	await expect(panel).toContainText('Animate · Keyed order at frame 2 · current override from frame 1 · back to front');
	await expect(items.nth(0)).toHaveAttribute('data-slot-id', secondSlotId);

	await page.getByTestId('key-current-draw-order').click();
	await expect(panel).toHaveAttribute('data-draw-order-source', 'keyed');
	await expect(items.nth(0)).toHaveAttribute('data-slot-id', secondSlotId);
	await expect(items.nth(1)).toHaveAttribute('data-slot-id', firstSlotId);
});
