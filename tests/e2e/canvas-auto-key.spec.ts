import { expect, test, type Page } from '@playwright/test';

type LogicalPoint = Readonly<{ x: number; y: number }>;
type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;
type Camera = Readonly<{ scale: number; offsetX: number; offsetY: number }>;

const exampleCanvas = { width: 256, height: 256 } as const;

const loadExample = async function loadExample(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
};

const openExampleAnimation = async function openExampleAnimation(page: Page): Promise<void> {
	await loadExample(page);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await expect(page.getByTestId('animate-timeline')).toBeVisible();
};

const viewportBoundsFor = async function viewportBoundsFor(page: Page): Promise<Bounds> {
	const bounds = await page.locator('.pixi-viewport').boundingBox();

	if (!bounds) {
		throw new Error('The editor viewport bounds are unavailable.');
	}

	return bounds;
};

const cameraFor = async function cameraFor(page: Page): Promise<Camera> {
	return page.locator('.pixi-viewport').evaluate((element) => {
		const scale = Number(element.getAttribute('data-camera-scale'));
		const offsetX = Number(element.getAttribute('data-camera-offset-x'));
		const offsetY = Number(element.getAttribute('data-camera-offset-y'));

		if (![scale, offsetX, offsetY].every(Number.isFinite) || scale <= 0) {
			throw new Error('The editor viewport camera data is unavailable.');
		}

		return { scale, offsetX, offsetY };
	});
};

const screenPointForLogical = async function screenPointForLogical(
	page: Page,
	point: LogicalPoint
): Promise<LogicalPoint> {
	const bounds = await viewportBoundsFor(page);
	const camera = await cameraFor(page);

	return {
		x: bounds.x + bounds.width / 2 + camera.offsetX + (point.x - exampleCanvas.width / 2) * camera.scale,
		y: bounds.y + bounds.height / 2 + camera.offsetY + (point.y - exampleCanvas.height / 2) * camera.scale
	};
};

const selectRigNode = async function selectRigNode(page: Page, label: string): Promise<void> {
	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const root = tree.getByRole('treeitem', { name: 'Bone: root', exact: true });

	if (await root.getAttribute('aria-expanded') === 'false') {
		await root.locator('.tree-disclosure').click();
	}

	const body = tree.getByRole('treeitem', { name: 'Slot: body', exact: true });

	if (await body.count() > 0 && await body.getAttribute('aria-expanded') === 'false') {
		await body.locator('.tree-disclosure').click();
	}

	const treeItem = page.getByRole('treeitem', { name: label, exact: true });
	const button = treeItem.getByRole('button', { name: label.slice(label.indexOf(': ') + 2), exact: true });

	await button.click();
	await expect(treeItem).toHaveAttribute('aria-selected', 'true');
};

const dragLogical = async function dragLogical(
	page: Page,
	start: LogicalPoint,
	end: LogicalPoint,
	steps = 4
): Promise<void> {
	const startScreen = await screenPointForLogical(page, start);
	const endScreen = await screenPointForLogical(page, end);

	await page.mouse.move(startScreen.x, startScreen.y);
	await page.mouse.down();
	await page.mouse.move(endScreen.x, endScreen.y, { steps });
	await page.mouse.up();
};

