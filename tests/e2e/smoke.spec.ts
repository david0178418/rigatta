import { expect, test } from '@playwright/test';

test('opens the empty editor shell', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('Bone Animation Utility');
	await expect(page.getByRole('heading', { name: 'Untitled project' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Animate' })).toBeVisible();
	await expect(page.getByText('Drop image parts here')).toBeVisible();
});

test('recovers a committed root edit after reload', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await expect(page.getByText('root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
	await page.waitForTimeout(700);
	await page.reload();

	await expect(page.getByRole('heading', { name: 'Untitled project' })).toBeVisible();
	await expect(page.getByText('root', { exact: true })).toBeVisible();
});

test('renders a fixed logical canvas and exposes PNG extraction', async ({ page }) => {
	await page.goto('/');

	const canvas = page.locator('canvas.pixi-canvas');
	await expect(canvas).toBeVisible();
	expect(await canvas.getAttribute('width')).toBe('1024');
	expect(await canvas.getAttribute('height')).toBe('1024');

	const dataUrlPrefix = await page.evaluate(() => {
		const renderedCanvas = document.querySelector<HTMLCanvasElement>('canvas.pixi-canvas');

		if (!renderedCanvas) {
			throw new Error('The Pixi canvas was not mounted.');
		}

		return renderedCanvas.toDataURL('image/png').slice(0, 22);
	});

	expect(dataUrlPrefix).toBe('data:image/png;base64,');
});

test('supports viewport zoom controls and reset', async ({ page }) => {
	await page.goto('/');

	const zoom = page.getByRole('button', { name: 'Zoom in' });
	await zoom.click();
	await expect(page.getByRole('button', { name: 'Reset viewport' })).toHaveText('110%');

	await page.getByRole('button', { name: 'Center viewport' }).click();
	await expect(page.getByRole('button', { name: 'Reset viewport' })).toHaveText('100%');
});

test('configures setup grid visibility, spacing, and snapping', async ({ page }) => {
	await page.goto('/');

	const showGrid = page.getByLabel('Show grid');
	const gridSpacing = page.getByLabel('Grid spacing');
	const snapToGrid = page.getByLabel('Snap to grid');

	await expect(showGrid).toBeChecked();
	await showGrid.uncheck();
	await expect(showGrid).not.toBeChecked();
	await gridSpacing.fill('16');
	await gridSpacing.press('Tab');
	await expect(gridSpacing).toHaveValue('16');
	await snapToGrid.check();
	await expect(snapToGrid).toBeChecked();
});

test('creates, duplicates, renames, and configures animation clips', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await expect(page.getByRole('button', { name: 'clip 1', exact: true })).toBeVisible();
	await page.getByLabel('Clip name').fill('walk');
	await page.getByRole('button', { name: 'Rename', exact: true }).click();
	await expect(page.getByRole('button', { name: 'walk', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
	await expect(page.getByRole('button', { name: 'walk copy', exact: true })).toBeVisible();
	await page.getByLabel('Duration (sec)').fill('2');
	await page.getByLabel('FPS').fill('24');
	await page.getByLabel('Loop').uncheck();
	await page.getByRole('button', { name: 'Apply playback', exact: true }).click();
	await expect(page.getByLabel('Duration (sec)')).toHaveValue('2');
	await expect(page.getByLabel('FPS')).toHaveValue('24');
	await expect(page.getByLabel('Loop')).not.toBeChecked();
});

test('plays, pauses, and steps the active animation clip by frame', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'Step forward' }).click();
	await expect(page.getByText('Frame 2 / 12', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'Step backward' }).click();
	await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();
	await page.getByRole('button', { name: 'Play animation' }).click();
	await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible();
	await page.getByRole('button', { name: 'Pause animation' }).click();
	await expect(page.getByRole('button', { name: 'Play animation' })).toBeVisible();
	await page.getByLabel('Playhead').fill('5');
	await expect(page.getByText('Frame 6 / 12', { exact: false })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Play animation' })).toBeVisible();
});

test('navigates and filters the animation timeline', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByLabel('Duration (sec)').fill('3');
	await page.getByRole('button', { name: 'Apply playback', exact: true }).click();
	await expect(page.getByLabel('Timeline frame range')).toHaveText('Frames 1–20 of 36');
	await page.getByRole('button', { name: 'Zoom timeline in' }).click();
	await expect(page.getByText('125%', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Pan timeline right' }).click();
	await expect(page.getByLabel('Timeline frame range')).toHaveText('Frames 9–24 of 36');
	await page.getByLabel('Filter tracks').fill('bone');
	await expect(page.getByText('0 matching tracks', { exact: true })).toBeVisible();
});

test('creates, moves, copies, and deletes typed animation keys', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Add track' }).click();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add key' }).click();
	await expect(page.getByRole('button', { name: 'Key frame 1' })).toBeVisible();
	await page.getByRole('button', { name: 'Key frame 1' }).click();
	await page.getByRole('spinbutton', { name: 'Frame', exact: true }).fill('3');
	await page.getByRole('button', { name: 'Move key', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 3' })).toBeVisible();
	await page.getByRole('spinbutton', { name: 'Frame', exact: true }).fill('4');
	await page.getByRole('button', { name: 'Copy key', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 4' })).toBeVisible();
	await page.getByRole('button', { name: 'Delete key', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 4' })).toHaveCount(0);
});

test('retimes multiple selected animation keys together', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();
	await page.getByRole('combobox', { name: 'New track' }).selectOption({ label: 'root · Bone · y' });
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();
	const keys = page.getByRole('button', { name: 'Key frame 1' });
	await keys.nth(0).click();
	await keys.nth(1).click({ modifiers: ['Control'] });
	await expect(page.getByText('2 keys selected', { exact: true })).toBeVisible();
	await page.getByRole('spinbutton', { name: 'Offset frames', exact: true }).fill('2');
	await page.getByRole('button', { name: 'Retime selected keys', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 3' })).toHaveCount(2);
});

test('auto-keys changed transform properties by default', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await expect(page.getByLabel('Auto Key')).toBeChecked();
	await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('48');
	await page.getByRole('button', { name: 'Apply values', exact: true }).click();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Key frame 1' })).toBeVisible();
	await page.getByLabel('Auto Key').uncheck();
	await expect(page.getByLabel('Auto Key')).not.toBeChecked();
});

test('imports an image directory and creates a dropped image part', async ({ page }) => {
	await page.addInitScript(() => {
		const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gkBBxAXAvkWQwAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wOS0wMVQwNzoxNjoyMyswMDowMMxohAEAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDktMDFUMDc6MTY6MjMrMDA6MDC9NTy9AAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA5LTAxVDA3OjE2OjIzKzAwOjAw6iAdYgAAAA9JREFUKM9jYBgFo4B8AAACQAABjMWrdwAAAABJRU5ErkJggg=='), (character) => character.charCodeAt(0));
		type MockFileEntry = Readonly<{
			kind: 'file';
			name: string;
			isSameEntry: (other: FileSystemHandle) => Promise<boolean>;
			getFile: () => Promise<File>;
		}>;
		const sameEntry = async function sameEntry(): Promise<boolean> {
			return false;
		};
		const getFile = async function getFile(): Promise<File> {
			return new File([pngBytes], 'hero.png', { type: 'image/png' });
		};
		const getAlternateFile = async function getAlternateFile(): Promise<File> {
			return new File([pngBytes], 'alt.png', { type: 'image/png' });
		};
		const values = async function* values(): AsyncGenerator<MockFileEntry> {
			yield { kind: 'file', name: 'hero.png', isSameEntry: sameEntry, getFile };
			yield { kind: 'file', name: 'alt.png', isSameEntry: sameEntry, getFile: getAlternateFile };
		};

		Object.defineProperty(window, 'showDirectoryPicker', {
			configurable: true,
			value: async () => ({
				kind: 'directory',
				name: 'parts',
				isSameEntry: sameEntry,
				values
			})
		});
	});
	await page.goto('/');

	await page.getByRole('button', { name: 'Import image directory' }).click();
	await expect(page.getByText('hero.png', { exact: true })).toBeVisible();
	await expect(page.getByText('alt.png', { exact: true })).toBeVisible();
	await page.locator('.asset-row').filter({ hasText: 'hero.png' }).dragTo(page.locator('.pixi-viewport'));

	await expect(page.getByText('root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
	await page.getByRole('button', { name: 'root' }).click();
	const viewport = page.locator('.pixi-viewport');
	const bounds = await viewport.boundingBox();

	if (!bounds) {
		throw new Error('The viewport bounds are unavailable.');
	}

	await page.keyboard.down('Control');
	await page.keyboard.down('Shift');
	await page.mouse.move(bounds.x + bounds.width / 2 - 50, bounds.y + bounds.height / 2 - 50);
	await page.mouse.down();
	await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2 + 50);
	await page.mouse.up();
	await page.keyboard.up('Shift');
	await page.keyboard.up('Control');
	await expect(page.getByText('2 items selected.', { exact: true })).toBeVisible();
	const multiSelectionX = page.getByRole('spinbutton', { name: 'X', exact: true });
	const multiSelectionY = page.getByRole('spinbutton', { name: 'Y', exact: true });
	const originalMultiSelectionX = await multiSelectionX.inputValue();
	const imageLogicalX = Number(originalMultiSelectionX);
	const imageLogicalY = Number(await multiSelectionY.inputValue());
	await page.mouse.move(
		bounds.x + bounds.width / 2 + (imageLogicalX - 512) * bounds.width / 1024,
		bounds.y + bounds.height / 2 + (imageLogicalY - 512) * bounds.height / 1024
	);
	await page.mouse.down();
	await page.mouse.move(
		bounds.x + bounds.width / 2 + (imageLogicalX - 512) * bounds.width / 1024 + 18,
		bounds.y + bounds.height / 2 + (imageLogicalY - 512) * bounds.height / 1024
	);
	await page.mouse.up();
	await expect(multiSelectionX).not.toHaveValue(originalMultiSelectionX);
	await page.locator('.slot-row').click();
	const setupImage = page.getByRole('combobox', { name: 'Setup image' });
	await expect(setupImage).toHaveValue(/.+/);
	await page.locator('.asset-row').filter({ hasText: 'alt.png' }).dragTo(page.locator('.slot-row'));
	await page.locator('.slot-row').click();
	const alternateAttachmentId = await page.getByRole('option', { name: 'alt.png' }).getAttribute('value');

	if (!alternateAttachmentId) {
		throw new Error('The alternate attachment ID is unavailable.');
	}

	await expect(page.getByRole('combobox', { name: 'Setup image' })).toHaveValue(alternateAttachmentId);
	const alternateAttachment = page.locator('.attachment-row').filter({ hasText: 'alt.png' });
	await alternateAttachment.click();
	const alternateLocalX = Number(await page.getByRole('spinbutton', { name: 'X', exact: true }).inputValue());
	const alternateLocalY = Number(await page.getByRole('spinbutton', { name: 'Y', exact: true }).inputValue());
	await page.getByRole('button', { name: 'root', exact: true }).click();
	const rootX = Number(await page.getByRole('spinbutton', { name: 'X', exact: true }).inputValue());
	const rootY = Number(await page.getByRole('spinbutton', { name: 'Y', exact: true }).inputValue());
	await alternateAttachment.click();
	const xField = page.getByRole('spinbutton', { name: 'X', exact: true });
	const originalX = await xField.inputValue();
	const imageBounds = await viewport.boundingBox();

	if (!imageBounds) {
		throw new Error('The viewport bounds are unavailable.');
	}

	const alternateWorldX = rootX + alternateLocalX;
	const alternateWorldY = rootY + alternateLocalY;
	const alternateScreenX = imageBounds.x + imageBounds.width / 2 + (alternateWorldX - 512) * imageBounds.width / 1024;
	const alternateScreenY = imageBounds.y + imageBounds.height / 2 + (alternateWorldY - 512) * imageBounds.height / 1024;
	await page.mouse.move(alternateScreenX, alternateScreenY);
	await page.mouse.down();
	await page.mouse.move(alternateScreenX + 24, alternateScreenY);
	await page.mouse.up();
	await expect(xField).not.toHaveValue(originalX);
});

test('builds and edits a hierarchy through the inspector', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add child bone' }).click();
	await expect(page.getByRole('button', { name: 'bone', exact: true })).toBeVisible();
	await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('24');
	await page.getByLabel('Rotation (deg)', { exact: true }).fill('15');
	await page.getByRole('button', { name: 'Apply values' }).click();
	await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toHaveValue('24');

	await page.getByLabel('Selected name').fill('arm');
	await page.getByRole('button', { name: 'Rename' }).click();
	await expect(page.getByRole('button', { name: 'arm', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add slot' }).click();
	await expect(page.getByRole('button', { name: 'slot', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'arm', exact: true }).click();
	await page.getByRole('button', { name: 'Add point' }).click();
	await expect(page.getByRole('button', { name: 'point', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByRole('button', { name: 'point', exact: true })).toHaveCount(0);
});

test('reparents a bone through hierarchy drag and drop', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add child bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add child bone' }).click();

	const bones = page.locator('.bone-row');
	await expect(bones).toHaveCount(3);
	const targetId = await bones.nth(1).getAttribute('data-bone-id');

	if (!targetId) {
		throw new Error('The target bone ID is unavailable.');
	}

	await bones.nth(2).dragTo(bones.nth(1));
	await expect(bones.nth(2)).toHaveAttribute('data-parent-id', targetId);
});

test('reorders setup slots through hierarchy drag and drop', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add slot' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add slot' }).click();

	const slots = page.locator('.slot-row');
	await expect(slots).toHaveCount(2);
	await slots.nth(0).dragTo(slots.nth(1));
	await expect(slots.nth(0)).toHaveAttribute('data-draw-order-index', '1');
	await expect(slots.nth(1)).toHaveAttribute('data-draw-order-index', '0');
});
