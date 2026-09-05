import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';

const loadExample = async function loadExample(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Adventurer Example', exact: true })).toBeVisible();
};

const archiveFromDownload = async function archiveFromDownload(page: Page): Promise<Buffer> {
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Export project archive', exact: true }).click();
	const download = await downloadPromise;
	const archivePath = await download.path();

	if (!archivePath) {
		throw new Error('The project archive download path is unavailable.');
	}

	return readFile(archivePath);
};

const projectJsonFromArchive = function projectJsonFromArchive(archive: Uint8Array): string {
	const entries = unzipSync(archive);
	const projectEntry = entries['project.json'];

	if (!projectEntry) {
		throw new Error('The project archive does not contain project.json.');
	}

	return strFromU8(projectEntry);
};

test('keeps invalid direct numeric drafts out of project history', async ({ page }) => {
	await loadExample(page);
	await page.getByRole('button', { name: 'root', exact: true }).click();

	const x = page.getByRole('spinbutton', { name: 'X', exact: true });
	await x.fill('12');
	await x.press('Enter');
	await expect(x).toHaveValue('12');

	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(x).toHaveValue('128');
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

	await x.fill('');
	await x.press('Enter');
	await expect(x).toHaveAttribute('aria-invalid', 'true');
	await expect(page.getByRole('alert')).toContainText('X is required.');
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

	await page.getByRole('tab', { name: 'Assets', exact: true }).click();
	await page.getByRole('tab', { name: 'Properties', exact: true }).click();
	await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('128');
});

test('recovers committed work after reload and restores an imported archive', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await expect(page.getByText('Saved locally', { exact: true })).toBeVisible({ timeout: 5000 });
	await page.waitForTimeout(250);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Untitled project', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();

	page.once('dialog', (dialog) => void dialog.accept());
	await loadExample(page);
	const archiveBytes = await archiveFromDownload(page);
	const archiveText = projectJsonFromArchive(archiveBytes);
	await expect(archiveText).toContain('"name": "Cutout Adventurer Example"');
	await expect(page.getByRole('button', { name: 'Project', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	page.once('dialog', (dialog) => void dialog.accept());
	await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Untitled project', exact: true })).toBeVisible();

	const archiveInput = page.locator('input[type="file"]');
	page.once('dialog', (dialog) => void dialog.accept());
	await archiveInput.setInputFiles({ name: 'sample.rigatta', mimeType: 'application/zip', buffer: archiveBytes });
	await expect(page.getByRole('heading', { name: 'Cutout Adventurer Example', exact: true })).toBeVisible();
});

test('applies one shared edit, undoes it once, and keeps presentation state out of archives', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();

	const root = page.getByRole('button', { name: 'root', exact: true });
	const child = page.getByRole('button', { name: 'bone', exact: true });
	await root.click();
	await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('10');
	await page.getByRole('spinbutton', { name: 'X', exact: true }).press('Enter');
	await child.click();
	await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('20');
	await page.getByRole('spinbutton', { name: 'X', exact: true }).press('Enter');

	await root.click();
	await child.click({ modifiers: ['Control'] });
	const sharedX = page.getByRole('spinbutton', { name: 'X', exact: true });
	await expect(sharedX).toHaveValue('');
	await sharedX.fill('30');
	await sharedX.press('Enter');

	await root.click();
	await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('30');
	await child.click();
	await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('30');
	await page.getByRole('button', { name: 'Undo', exact: true }).click();

	await root.click();
	await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('10');
	await child.click();
	await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('20');

	await page.getByRole('treeitem', { name: 'Bone: root', exact: true }).locator('.tree-visibility').click();
	const archiveText = projectJsonFromArchive(await archiveFromDownload(page));
	await expect(archiveText).not.toContain('hiddenEntityIds');
	await expect(archiveText).not.toContain('uiPreferences');
	await expect(archiveText).toContain('"name": "Untitled project"');
});
