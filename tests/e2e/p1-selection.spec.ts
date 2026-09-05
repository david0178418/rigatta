import { expect, test, type Page } from '@playwright/test';

const loadExample = async function loadExample(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
};

test('synchronizes Draw Order and timeline entity selection with the Rig tree', async ({ page }) => {
	await loadExample(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const arm = tree.getByRole('treeitem', { name: 'Bone: right arm', exact: true });
	const armId = await arm.getAttribute('data-rig-tree-id');

	if (!armId) {
		throw new Error('The example arm ID is unavailable.');
	}

	await page.getByRole('tab', { name: 'Draw Order', exact: true }).click();
	const body = page.getByTestId('draw-order-panel').getByRole('button', { name: 'body', exact: true });
	await body.click();
	await expect(body).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('tab', { name: 'Rig', exact: true }).click();
	await expect(tree.getByRole('treeitem', { name: 'Slot: body', exact: true }).locator('.slot-row')).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Timeline options', exact: true }).click();
	await page.getByRole('dialog', { name: 'Timeline options', exact: true }).getByLabel('Timeline rows', { exact: true }).selectOption('all-keyed');
	await page.keyboard.press('Escape');
	await page.getByRole('tab', { name: 'Draw Order', exact: true }).click();
	const armTimelineGroup = page.locator(`[data-entity-id="${armId}"]`).first();
	const armTimelineRow = armTimelineGroup.locator('.timeline-row-select');
	await expect(armTimelineRow).toBeVisible();
	await armTimelineRow.click();

	await page.getByRole('tab', { name: 'Rig', exact: true }).click();
	await expect(page.getByRole('tab', { name: 'Rig', exact: true })).toHaveAttribute('aria-selected', 'true');
	await expect(tree.getByRole('treeitem', { name: 'Bone: right arm', exact: true }).locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('heading', { name: 'right arm', exact: true })).toBeVisible();
	const armTimelineKey = armTimelineGroup.getByRole('button', { name: 'right arm key at frame 1', exact: true }).first();
	await armTimelineKey.click();
	await expect(armTimelineKey).toHaveClass(/is-selected/);
	await expect(page.getByRole('tab', { name: 'Rig', exact: true })).toHaveAttribute('aria-selected', 'true');
	await expect(tree.getByRole('treeitem', { name: 'Bone: right arm', exact: true }).locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');
});

test('reveals a canvas selection in the Rig tree and clears its filter', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await loadExample(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const bodyFront = tree.getByRole('treeitem', { name: 'Image attachment: body front', exact: true });
	const search = page.getByLabel('Search rig');

	await search.fill('does-not-match');
	await expect(bodyFront).toHaveCount(0);
	await page.getByRole('tab', { name: 'Draw Order', exact: true }).click();

	const viewport = page.locator('.pixi-viewport');
	const bounds = await viewport.boundingBox();

	if (!bounds) {
		throw new Error('The viewport bounds are unavailable.');
	}

	await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await expect(page.getByRole('tab', { name: 'Rig', exact: true })).toHaveAttribute('aria-selected', 'true');
	await expect(search).toHaveValue('');
	await tree.getByRole('treeitem', { name: 'Slot: body', exact: true }).getByRole('button', { name: 'Expand', exact: true }).click();
	await expect(bodyFront.locator('.attachment-row')).toHaveAttribute('aria-pressed', 'true');
});

test('replays a mixed additive selection with both Rig and Assets revealed', async ({ page }) => {
	await loadExample(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const arm = tree.getByRole('treeitem', { name: 'Bone: right arm', exact: true });
	const root = tree.getByRole('treeitem', { name: 'Bone: root', exact: true });
	const asset = page.getByRole('button', { name: /body_front\.png/ });

	await arm.locator('.bone-row').click();
	await page.getByRole('tab', { name: 'Assets', exact: true }).click();
	await asset.click({ modifiers: ['Control'] });
	await expect(asset).toHaveAttribute('aria-pressed', 'true');
	await expect(arm.locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');

	await root.locator('.bone-row').click();
	await page.keyboard.press('PageUp');
	await expect(arm.locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');
	await expect(asset).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('tab', { name: 'Rig', exact: true })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('tab', { name: 'Assets', exact: true })).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('PageDown');
	await expect(root.locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');
	await expect(arm.locator('.bone-row')).toHaveAttribute('aria-pressed', 'false');
});

test('persists complete additive selection history across reload', async ({ page }) => {
	await loadExample(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const arm = tree.getByRole('treeitem', { name: 'Bone: right arm', exact: true });
	const asset = page.getByRole('button', { name: /body_front\.png/ });

	await arm.locator('.bone-row').click();
	await page.getByRole('tab', { name: 'Assets', exact: true }).click();
	await asset.click({ modifiers: ['Control'] });
	await expect(asset).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.autosave-status')).toHaveText('Saved locally', { timeout: 5000 });
	await page.waitForTimeout(250);

	await page.reload();
	const reloadedTree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const reloadedArm = reloadedTree.getByRole('treeitem', { name: 'Bone: right arm', exact: true });
	const reloadedAsset = page.getByRole('button', { name: /body_front\.png/ });

	await expect(reloadedArm).toBeVisible();
	await page.keyboard.press('PageUp');
	await expect(reloadedArm.locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');
	await expect(reloadedAsset).toHaveAttribute('aria-pressed', 'false');
	await page.keyboard.press('PageDown');
	await expect(reloadedArm.locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');
	await expect(reloadedAsset).toHaveAttribute('aria-pressed', 'true');
});

test('replays bounded selection history without loops and reveals a collapsed branch', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	const root = page.getByRole('button', { name: 'root', exact: true });

	await root.click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	const child = page.getByRole('button', { name: 'bone', exact: true });
	await expect(child).toBeVisible();
	await child.click();
	await root.click();

	const rootTreeItem = page.getByRole('treeitem', { name: 'Bone: root', exact: true });
	await rootTreeItem.getByRole('button', { name: 'Collapse', exact: true }).click();
	await page.keyboard.press('PageUp');

	await expect(child).toHaveAttribute('aria-pressed', 'true');
	await expect(rootTreeItem.locator('.tree-disclosure')).toHaveAttribute('aria-expanded', 'true');
	await expect(child).toBeVisible();

	await page.keyboard.press('PageUp');
	await expect(root).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('PageDown');
	await expect(child).toHaveAttribute('aria-pressed', 'true');
});

test('skips a removed selection-history entity', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	const root = page.getByRole('button', { name: 'root', exact: true });

	await root.click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	const child = page.getByRole('button', { name: 'bone', exact: true });
	await child.click();
	page.once('dialog', (dialog) => void dialog.accept());
	await page.keyboard.press('Delete');
	await expect(child).toHaveCount(0);

	await page.keyboard.press('PageUp');
	await expect(root).toHaveAttribute('aria-pressed', 'true');
});
