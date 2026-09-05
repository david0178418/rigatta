import { expect, test, type Page } from '@playwright/test';
import { createExampleAssetBlobs, exampleProject } from '../../src/examples/example-project.ts';
import { exportProjectArchive } from '../../src/persistence/archive.ts';

type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;
type LogicalPoint = Readonly<{ x: number; y: number }>;
type CameraSnapshot = Readonly<{
	mode: 'fit' | 'manual';
	scale: number;
	offsetX: number;
	offsetY: number;
}>;

const supportedViewports = [
	{ width: 1120, height: 720 },
	{ width: 1440, height: 900 },
	{ width: 1920, height: 1080 }
] as const;

const viewportBoundsFor = async function viewportBoundsFor(page: Page): Promise<Bounds> {
	const bounds = await page.locator('.pixi-viewport').boundingBox();

	if (!bounds) {
		throw new Error('The viewport bounds are unavailable.');
	}

	return bounds;
};

const cameraFor = async function cameraFor(page: Page): Promise<CameraSnapshot> {
	return page.locator('.pixi-viewport').evaluate((element) => {
		const mode = element.getAttribute('data-camera-mode');
		const scale = Number(element.getAttribute('data-camera-scale'));
		const offsetX = Number(element.getAttribute('data-camera-offset-x'));
		const offsetY = Number(element.getAttribute('data-camera-offset-y'));

		if ((mode !== 'fit' && mode !== 'manual') || !Number.isFinite(scale) || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
			throw new Error('The viewport camera data is unavailable.');
		}

		return { mode, scale, offsetX, offsetY };
	});
};

const screenPointForLogical = async function screenPointForLogical(
	page: Page,
	point: LogicalPoint,
	canvas: Readonly<{ width: number; height: number }>
): Promise<LogicalPoint> {
	const bounds = await viewportBoundsFor(page);
	const camera = await cameraFor(page);

	return {
		x: bounds.x + bounds.width / 2 + camera.offsetX + (point.x - canvas.width / 2) * camera.scale,
		y: bounds.y + bounds.height / 2 + camera.offsetY + (point.y - canvas.height / 2) * camera.scale
	};
};

const coordinateTextAt = async function coordinateTextAt(page: Page, point: LogicalPoint): Promise<string> {
	await page.mouse.move(point.x, point.y);

	return (await page.getByLabel('Canvas coordinate readout').textContent()) ?? '';
};

const loadExample = async function loadExample(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Adventurer Example', exact: true })).toBeVisible();
};

const wideFixtureArchive = async function wideFixtureArchive(): Promise<Buffer> {
	const project = {
		...exampleProject,
		name: 'Wide Canvas Fixture',
		logicalCanvas: { width: 384, height: 192 }
	};
	const exampleBlobs = createExampleAssetBlobs();
	const assetBytes = new Map(await Promise.all(Array.from(exampleBlobs).map(async ([assetId, blob]) => [
		assetId,
		new Uint8Array(await blob.arrayBuffer())
	] as const)));
	const archive = await exportProjectArchive(project, assetBytes);

	if (!archive.ok) {
		throw new Error(`Could not create the non-square fixture: ${archive.error.message}`);
	}

	return Buffer.from(archive.value);
};

const importWideFixture = async function importWideFixture(page: Page): Promise<void> {
	const archive = await wideFixtureArchive();

	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Import .rigatta', exact: true }).click();
	await page.locator('input[type="file"]').setInputFiles({
		name: 'wide-canvas-fixture.rigatta',
		mimeType: 'application/zip',
		buffer: archive
	});
	await expect(page.getByRole('heading', { name: 'Wide Canvas Fixture', exact: true })).toBeVisible();
};

const boundsMatch = function boundsMatch(left: Bounds, right: Bounds): void {
	expect(Math.abs(left.x - right.x)).toBeLessThan(1);
	expect(Math.abs(left.y - right.y)).toBeLessThan(1);
	expect(Math.abs(left.width - right.width)).toBeLessThan(1);
	expect(Math.abs(left.height - right.height)).toBeLessThan(1);
};

