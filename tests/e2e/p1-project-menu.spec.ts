import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';

const openProjectMenu = async function openProjectMenu(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Project', exact: true }).click();
};

const loadExample = async function loadExample(page: Page): Promise<void> {
	await openProjectMenu(page);
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
};

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
	await expect(page.getByRole('heading', { name: 'Cutout Adventurer Example', exact: true })).toBeVisible();
	await expect(page.getByText('Saved locally', { exact: true })).toBeVisible({ timeout: 5000 });

	await openProjectMenu(page);
	await page.getByRole('menuitem', { name: 'Open recent', exact: true }).click();
	const recent = page.getByRole('dialog', { name: 'Open recent projects', exact: true });
	const exampleRow = recent.getByRole('button', { name: /Cutout Adventurer Example/ });

	await expect(exampleRow).toBeVisible({ timeout: 5000 });
	const confirmation = page.waitForEvent('dialog');
	await exampleRow.click();
	await (await confirmation).accept();
	await expect(page.getByRole('heading', { name: 'Cutout Adventurer Example', exact: true })).toBeVisible();
});

test('exports a project archive and validates it before replacement', async ({ page }) => {
	await page.goto('/');
	await loadExample(page);
	await expect(page.getByRole('heading', { name: 'Cutout Adventurer Example', exact: true })).toBeVisible();

	const downloadPromise = page.waitForEvent('download');
	await openProjectMenu(page);
	await page.getByRole('menuitem', { name: 'Export project archive', exact: true }).click();
	const download = await downloadPromise;
	const archivePath = await download.path();

	if (!archivePath) {
		throw new Error('The project archive download path is unavailable.');
	}

	const archiveEntries = unzipSync(await readFile(archivePath));
	const projectBytes = archiveEntries['project.json'];

	if (!projectBytes) {
		throw new Error('The project archive does not contain project.json.');
	}

	const projectText = new TextDecoder().decode(projectBytes);
	const assetEntries = Object.entries(archiveEntries).filter(([path]) => path.startsWith('assets/'));

	['body_front.png', 'head.png', 'arm.png', 'hand.png', 'leg.png'].forEach((assetName) => {
		expect(projectText).toContain(`"name": "${assetName}"`);
	});
	expect(assetEntries).toHaveLength(5);
	expect(assetEntries.every(([path, bytes]) => path.endsWith('.png') && bytes.byteLength > 0)).toBe(true);

	expect(download.suggestedFilename()).toBe('Cutout-Adventurer-Example.rigatta');
	const archiveInput = page.locator('input[type="file"]');

	page.once('dialog', (dialog) => void dialog.accept());
	await archiveInput.setInputFiles(archivePath);
	await expect(page.getByRole('heading', { name: 'Cutout Adventurer Example', exact: true })).toBeVisible();

	await archiveInput.setInputFiles({ name: 'invalid.rigatta', mimeType: 'application/zip', buffer: Buffer.from('not a zip archive') });
	await expect(page.getByText(/Could not read \.rigatta archive/)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Cutout Adventurer Example', exact: true })).toBeVisible();
});
