import { expect, test, type Page } from '@playwright/test';

const createThreeBoneRig = async function createThreeBoneRig(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	await expect(page.locator('.rig-tree .bone-row')).toHaveCount(3);
};

test('renames a Rig row once and restores focus after commit or cancel', async ({ page }) => {
	await createThreeBoneRig(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const firstChild = tree.getByRole('treeitem', { name: 'Bone: bone', exact: true });

	const row = firstChild.locator('.bone-row');
	await row.dblclick({ delay: 100 });
	const rename = page.getByRole('textbox', { name: 'Rename bone', exact: true });
	await expect(rename).toBeFocused();
	await rename.fill('torso');
	await rename.press('Enter');

	const renamed = tree.getByRole('treeitem', { name: 'Bone: torso', exact: true });
	await expect(renamed).toBeFocused();
	await expect(page.getByRole('heading', { name: 'torso', exact: true })).toBeVisible();

	await renamed.locator('.bone-row').dblclick({ delay: 100 });
	const cancelRename = page.getByRole('textbox', { name: 'Rename torso', exact: true });
	await cancelRename.fill('discarded');
	await cancelRename.press('Escape');
	await expect(tree.getByRole('treeitem', { name: 'Bone: torso', exact: true })).toBeFocused();
	await expect(tree.getByRole('treeitem', { name: 'Bone: discarded', exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(tree.getByRole('treeitem', { name: 'Bone: bone', exact: true })).toBeVisible();
	await expect(tree.getByRole('treeitem', { name: 'Bone: bone 2', exact: true })).toBeVisible();
});

test('keeps an invalid duplicate name in the inline field until corrected or cancelled', async ({ page }) => {
	await createThreeBoneRig(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const firstChild = tree.getByRole('treeitem', { name: 'Bone: bone', exact: true });

	await firstChild.locator('.bone-row').dblclick({ delay: 100 });
	const rename = page.getByRole('textbox', { name: 'Rename bone', exact: true });
	await rename.fill('bone 2');
	await rename.press('Enter');

	await expect(rename).toBeVisible();
	await expect(rename).toHaveAttribute('aria-invalid', 'true');
	await expect(page.getByRole('alert')).toContainText('already exists');
	await expect(tree.getByRole('treeitem', { name: 'Bone: bone', exact: true })).toBeVisible();
	await expect(tree.getByRole('treeitem', { name: 'Bone: bone 2', exact: true })).toBeVisible();

	await rename.press('Escape');
	await expect(tree.getByRole('treeitem', { name: 'Bone: bone', exact: true })).toBeFocused();
});

test('searches Rig names and types with context markers and restores expansion and focus', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const root = tree.getByRole('treeitem', { name: 'Bone: root', exact: true });
	const arm = tree.getByRole('treeitem', { name: 'Bone: arm', exact: true });

	await arm.focus();
	await arm.press('ArrowLeft');
	await expect(arm).toHaveAttribute('aria-expanded', 'false');

	await page.getByLabel('Search rig').fill('point attachment');
	const muzzle = tree.getByRole('treeitem', { name: 'Point attachment: muzzle', exact: true });
	await expect(muzzle).toBeVisible();
	await expect(muzzle).toHaveAttribute('data-filter-state', 'match');
	await expect(root).toHaveAttribute('data-filter-state', 'context');
	await expect(tree.getByRole('treeitem', { name: 'Bone: arm', exact: true })).toHaveAttribute('data-expansion-state', 'filter-expanded');
	await expect(tree.getByRole('status')).toContainText('context ancestor');

	await page.getByLabel('Search rig').fill('');
	await expect(arm).toHaveAttribute('aria-expanded', 'false');
	await expect(muzzle).toHaveCount(0);
	await expect(arm).toBeFocused();

	await page.getByLabel('Search rig').fill('slot');
	await expect(tree.getByRole('treeitem', { name: 'Slot: body', exact: true })).toHaveAttribute('data-filter-state', 'match');
});