test('makes the whole stage interactive and preserves gesture precedence on the pasteboard', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');

	const viewport = page.locator('.pixi-viewport');
	const stage = page.locator('.viewport-stage');
	const readout = page.getByLabel('Canvas coordinate readout');
	const bounds = await viewportBoundsFor(page);
	const stageBounds = await stage.boundingBox();

	if (!stageBounds) {
		throw new Error('The viewport stage bounds are unavailable.');
	}

	boundsMatch(bounds, stageBounds);
	await expect(viewport).toHaveAttribute('data-camera-mode', 'fit');

	const pasteboardStart = { x: bounds.x + 8, y: bounds.y + bounds.height / 2 };
	const pasteboardEnd = { x: bounds.x + 120, y: bounds.y + bounds.height / 2 + 72 };
	const initialCamera = await cameraFor(page);

	await page.mouse.move(pasteboardStart.x, pasteboardStart.y);
	await page.mouse.down();
	await page.mouse.move(pasteboardEnd.x, pasteboardEnd.y, { steps: 3 });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'marquee');
	await expect(page.locator('.viewport-marquee')).toBeVisible();
	await page.mouse.up();
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');

	await page.mouse.move(pasteboardStart.x, pasteboardStart.y);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.move(pasteboardStart.x + 64, pasteboardStart.y - 36, { steps: 3 });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'pan');
	await expect(page.locator('.pixi-host')).toHaveClass(/is-panning/);
	await page.mouse.up({ button: 'middle' });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');

	const afterMiddlePan = await cameraFor(page);

	expect(afterMiddlePan.offsetX).not.toBe(initialCamera.offsetX);
	expect(afterMiddlePan.offsetY).not.toBe(initialCamera.offsetY);

	await page.keyboard.down('Space');
	await page.mouse.move(pasteboardStart.x, pasteboardStart.y);
	await page.mouse.down();
	await page.mouse.move(pasteboardStart.x - 40, pasteboardStart.y + 28, { steps: 3 });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'pan');
	await page.mouse.up();
	await page.keyboard.up('Space');
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');

	const afterSpacePan = await cameraFor(page);

	expect(afterSpacePan.offsetX).not.toBe(afterMiddlePan.offsetX);
	expect(afterSpacePan.offsetY).not.toBe(afterMiddlePan.offsetY);

	const anchor = { x: pasteboardStart.x, y: pasteboardStart.y };
	const coordinateBeforeZoom = await coordinateTextAt(page, anchor);
	const scaleBeforeZoom = afterSpacePan.scale;

	await page.mouse.wheel(0, -100);
	await expect.poll(async () => (await cameraFor(page)).scale).toBeGreaterThan(scaleBeforeZoom);
	await page.mouse.move(anchor.x, anchor.y);
	await expect(readout).toHaveText(coordinateBeforeZoom);

	await page.screenshot({ path: '/tmp/rigatta-p2-pasteboard-1280x800.png' });
});

test('matches the usable stage and device-pixel backing dimensions at supported sizes', async ({ page }) => {
	await supportedViewports.reduce(async (previous, supportedViewport) => {
		await previous;
		await page.setViewportSize(supportedViewport);
		await page.goto('/');

		const viewport = page.locator('.pixi-viewport');
		const stage = page.locator('.viewport-stage');
		const canvas = page.locator('canvas.pixi-canvas');
		const viewportBounds = await viewportBoundsFor(page);
		const stageBounds = await stage.boundingBox();
		const canvasBounds = await canvas.boundingBox();

		if (!stageBounds || !canvasBounds) {
			throw new Error(`Viewport bounds are unavailable at ${supportedViewport.width}x${supportedViewport.height}.`);
		}

		boundsMatch(viewportBounds, stageBounds);
		boundsMatch(viewportBounds, canvasBounds);
		await expect(viewport).toHaveAttribute('data-camera-mode', 'fit');

		const metrics = await canvas.evaluate((element) => {
			if (!(element instanceof HTMLCanvasElement)) {
				throw new Error('The editor Pixi canvas is unavailable.');
			}

			const bounds = element.getBoundingClientRect();
			const resolution = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;

			return {
				width: element.width,
				height: element.height,
				cssWidth: bounds.width,
				cssHeight: bounds.height,
				resolution,
				transform: getComputedStyle(element).transform
			};
		});

		expect(metrics.width).toBe(Math.round(metrics.cssWidth * metrics.resolution));
		expect(metrics.height).toBe(Math.round(metrics.cssHeight * metrics.resolution));
		expect(metrics.transform).toBe('none');
		await page.screenshot({ path: `/tmp/rigatta-p2-stage-${supportedViewport.width}x${supportedViewport.height}.png` });
	}, Promise.resolve());
});

test('displays a non-square logical canvas without stretching and separates Fit from Actual size', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await importWideFixture(page);

	const viewport = page.locator('.pixi-viewport');
	const bounds = await viewportBoundsFor(page);
	const camera = await cameraFor(page);
	const expectedFitScale = Math.min((bounds.width - 64) / 384, (bounds.height - 64) / 192);

	await expect(page.getByText('Canvas 384 × 192', { exact: true })).toBeVisible();
	await expect(viewport).toHaveAttribute('data-camera-mode', 'fit');
	expect(camera.scale).toBeCloseTo(expectedFitScale);

	const viewportStyles = await viewport.evaluate((element) => ({
		aspectRatio: getComputedStyle(element).aspectRatio,
		transform: getComputedStyle(element).transform
	}));

	expect(viewportStyles.aspectRatio).toBe('auto');
	expect(viewportStyles.transform).toBe('none');

	await page.getByRole('button', { name: 'Actual size', exact: true }).click();
	await expect(viewport).toHaveAttribute('data-camera-mode', 'manual');
	await expect(viewport).toHaveAttribute('data-camera-scale', '1');

	await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
	await expect(viewport).toHaveAttribute('data-camera-mode', 'fit');
	await expect.poll(async () => (await cameraFor(page)).scale).toBeCloseTo(expectedFitScale);
	await page.screenshot({ path: '/tmp/rigatta-p2-nonsquare-1440x900.png' });
});

