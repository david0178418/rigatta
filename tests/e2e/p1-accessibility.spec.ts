import { expect, test, type Locator } from '@playwright/test';

const tooltipFor = function tooltipFor(button: Locator): Locator {
	return button.locator('xpath=..').getByRole('tooltip');
};

test('shows action tooltips for compact workspace and viewport controls', async ({ page }) => {
	await page.goto('/');

	const leftDockToggle = page.getByRole('button', { name: 'Collapse left dock', exact: true });
	await leftDockToggle.hover();
	await expect(tooltipFor(leftDockToggle)).toBeVisible();
	await leftDockToggle.focus();
	await expect(tooltipFor(leftDockToggle)).toBeVisible();
	await expect(tooltipFor(leftDockToggle)).toHaveText('Collapse left dock');

	await page.getByRole('tab', { name: 'Assets', exact: true }).click();
	const importImages = page.locator('.asset-browser').getByRole('button', { name: 'Import image directory', exact: true });
	await importImages.focus();
	await expect(tooltipFor(importImages)).toBeVisible();
	await expect(tooltipFor(importImages)).toHaveText('Import image directory');

	const zoomOut = page.getByRole('button', { name: 'Zoom out', exact: true });
	await zoomOut.focus();
	await expect(tooltipFor(zoomOut)).toBeVisible();
	await expect(tooltipFor(zoomOut)).toHaveText('Zoom out');
});

test('shows action and state tooltips for rig toggles and key diamonds', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();

	const root = page.getByRole('treeitem', { name: 'Bone: root', exact: true });
	const disclosure = root.locator('.tree-disclosure');
	await disclosure.focus();
	await expect(tooltipFor(disclosure)).toBeVisible();
	await expect(tooltipFor(disclosure)).toHaveText(/(Expand|Collapse) bone root/);
	await disclosure.click();

	const visibility = root.locator('.tree-visibility');
	await visibility.focus();
	await expect(tooltipFor(visibility)).toBeVisible();
	await expect(tooltipFor(visibility)).toHaveText('Hide bone root');
	await expect(visibility).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Create animation clip', exact: true }).click();
	const key = page.getByRole('button', { name: 'Add X key at frame 1', exact: true });
	await key.focus();
	await expect(tooltipFor(key)).toBeVisible();
	await expect(tooltipFor(key)).toHaveText('Add X key at frame 1 · Unkeyed');
});

test('exposes transform tools as a labelled keyboard toolbar', async ({ page }) => {
	await page.goto('/');

	const toolbar = page.getByRole('toolbar', { name: 'Transform tools', exact: true });
	await expect(toolbar).toBeVisible();
	await expect(toolbar.getByRole('button', { name: 'Move', exact: true })).toHaveAttribute('aria-pressed', 'true');

	const move = toolbar.getByRole('button', { name: 'Move', exact: true });
	const rotate = toolbar.getByRole('button', { name: 'Rotate', exact: true });
	const grid = toolbar.getByRole('button', { name: 'Grid settings', exact: true });
	await expect(move).toHaveAttribute('tabindex', '0');
	await expect(rotate).toHaveAttribute('tabindex', '-1');
	await move.focus();
	await move.press('ArrowDown');
	await expect(rotate).toBeFocused();
	await expect(move).toHaveAttribute('tabindex', '-1');
	await expect(rotate).toHaveAttribute('tabindex', '0');
	await rotate.press('End');
	await expect(grid).toBeFocused();
	await expect(grid).toHaveAttribute('tabindex', '0');
	await grid.press('Home');
	await expect(move).toBeFocused();
	await expect(move).toHaveAttribute('tabindex', '0');
});

test('contains dialog focus and preserves selection when local Escape handlers close surfaces', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	const root = page.getByRole('button', { name: 'root', exact: true });
	await root.click();
	await expect(root).toHaveAttribute('aria-pressed', 'true');

	const search = page.getByLabel('Search rig', { exact: true });
	await search.fill('root');
	await search.press('?');
	await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
	await search.press('Escape');
	await expect(root).toHaveAttribute('aria-pressed', 'true');

	const project = page.getByRole('button', { name: 'Project', exact: true });
	await project.click();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('menu', { name: 'Project', exact: true })).toHaveCount(0);
	await expect(root).toHaveAttribute('aria-pressed', 'true');

	const grid = page.getByRole('button', { name: 'Grid settings', exact: true });
	await grid.click();
	const showGrid = page.getByLabel('Show grid', { exact: true });
	await showGrid.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Grid settings' })).toHaveCount(0);
	await expect(grid).toBeFocused();
	await expect(root).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Create animation clip', exact: true }).click();
	const exportButton = page.getByRole('button', { name: 'Export', exact: true });
	await exportButton.click();
	const exportDialog = page.getByRole('dialog', { name: 'Export animation' });
	await expect(exportDialog).toHaveAttribute('aria-modal', 'true');
	const exportMode = exportDialog.getByRole('radio', { name: 'Combined output', exact: true });
	await expect(exportDialog.getByRole('button', { name: 'Close Export animation', exact: true })).toBeFocused();
	await exportMode.focus();
	await exportMode.press('Escape');
	await expect(exportDialog).toHaveCount(0);
	await expect(exportButton).toBeFocused();
	await expect(root).toHaveAttribute('aria-pressed', 'true');

	const shortcutButton = page.getByRole('button', { name: 'Keyboard shortcuts', exact: true });
	await shortcutButton.click();
	const shortcutDialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
	const shortcutClose = shortcutDialog.getByRole('button', { name: 'Close Keyboard shortcuts', exact: true });
	await expect(shortcutClose).toBeFocused();
	await shortcutClose.press('Escape');
	await expect(shortcutDialog).toHaveCount(0);
	await expect(shortcutButton).toBeFocused();
	await expect(root).toHaveAttribute('aria-pressed', 'true');
});
