import { expect, test, type Page } from '@playwright/test';

const openAddMenu = async function openAddMenu(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Add', exact: true }).click();
};

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
