import { expect, test } from '@playwright/test';

test('opens the empty editor shell', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('Bone Animation Utility');
	await expect(page.getByRole('heading', { name: 'Untitled project' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Animate' })).toBeVisible();
	await expect(page.getByText('Drop image parts here')).toBeVisible();
});

test('loads the built-in example project', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Load example' }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Animate' }).click();
	await expect(page.getByRole('button', { name: 'pulse', exact: true })).toBeVisible();
	await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();
});

test('renders the evaluated animation pose in the viewport', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Load example' }).click();
	await page.getByRole('button', { name: 'Animate' }).click();

	const canvas = page.locator('canvas.pixi-canvas');
	await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();
	const firstFrame = await canvas.evaluate((element) => {
		if (!(element instanceof HTMLCanvasElement)) {
			throw new Error('The Pixi canvas was not mounted.');
		}

		return element.toDataURL('image/png');
	});

	await page.getByRole('button', { name: 'Step forward' }).click();
	await expect(page.getByText('Frame 2 / 12', { exact: false })).toBeVisible();
	await expect.poll(async () => canvas.evaluate((element) => {
		if (!(element instanceof HTMLCanvasElement)) {
			throw new Error('The Pixi canvas was not mounted.');
		}

		return element.toDataURL('image/png');
	})).not.toBe(firstFrame);
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
	await page.getByRole('button', { name: 'Clip settings' }).click();
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

test('selects clips and output grouping for export', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: '+ Clip', exact: true }).click();
	await page.getByRole('button', { name: 'Export', exact: true }).click();

	await expect(page.getByRole('region', { name: 'Export controls' })).toBeVisible();
	await expect(page.getByRole('radio', { name: 'Combined output' })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'Export clip clip 1' })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'Export clip clip 2' })).toBeChecked();
	await page.getByRole('checkbox', { name: 'Export clip clip 1' }).uncheck();
	await expect(page.getByText('1 of 2 clips selected.', { exact: true })).toBeVisible();
	await page.getByRole('radio', { name: 'One output per clip' }).check();
	await expect(page.getByRole('radio', { name: 'One output per clip' })).toBeChecked();
	await page.getByRole('button', { name: 'Clear', exact: true }).click();
	await expect(page.getByText('0 of 2 clips selected.', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Select all', exact: true }).click();
	await expect(page.getByText('2 of 2 clips selected · all clips.', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Close export controls' }).click();
	await expect(page.getByRole('region', { name: 'Export controls' })).toHaveCount(0);
});

test('supports keyboard shortcuts and shortcut reference', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();
	await page.keyboard.press('Control+z');
	await expect(page.getByRole('button', { name: 'root', exact: true })).toHaveCount(0);
	await page.keyboard.press('Control+Shift+z');
	await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.keyboard.press('Space');
	await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible();
	await page.keyboard.press('Space');
	await expect(page.getByRole('button', { name: 'Play animation' })).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByText('Frame 2 / 12', { exact: false })).toBeVisible();

	await page.keyboard.press('?');
	await expect(page.getByRole('region', { name: 'Keyboard shortcuts' })).toBeVisible();
	await page.getByRole('button', { name: 'Close keyboard shortcuts' }).click();
	await expect(page.getByRole('region', { name: 'Keyboard shortcuts' })).toHaveCount(0);
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
	await page.getByRole('button', { name: 'Clip settings' }).click();
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
	await page.getByRole('button', { name: 'Track details' }).click();
	await page.getByRole('button', { name: 'Add track' }).click();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add key' }).click();
	await expect(page.getByRole('button', { name: 'Key frame 1' })).toBeVisible();
	await page.getByRole('button', { name: 'Close Track details' }).click();
	await page.getByRole('button', { name: 'Key frame 1' }).click();
	await page.getByRole('button', { name: 'Key details' }).click();
	await page.getByRole('spinbutton', { name: 'Frame', exact: true }).fill('3');
	await page.getByRole('button', { name: 'Move key', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 3' })).toBeVisible();
	await page.getByRole('spinbutton', { name: 'Frame', exact: true }).fill('4');
	await page.getByRole('button', { name: 'Copy key', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 4' })).toBeVisible();
	await page.getByRole('button', { name: 'Delete key', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 4' })).toHaveCount(0);
});

test('creates and edits timeline events', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Add event', exact: true }).click();
	await page.getByRole('button', { name: 'Event event at frame 1', exact: true }).click();
	await page.getByRole('button', { name: 'Event details' }).click();
	await page.getByLabel('Event name').fill('impact');
	await page.getByLabel('Payload JSON').fill('{"damage":4,"tags":["hit"]}');
	await page.getByRole('button', { name: 'Apply event', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Event impact at frame 1', exact: true })).toBeVisible();
	await page.getByRole('spinbutton', { name: 'Event frame', exact: true }).fill('3');
	await page.getByRole('button', { name: 'Move event', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Event impact at frame 3', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Delete event', exact: true }).click();
	await expect(page.locator('.event-key')).toHaveCount(0);
});

test('keys point transform and enabled state', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add point' }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Track details' }).click();
	await page.getByRole('combobox', { name: 'New track' }).selectOption({ label: 'point · Point · x' });
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();
	await page.getByRole('combobox', { name: 'New track' }).selectOption({ label: 'point · Point · enabled' });
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();

	await expect(page.getByRole('button', { name: 'Key frame 1' })).toHaveCount(2);
});

test('keys rectangle rotation, dimensions, and enabled state', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add rectangle' }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Track details' }).click();
	await page.getByRole('combobox', { name: 'New track' }).selectOption({ label: 'rectangle · Rectangle · rotation' });
	await page.getByRole('button', { name: 'Add track' }).click();
	await expect(page.getByText('Image transform · rotation · rectangle', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add key' }).click();
	await page.getByRole('combobox', { name: 'New track' }).selectOption({ label: 'rectangle · Rectangle · width' });
	await page.getByRole('button', { name: 'Add track' }).click();
	await expect(page.getByText('Rectangle size · width · rectangle', { exact: true })).toBeVisible();
	await page.getByText('Rectangle size · width · rectangle', { exact: true }).click();
	await expect(page.getByText('Selected: Rectangle size · width · rectangle', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add key' }).click();
	await page.getByRole('combobox', { name: 'New track' }).selectOption({ label: 'rectangle · Rectangle · enabled' });
	await page.getByRole('button', { name: 'Add track' }).click();
	await expect(page.getByText('Rectangle enabled · rectangle', { exact: true })).toBeVisible();
	await page.getByText('Rectangle enabled · rectangle', { exact: true }).click();
	await page.getByRole('button', { name: 'Add key' }).click();

	await expect(page.getByRole('button', { name: 'Key frame 1' })).toHaveCount(3);
});

test('selects point and rectangle gameplay guides in setup', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add point' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add rectangle' }).click();

	const attachments = page.locator('.attachment-row');
	await expect(attachments).toHaveCount(2);
	await attachments.filter({ hasText: 'point' }).click();
	await expect(page.getByRole('heading', { name: 'point', exact: true })).toBeVisible();
	await expect(attachments.filter({ hasText: 'point' })).toHaveAttribute('aria-pressed', 'true');
	await attachments.filter({ hasText: 'rectangle' }).click();
	await expect(page.getByRole('heading', { name: 'rectangle', exact: true })).toBeVisible();
	await expect(page.locator('input[name="width"]')).toHaveValue('64');
	await expect(page.locator('input[name="height"]')).toHaveValue('64');
});

test('changes interpolation for a selected numeric key', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Track details' }).click();
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();
	await page.getByRole('button', { name: 'Close Track details' }).click();
	await page.getByRole('button', { name: 'Key frame 1' }).click();
	await page.getByRole('button', { name: 'Key details' }).click();
	const interpolation = page.getByRole('combobox', { name: 'Interpolation' });

	await expect(interpolation).toHaveValue('linear');
	await interpolation.selectOption('bezier');
	await expect(interpolation).toHaveValue('bezier');
	await expect(page.getByText('Curve controls are available in the graph editor.', { exact: true })).toBeVisible();
	await expect(page.getByRole('img', { name: 'Bezier curve editor' })).toBeVisible();
	await expect(page.locator('.bezier-curve')).toHaveCSS('stroke-width', '2px');
	await page.getByLabel('P1 X').fill('0.4');
	await page.getByRole('button', { name: 'Apply curve', exact: true }).click();
	await expect(page.getByLabel('P1 X')).toHaveValue('0.4');
	await interpolation.selectOption('stepped');
	await expect(interpolation).toHaveValue('stepped');
});

test('retimes multiple selected animation keys together', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Track details' }).click();
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();
	await page.getByRole('combobox', { name: 'New track' }).selectOption({ label: 'root · Bone · y' });
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();
	const keys = page.getByRole('button', { name: 'Key frame 1' });
	await page.getByRole('button', { name: 'Close Track details' }).click();
	await keys.nth(0).click();
	await keys.nth(1).click({ modifiers: ['Control'] });
	await page.getByRole('button', { name: 'Key details' }).click();
	await expect(page.getByText('2 keys selected', { exact: true })).toBeVisible();
	await page.getByRole('spinbutton', { name: 'Offset frames', exact: true }).fill('2');
	await page.getByRole('button', { name: 'Retime selected keys', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 3' })).toHaveCount(2);
});

test('undoes a multi-key animation deletion as one action', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Track details' }).click();
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();
	await page.getByRole('combobox', { name: 'New track' }).selectOption({ label: 'root · Bone · y' });
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();

	const keys = page.getByRole('button', { name: 'Key frame 1' });
	await page.getByRole('button', { name: 'Close Track details' }).click();
	await keys.nth(0).click();
	await keys.nth(1).click({ modifiers: ['Control'] });
	await page.getByRole('button', { name: 'Key details' }).click();
	await page.getByRole('button', { name: 'Delete selected keys', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 1' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 1' })).toHaveCount(2);
});

