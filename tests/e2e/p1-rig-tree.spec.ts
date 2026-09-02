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

	const rows = page.getByRole('tree', { name: 'Rig hierarchy' }).locator('.bone-row');
	await expect(rows).toHaveCount(3);
};

test('exposes semantic treeitems with roving keyboard focus and selection keys', async ({ page }) => {
	await createThreeBoneRig(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const root = tree.getByRole('treeitem', { name: 'Bone: root', exact: true });
	const firstChild = tree.getByRole('treeitem', { name: 'Bone: bone', exact: true });
	const secondChild = tree.getByRole('treeitem', { name: 'Bone: bone 2', exact: true });

	await expect(tree).toHaveAttribute('aria-multiselectable', 'true');
	await expect(root).toHaveAttribute('aria-level', '1');
	await expect(root).toHaveAttribute('aria-posinset', '1');
	await expect(root).toHaveAttribute('aria-setsize', '1');
	await expect(firstChild).toHaveAttribute('aria-level', '2');
	await expect(firstChild).toHaveAttribute('aria-posinset', '1');
	await expect(firstChild).toHaveAttribute('aria-setsize', '2');
	await expect(secondChild).toHaveAttribute('aria-posinset', '2');
	await expect(secondChild).toHaveAttribute('aria-setsize', '2');

	await root.locator('.bone-row').click();
	await root.focus();
	await expect(root).toBeFocused();
	await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);
	await expect(root).toHaveAttribute('aria-selected', 'true');

	await root.press('ArrowLeft');
	await expect(root).toHaveAttribute('aria-expanded', 'false');
	await expect(firstChild).toHaveCount(0);
	await expect(root).toBeFocused();

	await root.press('ArrowRight');
	await expect(root).toHaveAttribute('aria-expanded', 'true');
	await expect(firstChild).toBeVisible();
	await expect(root).toBeFocused();

	await root.press('ArrowRight');
	await expect(firstChild).toBeFocused();
	await expect(root).toHaveAttribute('aria-selected', 'true');
	await expect(firstChild).toHaveAttribute('aria-selected', 'false');

	await firstChild.press('ArrowLeft');
	await expect(root).toBeFocused();
	await root.press('ArrowRight');
	await firstChild.press('Space');
	await expect(root).toHaveAttribute('aria-selected', 'true');
	await expect(firstChild).toHaveAttribute('aria-selected', 'true');

	await firstChild.press('Enter');
	await expect(root).toHaveAttribute('aria-selected', 'false');
	await expect(firstChild).toHaveAttribute('aria-selected', 'true');
	await expect(firstChild).toBeFocused();
});