test('refits in Fit mode and preserves the centered world point after manual resize', async ({ page }) => {
	await page.setViewportSize({ width: 1120, height: 720 });
	await page.goto('/');

	const initialBounds = await viewportBoundsFor(page);

	await page.getByRole('button', { name: 'Actual size', exact: true }).click();
	await page.mouse.move(initialBounds.x + initialBounds.width / 2, initialBounds.y + initialBounds.height / 2);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.move(initialBounds.x + initialBounds.width / 2 + 72, initialBounds.y + initialBounds.height / 2 - 24, { steps: 3 });
	await page.mouse.up({ button: 'middle' });

	const manualBeforeResize = await cameraFor(page);
	const centerBeforeResize = await coordinateTextAt(page, {
		x: initialBounds.x + initialBounds.width / 2,
		y: initialBounds.y + initialBounds.height / 2
	});

	await page.setViewportSize({ width: 1440, height: 900 });
	await expect.poll(async () => (await cameraFor(page)).offsetX).toBe(manualBeforeResize.offsetX);
	await expect.poll(async () => (await cameraFor(page)).offsetY).toBe(manualBeforeResize.offsetY);

	const resizedBounds = await viewportBoundsFor(page);
	const centerAfterResize = await coordinateTextAt(page, {
		x: resizedBounds.x + resizedBounds.width / 2,
		y: resizedBounds.y + resizedBounds.height / 2
	});

	expect(centerAfterResize).toBe(centerBeforeResize);

	await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
	const fitBeforeResize = await cameraFor(page);
	await page.setViewportSize({ width: 1920, height: 1080 });
	await expect.poll(async () => (await cameraFor(page)).mode).toBe('fit');
	await expect.poll(async () => (await cameraFor(page)).scale).not.toBe(fitBeforeResize.scale);
});

test('accepts a pasteboard asset drop and reports overflow without changing navigation history', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await loadExample(page);

	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	await expect(undo).toBeDisabled();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('tab', { name: 'Assets', exact: true }).click();

	const viewport = page.locator('.pixi-viewport');
	const bounds = await viewportBoundsFor(page);
	const asset = page.locator('.asset-row').filter({ hasText: 'body_front.png' });

	await asset.dragTo(viewport, {
		targetPosition: { x: 8, y: bounds.height / 2 }
	});
	await expect(page.getByRole('status', { name: 'Canvas overflow warnings', exact: true })).toBeVisible();
	await expect(undo).toBeEnabled();
});

test('keeps camera state out of project history and preserves it across Setup and Animate', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await loadExample(page);

	const viewport = page.locator('.pixi-viewport');
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	const bounds = await viewportBoundsFor(page);

	await expect(undo).toBeDisabled();
	await page.getByRole('button', { name: 'Actual size', exact: true }).click();
	await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.move(bounds.x + bounds.width / 2 + 48, bounds.y + bounds.height / 2 + 32, { steps: 3 });
	await page.mouse.up({ button: 'middle' });
	await page.mouse.wheel(0, -80);
	await expect.poll(async () => (await cameraFor(page)).scale).toBeGreaterThan(1);

	const cameraBeforeModeChange = await cameraFor(page);

	await expect(undo).toBeDisabled();
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Setup', exact: true }).click();
	await expect.poll(async () => cameraFor(page)).toEqual(cameraBeforeModeChange);
	await expect(viewport).toHaveAttribute('data-camera-mode', cameraBeforeModeChange.mode);
	await expect(undo).toBeDisabled();
});

test('constrains a transform, exposes feedback, groups history, and cancels on Escape', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await loadExample(page);
	const root = page.getByRole('button', { name: 'root', exact: true });
	await root.click();
	await expect(root).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Center viewport' }).click();

	const viewport = page.locator('.pixi-viewport');
	const start = await screenPointForLogical(page, { x: 128, y: 128 }, { width: 256, height: 256 });
	const end = { x: start.x + 32, y: start.y + 18 };
	const xField = page.locator('input[name="x"]');
	const yField = page.locator('input[name="y"]');
	const originalX = await xField.inputValue();
	const originalY = await yField.inputValue();

	await page.keyboard.down('Shift');
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 5 });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'transform');
	await expect(page.getByText('Shift constraint active', { exact: true })).toBeVisible();
	await page.mouse.up();
	await page.keyboard.up('Shift');
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');
	await expect(page.getByText('Shift constraint active', { exact: true })).toHaveCount(0);
	await expect(xField).not.toHaveValue(originalX);
	await expect(yField).toHaveValue(originalY);

	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	await expect(undo).toBeEnabled();
	await undo.click();
	await expect(xField).toHaveValue(originalX);
	await expect(yField).toHaveValue(originalY);
	await expect(undo).toBeDisabled();

	await page.keyboard.down('Shift');
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x + 24, end.y + 12, { steps: 4 });
	await expect(page.getByText('Shift constraint active', { exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await page.keyboard.up('Shift');
	await page.mouse.up();
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');
	await expect(page.getByText('Shift constraint active', { exact: true })).toHaveCount(0);
	await expect(xField).toHaveValue(originalX);
	await expect(yField).toHaveValue(originalY);
	await expect(undo).toBeDisabled();
});