test('auto-keys changed transform properties by default', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await expect(page.getByLabel('Auto Key')).toBeChecked();
	await page.locator('input[name="x"]').fill('48');
	await page.getByRole('button', { name: 'Apply values', exact: true }).click();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Key frame 1' })).toBeVisible();
	await page.getByLabel('Auto Key').uncheck();
	await expect(page.getByLabel('Auto Key')).not.toBeChecked();
});

test('queues edited properties when Auto Key is disabled', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByLabel('Auto Key').uncheck();
	await page.locator('input[name="x"]').fill('48');
	await page.getByRole('button', { name: 'Apply values', exact: true }).click();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Key edited properties (1)', exact: true })).toBeEnabled();
	await page.getByRole('button', { name: 'Key edited properties (1)', exact: true }).click();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Key frame 1' })).toBeVisible();
});

test('shows unkeyed, pending, and keyed property states', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await expect(page.getByText('Unkeyed', { exact: true }).first()).toBeVisible();
	await page.getByLabel('Auto Key').uncheck();
	await page.locator('input[name="x"]').fill('48');
	await page.getByRole('button', { name: 'Apply values', exact: true }).click();
	await expect(page.getByText('Pending', { exact: true }).first()).toBeVisible();
	await page.getByRole('button', { name: 'Key edited properties (1)', exact: true }).click();
	await expect(page.getByText('Keyed', { exact: true }).first()).toBeVisible();
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
	const multiSelectionX = page.locator('input[name="x"]');
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
	const alternateLocalX = Number(await page.locator('input[name="x"]').inputValue());
	const alternateLocalY = Number(await page.getByRole('spinbutton', { name: 'Y', exact: true }).inputValue());
	await page.getByRole('button', { name: 'root', exact: true }).click();
	const rootX = Number(await page.locator('input[name="x"]').inputValue());
	const rootY = Number(await page.getByRole('spinbutton', { name: 'Y', exact: true }).inputValue());
	await alternateAttachment.click();
	const xField = page.locator('input[name="x"]');
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

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Track details' }).click();
	const newTrack = page.getByRole('combobox', { name: 'New track' });
	await newTrack.selectOption({ label: 'hero.png · Attachment' });
	await page.getByRole('button', { name: 'Add track' }).click();
	const keyAttachment = page.getByRole('combobox', { name: 'Key attachment' });
	await keyAttachment.selectOption({ label: 'hero.png' });
	await page.getByRole('button', { name: 'Add key' }).click();
	await page.getByRole('button', { name: 'Close Track details' }).click();
	await page.getByRole('button', { name: 'Key frame 1' }).click();
	await page.getByRole('button', { name: 'Key details' }).click();
	const selectedAttachment = page.getByRole('combobox', { name: 'Selected attachment' });
	await expect(selectedAttachment).toHaveValue(/.+/);
	await selectedAttachment.selectOption({ label: 'alt.png' });
	const altAttachmentId = await selectedAttachment.locator('option').filter({ hasText: /^alt\.png$/ }).getAttribute('value');

	if (!altAttachmentId) {
		throw new Error('The alternate attachment ID is unavailable.');
	}

	await expect(selectedAttachment).toHaveValue(altAttachmentId);
});

