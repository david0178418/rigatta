import { expect, test } from '@playwright/test';
import { UI_PREFERENCES_STORAGE_KEY } from '../../src/app/ui-preferences.ts';

const EXAMPLE_PROJECT_ID = '123e4567-e89b-42d3-a456-426614174100';
const EXAMPLE_ROOT_BONE_ID = '123e4567-e89b-42d3-a456-426614174102';

test('resizes both side docks accessibly without reducing the canvas below its minimum', async ({ page }) => {
	await page.setViewportSize({ width: 1120, height: 720 });
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();

	const leftSplitter = page.getByRole('separator', { name: 'Resize left dock' });
	const rightSplitter = page.getByRole('separator', { name: 'Resize right dock' });

	await expect(leftSplitter).toHaveAttribute('aria-valuemin', '196');
	await expect(leftSplitter).toHaveAttribute('aria-valuemax', '370');
	await expect(rightSplitter).toHaveAttribute('aria-valuemax', '370');

	await leftSplitter.focus();
	await leftSplitter.press('ArrowRight');
	await expect(leftSplitter).toHaveAttribute('aria-valuenow', '264');
	await leftSplitter.press('Home');
	await expect(leftSplitter).toHaveAttribute('aria-valuenow', '196');
	await leftSplitter.press('End');
	await expect(leftSplitter).toHaveAttribute('aria-valuenow', '370');

	await rightSplitter.focus();
	await rightSplitter.press('Home');
	await expect(rightSplitter).toHaveAttribute('aria-valuenow', '196');
	const rightSplitterBounds = await rightSplitter.boundingBox();

	if (!rightSplitterBounds) {
		throw new Error('The right dock splitter bounds are unavailable.');
	}

	await page.mouse.move(rightSplitterBounds.x + rightSplitterBounds.width / 2, rightSplitterBounds.y + rightSplitterBounds.height / 2);
	await page.mouse.down();
	await page.mouse.move(rightSplitterBounds.x + rightSplitterBounds.width / 2 - 80, rightSplitterBounds.y + rightSplitterBounds.height / 2);
	await page.mouse.up();
	await expect(rightSplitter).toHaveAttribute('aria-valuenow', '276');
	await rightSplitter.press('End');
	await expect(rightSplitter).toHaveAttribute('aria-valuenow', '370');

	const canvasBounds = await page.locator('.viewport-panel').boundingBox();

	if (!canvasBounds) {
		throw new Error('The canvas panel bounds are unavailable.');
	}

	expect(canvasBounds.width).toBeGreaterThanOrEqual(360);
	expect(await page.getByRole('button', { name: 'Undo' })).toBeDisabled();

	const leftCollapse = page.getByRole('button', { name: 'Collapse left dock' });
	await leftCollapse.click();
	await expect(page.getByRole('button', { name: 'Expand left dock' })).toHaveAttribute('aria-expanded', 'false');
	await expect(leftSplitter).toHaveAttribute('aria-valuemin', '34');
	await expect(leftSplitter).toHaveAttribute('aria-valuemax', '34');
	await expect(leftSplitter).toHaveAttribute('aria-valuenow', '34');

	const leftExpand = page.getByRole('button', { name: 'Expand left dock' });
	await leftExpand.click();
	await expect(leftSplitter).toHaveAttribute('aria-valuemax', '370');

	const rightCollapse = page.getByRole('button', { name: 'Collapse right dock' });
	await rightCollapse.click();
	await expect(page.getByRole('button', { name: 'Expand right dock' })).toHaveAttribute('aria-expanded', 'false');
	await expect(rightSplitter).toHaveAttribute('aria-valuemin', '34');
	await expect(rightSplitter).toHaveAttribute('aria-valuemax', '34');
	await expect(rightSplitter).toHaveAttribute('aria-valuenow', '34');
	await page.getByRole('button', { name: 'Expand right dock' }).click();
	await expect(rightSplitter).toHaveAttribute('aria-valuemax', '370');
});

test('restores matching-project presentation, isolates a new project, and falls back after storage corruption', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.addInitScript(({ key, projectId, rootBoneId }) => {
		localStorage.setItem(key, JSON.stringify({
			version: 1,
			globalDensity: 'list',
			projects: {
				[projectId]: {
					layout: {
						leftDockWidth: 312,
						rightDockWidth: 304,
						timelineHeight: 320,
						leftDockCollapsed: false,
						rightDockCollapsed: false
					},
					leftDockTab: 'draw-order',
					rightDockTab: 'assets',
					assetDensity: 'thumbnail',
					rigExpandedIds: [rootBoneId],
					hiddenEntityIds: [],
					selectionHistory: [],
					timelineRowMode: 'selection',
					timelineExpandedIds: [],
					pinnedTimelineEntityIds: [],
					collapsedInspectorSections: []
				}
			}
		}));
	}, { key: UI_PREFERENCES_STORAGE_KEY, projectId: EXAMPLE_PROJECT_ID, rootBoneId: EXAMPLE_ROOT_BONE_ID });
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();

	const leftSplitter = page.getByRole('separator', { name: 'Resize left dock' });
	const rightSplitter = page.getByRole('separator', { name: 'Resize right dock' });

	await expect(leftSplitter).toHaveAttribute('aria-valuenow', '312');
	await expect(rightSplitter).toHaveAttribute('aria-valuenow', '304');
	await expect(page.getByRole('tab', { name: 'Draw Order' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('tab', { name: 'Assets' })).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('button', { name: 'Project' }).click();
	page.once('dialog', (dialog) => void dialog.accept());
	await page.getByRole('menuitem', { name: 'New project' }).click();
	await expect(leftSplitter).toHaveAttribute('aria-valuenow', '248');
	await expect(rightSplitter).toHaveAttribute('aria-valuenow', '286');
	await expect(page.getByRole('tab', { name: 'Rig' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(leftSplitter).toHaveAttribute('aria-valuenow', '312');
	await expect(rightSplitter).toHaveAttribute('aria-valuenow', '304');
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example' })).toBeVisible();
	await page.waitForTimeout(800);

	await page.addInitScript((key) => localStorage.setItem(key, '{broken'), UI_PREFERENCES_STORAGE_KEY);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example' })).toBeVisible();
	await expect(page.getByRole('separator', { name: 'Resize left dock' })).toHaveAttribute('aria-valuenow', '248');
	await expect(page.getByRole('separator', { name: 'Resize right dock' })).toHaveAttribute('aria-valuenow', '286');
	await expect(page.getByRole('tab', { name: 'Rig' })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true');
});