test('canvas bone translation auto-keys changed axes at multiple frames', async ({ page }) => {
	await openExampleAnimation(page);
	await selectRigNode(page, 'Bone: root');
	await page.getByLabel('Playhead', { exact: true }).fill('1');

	await dragLogical(page, { x: 128, y: 128 }, { x: 148, y: 128 });

	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await expect(page.getByText('Bone transform · y · root', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Key frame 2', exact: true })).toHaveCount(1);

	const frameTwoImage = (await page.locator('canvas.pixi-canvas').screenshot()).toString('base64');

	await page.getByLabel('Playhead', { exact: true }).fill('5');
	await dragLogical(page, { x: 148, y: 128 }, { x: 168, y: 128 });

	await expect(page.getByRole('button', { name: 'Key frame 6', exact: true })).toHaveCount(1);
	await expect.poll(async () => (await page.locator('canvas.pixi-canvas').screenshot()).toString('base64')).not.toBe(frameTwoImage);
});

test('canvas image translation creates one track with keys at two frames', async ({ page }) => {
	await openExampleAnimation(page);
	await selectRigNode(page, 'Image attachment: robot core');

	await dragLogical(page, { x: 128, y: 128 }, { x: 144, y: 128 });

	await expect(page.getByText('Image transform · x · robot core', { exact: true })).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Key frame 1', exact: true })).toHaveCount(2);
	const firstFrameImage = (await page.locator('canvas.pixi-canvas').screenshot()).toString('base64');

	await page.getByLabel('Playhead', { exact: true }).fill('4');
	await dragLogical(page, { x: 144, y: 128 }, { x: 160, y: 128 });

	await expect(page.getByRole('button', { name: 'Key frame 5', exact: true })).toHaveCount(2);
	await expect.poll(async () => (await page.locator('canvas.pixi-canvas').screenshot()).toString('base64')).not.toBe(firstFrameImage);
});

test('inspector rotation seeds the setup value and interpolates the head pose', async ({ page }) => {
	await openExampleAnimation(page);
	await selectRigNode(page, 'Bone: head');
	const rotation = page.getByLabel('Rotation (deg)', { exact: true });

	await page.getByLabel('Playhead', { exact: true }).fill('4');
	await rotation.fill('30');
	await rotation.press('Enter');

	const rotationRow = page.locator('[data-track-id]').filter({ hasText: 'Bone transform · rotation · head' });

	await expect(rotationRow).toHaveCount(1);
	await expect(rotationRow.getByRole('button', { name: 'Key frame 1', exact: true })).toHaveCount(1);
	await expect(rotationRow.getByRole('button', { name: 'Key frame 5', exact: true })).toHaveCount(1);

	await page.getByLabel('Playhead', { exact: true }).fill('2');
	await expect(rotation).toHaveValue('15');
	await page.getByLabel('Playhead', { exact: true }).fill('0');
	await expect(rotation).toHaveValue('0');
	await page.getByRole('button', { name: 'Setup', exact: true }).click();
	await expect(rotation).toHaveValue('0');
});

test('canvas pending edits stay unkeyed until the explicit key action', async ({ page }) => {
	await openExampleAnimation(page);
	await selectRigNode(page, 'Bone: root');
	await page.getByLabel('Auto Key').uncheck();
	await page.getByLabel('Playhead', { exact: true }).fill('2');

	const startScreen = await screenPointForLogical(page, { x: 128, y: 128 });
	const endScreen = await screenPointForLogical(page, { x: 148, y: 128 });
	await page.mouse.move(startScreen.x, startScreen.y);
	await page.mouse.down();
	await page.mouse.move(endScreen.x, endScreen.y, { steps: 4 });
	await expect(page.locator('input[name="x"]')).toHaveValue('148');
	await page.mouse.up();

	await expect(page.getByText('Bone transform · x · root', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add X key at frame 3', exact: true })).toHaveAttribute('data-key-state', 'pending');
	await expect(page.getByRole('button', { name: 'Key edited properties (1)', exact: true })).toBeEnabled();
	await expect(page.getByTestId('keying-status')).toHaveText('Pending 1 changed property at frame 3.');

	await page.getByRole('button', { name: 'Key edited properties (1)', exact: true }).click();

	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Key frame 3', exact: true })).toHaveCount(1);
	await expect(page.getByRole('button', { name: 'Key edited properties', exact: true })).toBeDisabled();
});

test('canvas existing keyed poses have no first-move jump and support undo redo and cancel', async ({ page }) => {
	await openExampleAnimation(page);
	await selectRigNode(page, 'Bone: root');
	await page.getByRole('button', { name: 'Track details', exact: true }).click();
	await page.getByRole('combobox', { name: 'New track', exact: true }).selectOption({ label: 'root · Bone · x' });
	await page.getByRole('button', { name: 'Add track', exact: true }).click();
	await page.getByRole('spinbutton', { name: 'Value', exact: true }).fill('48');
	await page.getByRole('button', { name: 'Add key', exact: true }).click();
	await page.keyboard.press('Escape');

	const xField = page.locator('input[name="x"]');
	await expect(xField).toHaveValue('48');

	const startScreen = await screenPointForLogical(page, { x: 48, y: 128 });
	const endScreen = await screenPointForLogical(page, { x: 56, y: 128 });
	await page.mouse.move(startScreen.x, startScreen.y);
	await page.mouse.down();
	await page.mouse.move(endScreen.x, endScreen.y, { steps: 2 });
	await expect(xField).toHaveValue('56');
	await page.mouse.up();

	await expect(page.getByRole('button', { name: 'Key frame 1', exact: true })).toHaveCount(1);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(xField).toHaveValue('48');
	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect(xField).toHaveValue('56');

	const cancellationStart = await screenPointForLogical(page, { x: 56, y: 128 });
	const cancellationEnd = await screenPointForLogical(page, { x: 64, y: 128 });
	const announcement = await page.getByTestId('keying-status').textContent();
	await page.mouse.move(cancellationStart.x, cancellationStart.y);
	await page.mouse.down();
	await page.mouse.move(cancellationEnd.x, cancellationEnd.y, { steps: 2 });
	await page.keyboard.press('Escape');

	await expect(xField).toHaveValue('56');
	await expect(page.getByRole('button', { name: 'Key frame 1', exact: true })).toHaveCount(1);
	if (announcement !== null) {
		await expect(page.getByTestId('keying-status')).toHaveText(announcement);
	}
});

test('canvas rectangle resize auto-keys width instead of attachment scale', async ({ page }) => {
	await openExampleAnimation(page);
	await selectRigNode(page, 'Rectangle attachment: hurtbox');
	await page.getByRole('button', { name: 'Scale', exact: true }).click();

	await dragLogical(page, { x: 152, y: 152 }, { x: 168, y: 152 });

	await expect(page.getByText('Rectangle size · width · hurtbox', { exact: true })).toBeVisible();
	await expect(page.getByText('Image transform · scaleX · hurtbox', { exact: true })).toHaveCount(0);
	await expect(page.locator('input[name="width"]')).toHaveValue('80');
	await expect(page.getByRole('button', { name: 'Key frame 1', exact: true })).toHaveCount(1);
});
