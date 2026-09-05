import { expect, test, type Download } from '@playwright/test';
import {
	exportDialogFor,
	exportZip,
	importProjectFixture,
	inspectExportGroup,
	installExportProofControls,
	loadExample,
	packedExampleProject,
	retryZip,
	setExportProofControl,
	waitForExportStatus
} from './export-fixtures.ts';

test.describe.configure({ timeout: 120000 });

test('downloads and validates the built-in example as combined grid output', async ({ page }) => {
	await installExportProofControls(page);
	await loadExample(page);
	const dialog = await exportDialogFor(page);

	await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
	await dialog.getByRole('checkbox', { name: 'Export clip walk', exact: true }).check();
	const result = await exportZip(page, dialog);

	await waitForExportStatus(page, 'completed');
	expect(result.download.suggestedFilename()).toBe('Cutout-Adventurer-Example.zip');
	await inspectExportGroup(page, result.entries, {
		directory: '',
		clipNames: ['walk'],
		frameCount: 12,
		atlasMode: 'grid',
		maxTextureSize: 2048,
		expectedPageCount: 1
	});
});

test('downloads and validates the built-in example as per-clip grid output', async ({ page }) => {
	await installExportProofControls(page);
	await loadExample(page);
	const dialog = await exportDialogFor(page);

	await dialog.getByRole('radio', { name: 'One output per clip', exact: true }).check();
	await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
	await dialog.getByRole('checkbox', { name: 'Export clip walk', exact: true }).check();
	const result = await exportZip(page, dialog);

	await waitForExportStatus(page, 'completed');
	await inspectExportGroup(page, result.entries, {
		directory: 'walk',
		clipNames: ['walk'],
		frameCount: 12,
		atlasMode: 'grid',
		maxTextureSize: 2048,
		expectedPageCount: 1
	});
	expect(Object.keys(result.entries).every((path) => path.startsWith('walk/'))).toBe(true);
});

test('downloads and validates the built-in example as combined packed output', async ({ page }) => {
	await installExportProofControls(page);
	await importProjectFixture(page, packedExampleProject(512));
	const dialog = await exportDialogFor(page);
	const result = await exportZip(page, dialog);

	await waitForExportStatus(page, 'completed');
	await inspectExportGroup(page, result.entries, {
		directory: '',
		clipNames: ['walk'],
		frameCount: 12,
		atlasMode: 'packed',
		maxTextureSize: 512,
		expectedPageCount: 1
	});
});

test('downloads and validates every page in a forced multipage packed export', async ({ page }) => {
	await installExportProofControls(page);
	await importProjectFixture(page, packedExampleProject(256));
	const dialog = await exportDialogFor(page);
	const result = await exportZip(page, dialog);

	await waitForExportStatus(page, 'completed');
	await inspectExportGroup(page, result.entries, {
		directory: '',
		clipNames: ['walk'],
		frameCount: 12,
		atlasMode: 'packed',
		maxTextureSize: 256,
		expectedPageCount: 'multiple'
	});
});

test('cancels at a controllable capture boundary and completes a clean retry', async ({ page }) => {
	await installExportProofControls(page);
	await loadExample(page);
	const dialog = await exportDialogFor(page);
	const downloads: Download[] = [];

	page.on('download', (download) => downloads.push(download));
	await setExportProofControl(page, { captureDelayMs: 250 });
	await dialog.getByRole('button', { name: 'Export ZIP', exact: true }).click();
	await waitForExportStatus(page, 'rendering');
	await expect(dialog.getByRole('radio', { name: 'One output per clip', exact: true })).toBeDisabled();
	await expect(dialog.getByRole('checkbox', { name: 'Export clip walk', exact: true })).toBeDisabled();
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await waitForExportStatus(page, 'cancelled');

	expect(downloads).toHaveLength(0);
	await expect(dialog).toBeVisible();
	await setExportProofControl(page, { captureDelayMs: 0 });
	await dialog.getByRole('button', { name: 'Retry', exact: true }).focus();
	await expect(dialog.getByRole('button', { name: 'Retry', exact: true })).toBeFocused();
const retry = await retryZip(page, dialog);

	await waitForExportStatus(page, 'completed');
	expect(downloads).toHaveLength(1);
	await inspectExportGroup(page, retry.entries, {
		directory: '',
		clipNames: ['walk'],
		frameCount: 12,
		atlasMode: 'grid',
		maxTextureSize: 2048,
		expectedPageCount: 1
	});
});

test('shows render failure recovery without a partial download', async ({ page }) => {
	await installExportProofControls(page);
	await loadExample(page);
	const dialog = await exportDialogFor(page);
	const downloads: Download[] = [];

	page.on('download', (download) => downloads.push(download));
	await setExportProofControl(page, { failCapture: true });
	await dialog.getByRole('button', { name: 'Export ZIP', exact: true }).click();
	await waitForExportStatus(page, 'failed');
	await expect(dialog.getByRole('alert')).toContainText('Canvas PNG extraction returned no data.');
	expect(downloads).toHaveLength(0);

	await setExportProofControl(page, { failCapture: false });
	const retry = await retryZip(page, dialog);

	await waitForExportStatus(page, 'completed');
	expect(downloads).toHaveLength(1);
	expect(retry.download.suggestedFilename()).toBe('Cutout-Adventurer-Example.zip');
});

test('shows download failure and completes a later retry exactly once', async ({ page }) => {
	await installExportProofControls(page);
	await loadExample(page);
	const dialog = await exportDialogFor(page);
	const downloads: Download[] = [];

	page.on('download', (download) => downloads.push(download));
	await setExportProofControl(page, { failDownload: true });
	await dialog.getByRole('button', { name: 'Export ZIP', exact: true }).click();
	await waitForExportStatus(page, 'failed');
	await expect(dialog.getByRole('alert')).toContainText('Synthetic browser download failure.');
	expect(downloads).toHaveLength(0);

	await setExportProofControl(page, { failDownload: false });
	const retry = await retryZip(page, dialog);

	await waitForExportStatus(page, 'completed');
	expect(downloads).toHaveLength(1);
	expect(retry.download.suggestedFilename()).toBe('Cutout-Adventurer-Example.zip');
});
