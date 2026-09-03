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

	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Animate' }).click();
	await expect(page.getByRole('button', { name: 'walk', exact: true })).toBeVisible();
	await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();
});

test('renders the evaluated animation pose in the viewport', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await page.getByRole('button', { name: 'Animate' }).click();

	const canvas = page.locator('canvas.pixi-canvas');
	await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();
	const firstFrame = (await canvas.screenshot()).toString('base64');

	await page.getByRole('button', { name: 'Step forward' }).click();
	await expect(page.getByText('Frame 2 / 12', { exact: false })).toBeVisible();
	await expect.poll(async () => (await canvas.screenshot()).toString('base64')).not.toBe(firstFrame);
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

test('renders a viewport-sized editor canvas and exposes PNG extraction', async ({ page }) => {
	await page.goto('/');

	const canvas = page.locator('canvas.pixi-canvas');
	await expect(canvas).toBeVisible();
	const canvasMetrics = await canvas.evaluate((element) => {
		if (!(element instanceof HTMLCanvasElement)) {
			throw new Error('The Pixi canvas was not mounted.');
		}

		const bounds = element.getBoundingClientRect();
		const resolution = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;

		return {
			attributeWidth: element.width,
			attributeHeight: element.height,
			cssWidth: bounds.width,
			cssHeight: bounds.height,
			resolution
		};
	});

	expect(canvasMetrics.attributeWidth).toBe(Math.round(canvasMetrics.cssWidth * canvasMetrics.resolution));
	expect(canvasMetrics.attributeHeight).toBe(Math.round(canvasMetrics.cssHeight * canvasMetrics.resolution));
	expect(canvasMetrics.cssWidth).toBeGreaterThan(640);
	expect(canvasMetrics.cssHeight).toBeGreaterThan(480);

	const dataUrlPrefix = await page.evaluate(() => {
		const renderedCanvas = document.querySelector<HTMLCanvasElement>('canvas.pixi-canvas');

		if (!renderedCanvas) {
			throw new Error('The Pixi canvas was not mounted.');
		}

		return renderedCanvas.toDataURL('image/png').slice(0, 22);
	});

	expect(dataUrlPrefix).toBe('data:image/png;base64,');
});

test('supports distinct fit, actual-size, zoom, and legacy reset controls', async ({ page }) => {
	await page.goto('/');

	const viewport = page.locator('.pixi-viewport');
	const status = page.getByTestId('viewport-zoom-status');
	await expect(page.getByRole('button', { name: 'Fit canvas', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Actual size', exact: true })).toBeVisible();
	await expect(status).toHaveText(/\d+%/);
	const fittedScale = await viewport.getAttribute('data-camera-scale');
	await expect(viewport).toHaveAttribute('data-camera-mode', 'fit');

	const zoom = page.getByRole('button', { name: 'Zoom in' });
	await zoom.click();
	await expect(viewport).toHaveAttribute('data-camera-mode', 'manual');
	await expect(status).not.toHaveText(fittedScale ? `${Math.round(Number(fittedScale) * 100)}%` : '');

	await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
	await expect(viewport).toHaveAttribute('data-camera-mode', 'fit');
	await expect(status).toHaveText(/\d+%/);

	await page.getByRole('button', { name: 'Actual size', exact: true }).click();
	await expect(viewport).toHaveAttribute('data-camera-mode', 'manual');
	await expect(status).toHaveText('100%');

	await page.getByRole('button', { name: 'Reset viewport', exact: true }).click();
	await expect(status).toHaveText('100%');
	await page.getByRole('button', { name: 'Center viewport', exact: true }).click();
	await expect(status).toHaveText('100%');
});

test('configures setup grid visibility, spacing, and snapping', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Grid settings' }).click();

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

test('shows canvas coordinates and setup origin overlays', async ({ page }) => {
	await page.goto('/');

	const coordinateReadout = page.getByLabel('Canvas coordinate readout');
	await expect(coordinateReadout).toHaveText('X — · Y —');
	await expect(page.getByRole('img', { name: 'Setup origin at X 0, Y 0' })).toBeVisible();
	const viewport = page.locator('.pixi-viewport');
	const bounds = await viewport.boundingBox();

	if (!bounds) {
		throw new Error('The viewport bounds are unavailable.');
	}

	await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await expect(coordinateReadout).toHaveText(/X -?\d+ · Y -?\d+/);
	await page.getByRole('button', { name: 'Grid settings' }).click();
	await expect(page.getByRole('dialog', { name: 'Grid settings' })).toBeVisible();
	await page.locator('.viewport-readout').click();
	await expect(page.getByRole('dialog', { name: 'Grid settings' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Grid settings' }).click();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Grid settings' })).toHaveCount(0);
});

test('creates, duplicates, renames, and configures animation clips', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await expect(page.getByRole('button', { name: 'clip 1', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Clip settings' }).click();
	await expect(page.getByRole('region', { name: 'Clip properties' })).toBeVisible();
	await page.getByLabel('Clip name').fill('walk');
	await page.getByRole('button', { name: 'Save clip', exact: true }).click();
	await expect(page.getByRole('button', { name: 'walk', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Duplicate clip', exact: true }).click();
	await expect(page.getByRole('button', { name: 'walk copy', exact: true })).toBeVisible();
	await page.getByLabel('Duration (sec)').fill('2');
	await page.getByLabel('FPS').fill('24');
	await page.getByLabel('Loop').uncheck();
	await page.getByRole('button', { name: 'Save clip', exact: true }).click();
	await expect(page.getByLabel('Duration (sec)')).toHaveValue('2');
	await expect(page.getByLabel('FPS')).toHaveValue('24');
	await expect(page.getByLabel('Loop')).not.toBeChecked();
	await expect(page.getByRole('button', { name: 'Rename', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Apply playback', exact: true })).toHaveCount(0);
});

test('selects clips and output grouping for export', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: '+ Clip', exact: true }).click();
	await page.getByRole('button', { name: 'Export', exact: true }).click();

	await expect(page.getByRole('dialog', { name: 'Export animation' })).toBeVisible();
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
	await page.getByRole('button', { name: 'Close Export animation' }).click();
	await expect(page.getByRole('dialog', { name: 'Export animation' })).toHaveCount(0);
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
	await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
	await page.getByRole('button', { name: 'Close Keyboard shortcuts' }).click();
	await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
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
	await expect(page.getByRole('region', { name: 'Clip properties' })).toBeVisible();
	await page.getByLabel('Duration (sec)').fill('3');
	await page.getByRole('button', { name: 'Save clip', exact: true }).click();
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
	await expect(page.getByRole('region', { name: 'Key properties' })).toBeVisible();
	await page.getByRole('spinbutton', { name: 'Key frame', exact: true }).fill('3');
	await page.getByRole('button', { name: 'Apply key values', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 3' })).toBeVisible();
	await page.getByTestId('animate-timeline').focus();
	await page.keyboard.press('Control+c');
	await page.getByLabel('Playhead').fill('5');
	await page.getByTestId('animate-timeline').focus();
	await page.keyboard.press('Control+v');
	await expect(page.getByRole('button', { name: 'Key frame 6' })).toBeVisible();
	await page.getByRole('button', { name: 'Key frame 6' }).click();
	await page.getByTestId('animate-timeline').focus();
	await page.keyboard.press('Delete');
	await expect(page.getByRole('button', { name: 'Key frame 6' })).toHaveCount(0);
});

test('creates and edits timeline events', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Add event', exact: true }).click();
	await page.getByRole('button', { name: 'Event event at frame 1', exact: true }).click();
	await page.getByRole('button', { name: 'Event details' }).click();
	await expect(page.getByRole('region', { name: 'Event properties' })).toBeVisible();
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
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Point attachment', exact: true }).click();
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
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Rectangle attachment', exact: true }).click();
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
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Point attachment', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Rectangle attachment', exact: true }).click();

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
	await expect(page.getByRole('region', { name: 'Key properties' })).toBeVisible();
	const interpolation = page.getByRole('combobox', { name: 'Inspector easing mode' });

	await expect(interpolation).toHaveValue('linear');
	await interpolation.selectOption('bezier');
	await expect(interpolation).toHaveValue('bezier');
	await expect(page.getByRole('group', { name: /Bezier curve editor/ })).toBeVisible();
	await expect(page.getByRole('img', { name: 'Bezier curve preview' })).toBeVisible();
	await expect(page.locator('.shared-bezier-curve')).toHaveCSS('stroke-width', '2px');
	await page.getByLabel('Bezier X1').fill('0.4');
	await page.getByRole('button', { name: 'Apply curve', exact: true }).click();
	await expect(page.getByLabel('Bezier X1')).toHaveValue('0.4');
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
	await expect(page.getByText('2 keys selected', { exact: false })).toBeVisible();
	await page.getByTestId('animate-timeline').focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('button', { name: 'Key frame 2' })).toHaveCount(2);
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
	await page.getByTestId('animate-timeline').focus();
	await page.keyboard.press('Delete');
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
	const autoKeyX = page.locator('input[name="x"]');
	await autoKeyX.fill('48');
	await autoKeyX.press('Enter');
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
	const pendingX = page.locator('input[name="x"]');
	await pendingX.fill('48');
	await pendingX.press('Enter');
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
	const unkeyedX = page.getByRole('button', { name: 'Add X key at frame 1', exact: true });
	await expect(unkeyedX).toHaveAttribute('data-key-state', 'unkeyed');
	await expect(unkeyedX).toContainText('◇');
	await page.getByLabel('Auto Key').uncheck();
	const pendingStateX = page.locator('input[name="x"]');
	await pendingStateX.fill('48');
	await pendingStateX.press('Enter');
	const pendingX = page.getByRole('button', { name: 'Add X key at frame 1', exact: true });
	await expect(pendingX).toHaveAttribute('data-key-state', 'pending');
	await expect(pendingX).toContainText('◈');
	await page.getByRole('button', { name: 'Key edited properties (1)', exact: true }).click();
	const keyedX = page.getByRole('button', { name: 'Remove X key at frame 1', exact: true });
	await expect(keyedX).toHaveAttribute('data-key-state', 'keyed');
	await expect(keyedX).toContainText('◆');
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
	await expect(page.getByText('Imported 2 images.', { exact: true })).toBeVisible();
	await expect(page.getByText('Drop on the canvas to create a root bone, slot, and attachment.', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Import image directory' }).click();
	await expect(page.getByText('Imported 0 images · 2 conflicts.', { exact: true })).toBeVisible();
	await page.getByText('Show import details', { exact: true }).click();
	await expect(page.getByText('Conflict', { exact: true }).first()).toBeVisible();
	await page.locator('.asset-row').filter({ hasText: 'hero.png' }).dragTo(page.locator('.pixi-viewport'));

	await expect(page.getByText('root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
	await page.getByRole('button', { name: 'root' }).click();
	await expect(page.getByText(/Drop on the canvas to create a slot and attachment under root\./)).toBeVisible();
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
	await page.getByRole('tab', { name: 'Properties', exact: true }).click();
	await expect(page.getByText('2 items selected.', { exact: true })).toBeVisible();
	await expect(page.getByText('Mixed', { exact: true }).first()).toBeVisible();
	await page.getByRole('tab', { name: 'Assets', exact: true }).click();
	await page.locator('.slot-row').click();
	await expect(page.getByText(/Drop on .* to add an attachment\./, { exact: false })).toBeVisible();
	await page.getByRole('tab', { name: 'Properties', exact: true }).click();
	const setupImage = page.getByRole('combobox', { name: 'Setup image' });
	await expect(setupImage).toHaveValue(/.+/);
	await page.getByRole('tab', { name: 'Assets', exact: true }).click();
	await page.locator('.asset-row').filter({ hasText: 'alt.png' }).dragTo(page.locator('.slot-row'));
	await page.getByRole('tab', { name: 'Properties', exact: true }).click();
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

	const cameraScale = Number(await viewport.getAttribute('data-camera-scale'));
	const cameraOffsetX = Number(await viewport.getAttribute('data-camera-offset-x'));
	const cameraOffsetY = Number(await viewport.getAttribute('data-camera-offset-y'));
	const alternateWorldX = rootX + alternateLocalX;
	const alternateWorldY = rootY + alternateLocalY;
	const alternateScreenX = imageBounds.x + imageBounds.width / 2 + cameraOffsetX + (alternateWorldX - 512) * cameraScale;
	const alternateScreenY = imageBounds.y + imageBounds.height / 2 + cameraOffsetY + (alternateWorldY - 512) * cameraScale;
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
		const selectedAttachment = page.getByRole('combobox', { name: 'Keyed value · frame 1' });
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
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	await expect(page.getByRole('button', { name: 'bone', exact: true })).toBeVisible();
	const hierarchyX = page.locator('input[name="x"]');
	await hierarchyX.fill('24');
	await hierarchyX.press('Enter');
	const hierarchyRotation = page.getByLabel('Rotation (deg)', { exact: true });
	await hierarchyRotation.fill('15');
	await hierarchyRotation.press('Enter');
	await expect(page.locator('input[name="x"]')).toHaveValue('24');

	const hierarchyName = page.getByLabel('Selected name');
	await hierarchyName.fill('');
	await hierarchyName.press('Enter');
	await expect(page.getByText('Name cannot be empty.', { exact: true })).toBeVisible();
	await hierarchyName.fill('arm');
	await hierarchyName.press('Enter');
	await expect(page.getByRole('button', { name: 'arm', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Slot', exact: true }).click();
	await expect(page.getByRole('button', { name: 'slot', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'arm', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Point attachment', exact: true }).click();
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
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();

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
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Slot', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Slot', exact: true }).click();

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

	await expect(page.getByRole('region', { name: 'Draw order properties' })).toBeVisible();
	const keyedSlots = page.getByRole('list', { name: 'Keyed value · frame 1', exact: true }).locator('li');
	await expect(keyedSlots).toHaveCount(2);
	await expect(keyedSlots.nth(0)).toHaveAttribute('data-slot-id', secondSlotId);
	await keyedSlots.nth(0).getByRole('button', { name: /Move .* later/ }).click();
	await expect(keyedSlots.nth(0)).toHaveAttribute('data-slot-id', firstSlotId);
});