test('builds and edits a hierarchy through the inspector', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add child bone' }).click();
	await expect(page.getByRole('button', { name: 'bone', exact: true })).toBeVisible();
	await page.locator('input[name="x"]').fill('24');
	await page.getByLabel('Rotation (deg)', { exact: true }).fill('15');
	await page.getByRole('button', { name: 'Apply values' }).click();
	await expect(page.locator('input[name="x"]')).toHaveValue('24');

	await page.getByLabel('Selected name').fill('arm');
	await page.getByRole('button', { name: 'Rename' }).click();
	await expect(page.getByRole('button', { name: 'arm', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add slot' }).click();
	await expect(page.getByRole('button', { name: 'slot', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'arm', exact: true }).click();
	await page.getByRole('button', { name: 'Add point' }).click();
	await expect(page.getByRole('button', { name: 'point', exact: true })).toBeVisible();
	page.once('dialog', async (dialog) => {
		expect(dialog.type()).toBe('confirm');
		await dialog.dismiss();
	});
	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByRole('button', { name: 'point', exact: true })).toBeVisible();
	page.once('dialog', async (dialog) => {
		expect(dialog.type()).toBe('confirm');
		await dialog.accept();
	});
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
	const firstSlotId = await slots.nth(0).getAttribute('data-slot-id');
	const secondSlotId = await slots.nth(1).getAttribute('data-slot-id');

	if (!firstSlotId || !secondSlotId) {
		throw new Error('The slot IDs are unavailable.');
	}

	await slots.nth(0).dragTo(slots.nth(1));
	await expect(slots.nth(0)).toHaveAttribute('data-draw-order-index', '1');
	await expect(slots.nth(1)).toHaveAttribute('data-draw-order-index', '0');

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Track details' }).click();
	await page.getByRole('combobox', { name: 'New track' }).selectOption({ label: 'Setup · Draw order' });
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();
	await page.getByRole('button', { name: 'Close Track details' }).click();
	await page.getByRole('button', { name: 'Key frame 1' }).click();
	await page.getByRole('button', { name: 'Key details' }).click();

	const keyedSlots = page.locator('.draw-order-key-editor li');
	await expect(keyedSlots).toHaveCount(2);
	await expect(keyedSlots.nth(0)).toHaveAttribute('data-slot-id', secondSlotId);
	await keyedSlots.nth(0).getByRole('button', { name: /Move .* later/ }).click();
	await expect(keyedSlots.nth(0)).toHaveAttribute('data-slot-id', firstSlotId);
});
