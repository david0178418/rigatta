import { expect, test, type Page } from '@playwright/test';
import { UI_PREFERENCES_STORAGE_KEY } from '../../src/app/ui-preferences.ts';

const EXAMPLE_PROJECT_ID = '123e4567-e89b-42d3-a456-426614174100';
const EXAMPLE_ROOT_BONE_ID = '123e4567-e89b-42d3-a456-426614174102';

const loadExample = async function loadExample(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example' })).toBeVisible();
	await expect(page.locator('canvas.pixi-canvas')).toBeVisible();
};

const canvasData = async function canvasData(page: Page): Promise<string> {
	return page.locator('canvas.pixi-canvas').evaluate((element) => {
		if (!(element instanceof HTMLCanvasElement)) {
			throw new Error('The Pixi canvas was not mounted.');
		}

		return element.toDataURL('image/png');
	});
};

test('hides a parent from authoring pixels and hit testing while preserving selection and history', async ({ page }) => {
	await loadExample(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const root = tree.getByRole('treeitem', { name: 'Bone: root', exact: true });
	const arm = tree.getByRole('treeitem', { name: 'Bone: arm', exact: true });
	await arm.locator('.bone-row').click();
	await page.waitForTimeout(700);

	const beforeHidden = await canvasData(page);
	await root.locator('.tree-visibility').click();
	await expect(root.locator('.tree-visibility')).toHaveAttribute('aria-label', 'Show');
	await expect(arm.locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('heading', { name: 'arm', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
	await expect.poll(() => canvasData(page)).not.toBe(beforeHidden);

	const canvasBounds = await page.locator('canvas.pixi-canvas').boundingBox();

	if (!canvasBounds) {
		throw new Error('The Pixi canvas bounds are unavailable.');
	}

	await page.mouse.click(
		canvasBounds.x + canvasBounds.width / 2,
		canvasBounds.y + canvasBounds.height / 2
	);
	await expect(page.getByRole('heading', { name: 'arm', exact: true })).toHaveCount(0);
	await expect(root.locator('.bone-row')).toHaveAttribute('aria-pressed', 'false');
});

test('persists hidden IDs for the matching project and restores them after reload', async ({ page }) => {
	await loadExample(page);

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const root = tree.getByRole('treeitem', { name: 'Bone: root', exact: true });
	await root.locator('.tree-visibility').click();
	await expect(root.locator('.tree-visibility')).toHaveAttribute('aria-label', 'Show');
	await expect(page.getByText('Saved locally', { exact: true })).toBeVisible({ timeout: 5000 });
	await page.waitForTimeout(300);

	const stored = await page.evaluate((key) => {
		const raw = localStorage.getItem(key);

		return raw ? JSON.parse(raw) as Readonly<Record<string, unknown>> : undefined;
	}, UI_PREFERENCES_STORAGE_KEY);
	const projects = stored?.projects as Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
	const examplePreferences = projects?.[EXAMPLE_PROJECT_ID];

	expect(examplePreferences?.hiddenEntityIds).toEqual([EXAMPLE_ROOT_BONE_ID]);

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example' })).toBeVisible();
	await expect(page.getByRole('tree', { name: 'Rig hierarchy' }).getByRole('treeitem', { name: 'Bone: root', exact: true }).locator('.tree-visibility'))
		.toHaveAttribute('aria-label', 'Show');
});

test('keeps evaluated Animate state and export controls independent of hidden authoring items', async ({ page }) => {
	await loadExample(page);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();

	const root = page.getByRole('tree', { name: 'Rig hierarchy' }).getByRole('treeitem', { name: 'Bone: root', exact: true });
	await root.locator('.tree-visibility').click();
	await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Export controls' })).toBeVisible();
	await expect(page.getByRole('checkbox', { name: 'Export clip pulse', exact: true })).toBeChecked();
	await expect(page.getByRole('button', { name: 'Close export controls' })).toBeVisible();
});
