import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { UI_PREFERENCES_STORAGE_KEY } from '../../src/app/ui-preferences.ts';

const EXAMPLE_PROJECT_ID = '123e4567-e89b-42d3-a456-426614174100';
const EXAMPLE_ROOT_BONE_ID = '123e4567-e89b-42d3-a456-426614174102';

const loadExample = async function loadExample(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
};

const addTwoSlots = async function addTwoSlots(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Slot', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Slot', exact: true }).click();
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

test('opens draw-order keys in the right-dock Properties context', async ({ page }) => {
	await addTwoSlots(page);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Create animation clip', exact: true }).click();
	await page.getByRole('button', { name: 'Track details', exact: true }).click();
	await page.getByRole('combobox', { name: 'New track', exact: true }).selectOption({ label: 'Setup · Draw order' });
	await page.getByRole('button', { name: 'Add track', exact: true }).click();
	await page.getByRole('button', { name: 'Add key', exact: true }).click();

	const properties = page.getByRole('region', { name: 'Draw order properties', exact: true });
	await expect(properties).toBeVisible();
	await expect(properties).toContainText('Setup value · back to front');
	await expect(properties).toContainText('Current evaluated order · Keyed override from frame 1');
	await expect(properties).toContainText('Keyed value · frame 1');
	await expect(page.locator('.timeline-detail-surface')).toHaveCount(0);
	await expect(page.getByRole('tab', { name: 'Properties', exact: true })).toHaveAttribute('aria-selected', 'true');
});

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
	await expect(archiveText).toContain('"name": "Cutout Robot Example"');
	await expect(page.getByRole('button', { name: 'Project', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	page.once('dialog', (dialog) => void dialog.accept());
	await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Untitled project', exact: true })).toBeVisible();

	const archiveInput = page.locator('input[type="file"]');
	page.once('dialog', (dialog) => void dialog.accept());
	await archiveInput.setInputFiles({ name: 'sample.boneanim', mimeType: 'application/zip', buffer: archiveBytes });
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
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

test('clamps oversized project preferences without document overflow', async ({ page }) => {
	await page.setViewportSize({ width: 1120, height: 720 });
	await page.addInitScript(({ key, projectId, rootBoneId }) => {
		localStorage.setItem(key, JSON.stringify({
			version: 2,
			globalDensity: 'list',
			projects: {
				[projectId]: {
					layout: {
						leftDockWidth: Number.MAX_SAFE_INTEGER,
						rightDockWidth: Number.MAX_SAFE_INTEGER,
						timelineHeight: Number.MAX_SAFE_INTEGER,
						leftDockCollapsed: false,
						rightDockCollapsed: false
					},
					leftDockTab: 'rig',
					rightDockTab: 'properties',
					assetDensity: 'list',
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
	await loadExample(page);

	await expect(page.getByRole('separator', { name: 'Resize left dock' })).toHaveAttribute('aria-valuenow', '370');
	await expect(page.getByRole('separator', { name: 'Resize right dock' })).toHaveAttribute('aria-valuenow', '370');
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await expect(page.getByRole('separator', { name: 'Resize animation timeline' })).toHaveAttribute('aria-valuenow', '396');
	const documentBounds = await page.evaluate(() => ({
		height: document.documentElement.scrollHeight,
		width: document.documentElement.scrollWidth
	}));

	expect(documentBounds.width).toBeLessThanOrEqual(1120);
	expect(documentBounds.height).toBeLessThanOrEqual(720);
});

test('falls back to safe defaults after malformed preference storage', async ({ page }) => {
	await page.setViewportSize({ width: 1120, height: 720 });
	await page.addInitScript((key) => localStorage.setItem(key, '{broken'), UI_PREFERENCES_STORAGE_KEY);
	await loadExample(page);
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
	await expect(page.getByRole('separator', { name: 'Resize left dock' })).toHaveAttribute('aria-valuenow', '248');
	await expect(page.getByRole('separator', { name: 'Resize right dock' })).toHaveAttribute('aria-valuenow', '286');
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await expect(page.getByRole('separator', { name: 'Resize animation timeline' })).toHaveAttribute('aria-valuenow', '260');
});
