import { expect, test } from '@playwright/test';

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
