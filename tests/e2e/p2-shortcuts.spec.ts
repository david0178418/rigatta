import { expect, test } from '@playwright/test';

test('routes the single W/E/R/T transform mapping and ignores typing targets', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone' }).click();

	const toolbar = page.getByTestId('canvas-toolbar');
	const tools = [
		{ key: 'W', name: 'Move', shortcut: 'W' },
		{ key: 'E', name: 'Rotate', shortcut: 'E' },
		{ key: 'R', name: 'Scale', shortcut: 'R' },
		{ key: 'T', name: 'Shear', shortcut: 'T' }
	] as const;

	await tools.reduce(async (previous, tool) => {
		await previous;
		await page.keyboard.press(tool.key);
		const button = toolbar.getByRole('button', { name: tool.name, exact: true });

		await expect(button).toHaveAttribute('aria-pressed', 'true');
		await expect(button).toHaveAttribute('aria-keyshortcuts', tool.shortcut);
		await expect(button).toHaveAttribute('title', `${tool.name} · ${tool.shortcut}`);
	}, Promise.resolve());

	const search = page.getByLabel('Search rig');
	await search.focus();
	await page.keyboard.press('W');
	await expect(toolbar.getByRole('button', { name: 'Shear', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await search.fill('');
	await page.keyboard.press('Space');
	await expect(search).toHaveValue(' ');
	await search.fill('root');
	await expect(search).toHaveValue('root');

	await toolbar.getByRole('button', { name: 'Move', exact: true }).click();
	await page.keyboard.press('R');
	await expect(toolbar.getByRole('button', { name: 'Scale', exact: true })).toHaveAttribute('aria-pressed', 'true');

	await page.keyboard.press('?');
	const reference = page.getByRole('dialog', { name: 'Keyboard shortcuts' });

	await expect(reference).toBeVisible();
	await expect(reference).toContainText('Move / translate tool');
	await expect(reference).toContainText('Key edited properties');
	await expect(reference).toContainText('Page Down');
	await page.getByRole('button', { name: 'Close Keyboard shortcuts' }).click();
});

test('routes F2 rename, K edited-property keying, Escape clear, and selection history', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone' }).click();

	const root = page.getByRole('button', { name: 'root', exact: true });
	await root.click();
	await page.keyboard.press('F2');

	const rename = page.getByRole('textbox', { name: 'Rename root', exact: true });
	await expect(rename).toBeFocused();
	await rename.fill('renamed root');
	await rename.press('Enter');
	await expect(page.getByRole('button', { name: 'renamed root', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'renamed root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	const child = page.getByRole('button', { name: 'bone', exact: true });
	await expect(child).toBeVisible();

	await page.getByRole('button', { name: 'renamed root', exact: true }).click();
	await child.click();
	await page.keyboard.press('PageUp');
	await expect(page.getByRole('button', { name: 'renamed root', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('PageDown');
	await expect(child).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('button', { name: 'Previous selection', exact: true }).click();
	await expect(page.getByRole('button', { name: 'renamed root', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Next selection', exact: true }).click();
	await expect(child).toHaveAttribute('aria-pressed', 'true');

	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Create animation clip', exact: true }).click();
	await page.getByLabel('Auto Key').uncheck();
	await page.locator('input[name="x"]').fill('48');
	await page.locator('input[name="x"]').press('Enter');
	await expect(page.getByRole('button', { name: 'Key edited properties (1)', exact: true })).toBeEnabled();

	await page.getByRole('button', { name: 'bone', exact: true }).click();
	await page.keyboard.press('k');
	await expect(page.getByRole('button', { name: 'Remove X key at frame 1', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add Y key at frame 1', exact: true })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: 'bone', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('routes Delete to the mouse-equivalent selection deletion', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	const child = page.getByRole('button', { name: 'bone', exact: true });

	await child.click();

	page.once('dialog', (dialog) => void dialog.accept());
	await page.keyboard.press('Delete');
	await expect(child).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();
});