test('supports mouse additive and visible-range selection, typeahead, and collapse preservation', async ({ page }) => {
	await createThreeBoneRig(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const rows = tree.locator('.bone-row');
	const root = tree.getByRole('treeitem', { name: 'Bone: root', exact: true });
	const firstChild = tree.getByRole('treeitem', { name: 'Bone: bone', exact: true });
	const secondChild = tree.getByRole('treeitem', { name: 'Bone: bone 2', exact: true });

	await rows.nth(1).click();
	await rows.nth(2).click({ modifiers: ['Control'] });
	await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'true');
	await expect(rows.nth(2)).toHaveAttribute('aria-pressed', 'true');
	await expect(rows.nth(0)).toHaveAttribute('aria-pressed', 'false');

	await rows.nth(0).click({ modifiers: ['Shift'] });
	await expect(rows.nth(0)).toHaveAttribute('aria-pressed', 'true');
	await expect(rows.nth(1)).toHaveAttribute('aria-pressed', 'true');
	await expect(rows.nth(2)).toHaveAttribute('aria-pressed', 'true');

	await root.focus();
	await root.press('b');
	await expect(firstChild).toBeFocused();

	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	const undoEnabledBeforeCollapse = await undo.isEnabled();
	await root.focus();
	await root.press('ArrowLeft');
	await expect(root).toHaveAttribute('aria-expanded', 'false');
	await expect(secondChild).toHaveCount(0);
	expect(await undo.isEnabled()).toBe(undoEnabledBeforeCollapse);

	await root.press('ArrowRight');
	await expect(secondChild).toBeVisible();
	await expect(secondChild.locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');
});

test('reveals filtered descendants without adding a history entry', async ({ page }) => {
	await createThreeBoneRig(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const root = tree.getByRole('treeitem', { name: 'Bone: root', exact: true });
	const secondChild = tree.getByRole('treeitem', { name: 'Bone: bone 2', exact: true });
	const undo = page.getByRole('button', { name: 'Undo', exact: true });

	await root.focus();
	await root.press('ArrowLeft');
	await expect(root).toHaveAttribute('aria-expanded', 'false');
	await expect(secondChild).toHaveCount(0);
	const undoEnabledBeforeReveal = await undo.isEnabled();

	await page.getByLabel('Search rig').fill('bone 2');
	await expect(secondChild).toBeVisible();
	await expect(root).toHaveAttribute('aria-expanded', 'true');
	expect(await undo.isEnabled()).toBe(undoEnabledBeforeReveal);

	await page.getByLabel('Search rig').fill('');
	await expect(secondChild).toHaveCount(0);
});

test('renders typed SVG icons and durable accessible row states', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Load example', exact: true }).click();

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const root = tree.getByRole('treeitem', { name: 'Bone: root', exact: true });
	const arm = tree.getByRole('treeitem', { name: 'Bone: arm', exact: true });
	const body = tree.getByRole('treeitem', { name: 'Slot: body', exact: true });

	const expandIfNeeded = async function expandIfNeeded(item: ReturnType<typeof tree.getByRole>): Promise<void> {
		if (await item.getAttribute('aria-expanded') === 'false') {
			await item.locator('.tree-disclosure').click();
		}
	};

	await expandIfNeeded(root);
	await expandIfNeeded(arm);
	await expandIfNeeded(body);

	await expect(tree.locator('svg.rig-icon')).toHaveCount(6);
	await expect(tree.locator('.rig-icon-bone')).toHaveCount(2);
	await expect(tree.locator('.rig-icon-slot')).toHaveCount(1);
	await expect(tree.locator('.rig-icon-image')).toHaveCount(1);
	await expect(tree.locator('.rig-icon-point')).toHaveCount(1);
	await expect(tree.locator('.rig-icon-rectangle')).toHaveCount(1);
	expect(await tree.locator('svg.rig-icon').allTextContents()).toEqual(['', '', '', '', '', '']);
	await expect(tree.locator('svg.rig-control-icon')).toHaveCount(8);

	const armRow = arm.locator('.bone-row');
	await expect(armRow).toHaveAttribute('title', 'Bone: arm · Child of bone root');
	const armDescriptionId = await arm.getAttribute('aria-describedby');

	if (!armDescriptionId) {
		throw new Error('The arm tree item description ID is unavailable.');
	}

	await expect(page.locator(`#${armDescriptionId}`)).toContainText('Child of bone root');
	const activeAttachment = tree.locator('.attachment-row.is-active-attachment');
	await expect(activeAttachment).toHaveCount(1);
	await expect(activeAttachment).toHaveAttribute('title', /active setup attachment/);
	await expect(activeAttachment).toHaveCSS('border-left-style', 'solid');

	await arm.focus();
	await expect(arm).toBeFocused();
	await arm.press('a');
	await expect(arm).toBeFocused();
	await expect(arm).toHaveCSS('outline-style', 'solid');

	const muzzle = tree.getByRole('treeitem', { name: 'Point attachment: muzzle', exact: true }).locator('.attachment-row');
	await armRow.click();
	await muzzle.click({ modifiers: ['Control'] });
	await expect(armRow).toHaveClass(/is-multi-selected/);
	await expect(muzzle).toHaveClass(/is-multi-selected/);
	await expect(arm).toHaveAttribute('data-selection-state', 'multi-selected');
});

test('keeps a visible non-color-only drag target state during browser dragover', async ({ page }) => {
	await createThreeBoneRig(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const rows = tree.locator('.bone-row');
	const sourceId = await rows.nth(2).getAttribute('data-bone-id');
	const targetId = await rows.nth(1).getAttribute('data-bone-id');

	if (!sourceId || !targetId) {
		throw new Error('The drag source or target ID is unavailable.');
	}

	await page.evaluate(({ sourceId: source, targetId: target }) => {
		const sourceRow = document.querySelector<HTMLElement>(`[data-bone-id="${source}"]`);
		const targetRow = document.querySelector<HTMLElement>(`[data-bone-id="${target}"]`);

		if (!sourceRow || !targetRow) {
			throw new Error('The drag source or target row is unavailable.');
		}

		const dataTransfer = new DataTransfer();
		dataTransfer.setData('application/x-bone-animation-bone', source);
		sourceRow.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
		const bounds = targetRow.getBoundingClientRect();
		targetRow.dispatchEvent(new DragEvent('dragover', {
			bubbles: true,
			clientX: bounds.left + bounds.width / 2,
			clientY: bounds.top + bounds.height / 2,
			dataTransfer
		}));
	}, { sourceId, targetId });

	await expect(rows.nth(1)).toHaveClass(/drop-inside/);
	await expect(rows.nth(1)).toHaveCSS('outline-style', 'dashed');

});
