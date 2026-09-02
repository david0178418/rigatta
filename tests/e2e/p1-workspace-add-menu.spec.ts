import { expect, test, type Page } from '@playwright/test';

const openAddMenu = async function openAddMenu(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Add', exact: true }).click();
};

test('links fixed dock tabs to their tabpanels and keeps inactive surfaces out of focus', async ({ page }) => {
	await page.goto('/');

	const leftTabs = page.getByRole('tablist', { name: 'Left dock', exact: true });
	const rightTabs = page.getByRole('tablist', { name: 'Right dock', exact: true });

	await expect(leftTabs.getByRole('tab', { name: 'Rig', exact: true })).toHaveAttribute('aria-controls', 'left-dock-rig-panel');
	await expect(leftTabs.getByRole('tab', { name: 'Draw Order', exact: true })).toHaveAttribute('aria-controls', 'left-dock-draw-order-panel');
	await expect(rightTabs.getByRole('tab', { name: 'Properties', exact: true })).toHaveAttribute('aria-controls', 'right-dock-properties-panel');
	await expect(rightTabs.getByRole('tab', { name: 'Assets', exact: true })).toHaveAttribute('aria-controls', 'right-dock-assets-panel');

	await expect(page.locator('#left-dock-rig-panel')).toHaveAttribute('aria-labelledby', 'left-dock-rig-tab');
	await expect(page.locator('#left-dock-draw-order-panel')).toHaveAttribute('aria-labelledby', 'left-dock-draw-order-tab');
	await expect(page.locator('#right-dock-properties-panel')).toHaveAttribute('aria-labelledby', 'right-dock-properties-tab');
	await expect(page.locator('#right-dock-assets-panel')).toHaveAttribute('aria-labelledby', 'right-dock-assets-tab');
	await expect(page.locator('#right-dock-properties-panel')).toBeVisible();
	await expect(page.locator('#right-dock-assets-panel')).toBeHidden();
	await expect(page.locator('.asset-browser')).toHaveCount(0);

	await rightTabs.getByRole('tab', { name: 'Assets', exact: true }).click();
	await expect(page.locator('#right-dock-assets-panel')).toBeVisible();
	await expect(page.locator('#right-dock-properties-panel')).toBeHidden();
	await expect(page.locator('.asset-browser')).toBeVisible();
	await expect(page.getByTestId('properties-inspector')).toHaveCount(0);

	await rightTabs.getByRole('tab', { name: 'Properties', exact: true }).click();
	await expect(page.getByTestId('properties-inspector')).toBeVisible();
	await expect(page.locator('.asset-browser')).toHaveCount(0);
	await expect(page.locator('.left-dock')).toHaveCSS('overflow-y', 'auto');
	await expect(page.locator('.right-dock')).toHaveCSS('overflow-y', 'auto');
});

test('provides contextual Add actions, preserves naming/history, and removes duplicate inspector controls', async ({ page }) => {
	await page.goto('/');

	const add = page.getByRole('button', { name: 'Add', exact: true });
	await openAddMenu(page);
	const menu = page.getByRole('menu', { name: 'Add', exact: true });
	await expect(menu.getByRole('menuitem', { name: 'Root bone', exact: true })).toBeEnabled();
	await expect(menu.getByRole('menuitem', { name: 'Child bone', exact: true })).toBeDisabled();
	await expect(menu.getByRole('menuitem', { name: 'Slot', exact: true })).toBeDisabled();
	await expect(menu.getByRole('menuitem', { name: 'Image attachment', exact: true })).toBeDisabled();
	await expect(menu.getByRole('menuitem', { name: 'Point attachment', exact: true })).toBeDisabled();
	await expect(menu.getByRole('menuitem', { name: 'Rectangle attachment', exact: true })).toBeDisabled();
	await expect(menu).toContainText('Select a bone first');
	await expect(menu).toContainText('Select a bone or slot first');
	await page.keyboard.press('Escape');
	await expect(add).toBeFocused();

	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await openAddMenu(page);
	const rootMenu = page.getByRole('menu', { name: 'Add', exact: true });
	await expect(rootMenu.getByRole('menuitem', { name: 'Root bone', exact: true })).toBeDisabled();
	await expect(rootMenu.getByRole('menuitem', { name: 'Child bone', exact: true })).toBeEnabled();
	await expect(rootMenu.getByRole('menuitem', { name: 'Slot', exact: true })).toBeEnabled();
	await expect(rootMenu.getByRole('menuitem', { name: 'Image attachment', exact: true })).toBeEnabled();
	await expect(rootMenu.getByRole('menuitem', { name: 'Point attachment', exact: true })).toBeEnabled();
	await expect(rootMenu.getByRole('menuitem', { name: 'Rectangle attachment', exact: true })).toBeEnabled();
	await rootMenu.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	await expect(page.getByRole('button', { name: 'bone', exact: true })).toBeVisible();
	await expect(add).toBeFocused();
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();

	await page.getByRole('button', { name: 'root', exact: true }).click();
	await openAddMenu(page);
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	await expect(page.getByRole('button', { name: 'bone 2', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'root', exact: true }).click();
	await openAddMenu(page);
	await page.getByRole('menuitem', { name: 'Point attachment', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await openAddMenu(page);
	await page.getByRole('menuitem', { name: 'Rectangle attachment', exact: true }).click();
	await expect(page.getByRole('button', { name: 'point', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'rectangle', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add child bone', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add slot', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add point', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add rectangle', exact: true })).toHaveCount(0);
});

test('image attachment Add action opens Assets with the selected drop context', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();

	await openAddMenu(page);
	await page.getByRole('menuitem', { name: 'Image attachment', exact: true }).click();
	await expect(page.getByRole('tab', { name: 'Assets', exact: true })).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('#right-dock-assets-panel')).toContainText('Drop on the canvas to create a slot and attachment under root.');

	await page.getByRole('tab', { name: 'Properties', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await openAddMenu(page);
	await page.getByRole('menuitem', { name: 'Slot', exact: true }).click();
	await page.getByRole('button', { name: 'slot', exact: true }).click();
	await openAddMenu(page);
	await expect(page.getByRole('menu', { name: 'Add', exact: true })).toContainText('Select an image, then drop it on slot');
});
