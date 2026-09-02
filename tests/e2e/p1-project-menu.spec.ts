import { expect, test, type Page } from '@playwright/test';

const openProjectMenu = async function openProjectMenu(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Project', exact: true }).click();
};

const loadExample = async function loadExample(page: Page): Promise<void> {
	await openProjectMenu(page);
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
};

test('organizes project lifecycle actions and fixed project settings in the Project menu', async ({ page }) => {
	await page.goto('/');

	await openProjectMenu(page);
	const menu = page.getByRole('menu', { name: 'Project', exact: true });

	await expect(menu.getByRole('menuitem', { name: 'New project', exact: true })).toBeVisible();
	await expect(menu.getByRole('menuitem', { name: 'Open recent', exact: true })).toBeVisible();
	await expect(menu.getByRole('menuitem', { name: 'Import .boneanim', exact: true })).toBeVisible();
	await expect(menu.getByRole('menuitem', { name: 'Export project archive', exact: true })).toBeVisible();
	await expect(menu.getByRole('menuitem', { name: 'Load example', exact: true })).toBeVisible();
	await expect(menu.getByRole('menuitem', { name: 'Project settings', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Load example', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveAttribute('title', 'Export sprite sheet');

	await menu.getByRole('menuitem', { name: 'Project settings', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Project settings', exact: true });

	await expect(settings).toContainText('Logical canvas: 1024 × 1024 px. Canvas bounds are fixed for this MVP.');
	await settings.getByLabel('Project name', { exact: true }).fill('Menu renamed project');
	await settings.getByRole('button', { name: 'Save name', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Menu renamed project', exact: true })).toBeVisible();
});

test('keeps authored projects intact when replacement is declined and opens recent projects', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();

	await openProjectMenu(page);
	page.once('dialog', (dialog) => void dialog.dismiss());
	await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
	await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();

	page.once('dialog', (dialog) => void dialog.accept());
	await openProjectMenu(page);
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
	await expect(page.getByText('Saved locally', { exact: true })).toBeVisible({ timeout: 5000 });

	await openProjectMenu(page);
	await page.getByRole('menuitem', { name: 'Open recent', exact: true }).click();
	const recent = page.getByRole('dialog', { name: 'Open recent projects', exact: true });
	const exampleRow = recent.getByRole('button', { name: /Cutout Robot Example/ });

	await expect(exampleRow).toBeVisible({ timeout: 5000 });
	const confirmation = page.waitForEvent('dialog');
	await exampleRow.click();
	await (await confirmation).accept();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
});

test('exports a project archive and validates it before replacement', async ({ page }) => {
	await page.goto('/');
	await loadExample(page);
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();

	const downloadPromise = page.waitForEvent('download');
	await openProjectMenu(page);
	await page.getByRole('menuitem', { name: 'Export project archive', exact: true }).click();
	const download = await downloadPromise;
	const archivePath = await download.path();

	if (!archivePath) {
		throw new Error('The project archive download path is unavailable.');
	}

	expect(download.suggestedFilename()).toBe('Cutout-Robot-Example.boneanim');
	const archiveInput = page.locator('input[type="file"]');

	page.once('dialog', (dialog) => void dialog.accept());
	await archiveInput.setInputFiles(archivePath);
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();

	await archiveInput.setInputFiles({ name: 'invalid.boneanim', mimeType: 'application/zip', buffer: Buffer.from('not a zip archive') });
	await expect(page.getByText(/Could not read \.boneanim archive/)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
});
