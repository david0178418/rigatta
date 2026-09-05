import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { UI_PREFERENCES_STORAGE_KEY } from '../../src/app/ui-preferences.ts';

type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;
type LogicalPoint = Readonly<{ x: number; y: number }>;
type CameraSnapshot = Readonly<{
	mode: 'fit' | 'manual';
	scale: number;
	offsetX: number;
	offsetY: number;
}>;
type AtlasFrame = Readonly<{ x: number; y: number; w: number; h: number }>;
type ExportCapture = Readonly<{ bytes: Uint8Array; frame: AtlasFrame }>;
type OverlayCounts = Readonly<{
	bones: number;
	gameplayGuides: number;
	selectionGuides: number;
	scenePixels: number;
}>;
type PixelEvidence = Readonly<{
	sampleCount: number;
	matchingCount: number;
	atlasWidth: number;
	atlasHeight: number;
}>;
type SupportedViewport = Readonly<{ width: number; height: number }>;

const supportedViewports: readonly SupportedViewport[] = [
	{ width: 1120, height: 720 },
	{ width: 1440, height: 900 }
];

const isRecord = function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const nonnegativeInteger = function nonnegativeInteger(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
};

const loadExample = async function loadExample(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
};

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

const choosePreset = async function choosePreset(
	page: Page,
	preset: 'authoring' | 'visual-preview' | 'gameplay-preview',
	label: 'Authoring' | 'Visual preview' | 'Gameplay preview'
): Promise<void> {
	const control = page.getByTestId('viewport-preset-control');
	const button = control.getByRole('button', { name: label, exact: true });

	await button.click();
	await expect(page.locator('.pixi-viewport')).toHaveAttribute('data-viewport-preset', preset);
	await expect(button).toHaveAttribute('aria-pressed', 'true');
	await page.waitForTimeout(140);
	const rendererError = page.locator('.renderer-error');
	if (await rendererError.count() > 0) {
		throw new Error(`Viewport renderer error after ${label}: ${await rendererError.first().textContent()}`);
	}
};

const atlasFrameFor = function atlasFrameFor(archive: Uint8Array): AtlasFrame {
	const entries = unzipSync(archive);
	const metadata = entries['atlas-0.json'];

	if (!metadata) {
		throw new Error('The export archive does not contain atlas-0.json.');
	}

	const parsed: unknown = JSON.parse(strFromU8(metadata));
	const frames = isRecord(parsed) ? parsed.frames : undefined;
	const frameData = isRecord(frames) ? frames['walk/frame-0000'] : undefined;
	const frame = isRecord(frameData) ? frameData.frame : undefined;

	if (!isRecord(frame)) {
		throw new Error('The export atlas does not contain the keyed walk frame.');
	}

	const x = nonnegativeInteger(frame.x);
	const y = nonnegativeInteger(frame.y);
	const w = nonnegativeInteger(frame.w);
	const h = nonnegativeInteger(frame.h);

	if (x === undefined || y === undefined || w === undefined || h === undefined || w === 0 || h === 0) {
		throw new Error('The keyed export frame bounds are malformed.');
	}

	return { x, y, w, h };
};

const exportCaptureFor = async function exportCaptureFor(page: Page): Promise<ExportCapture> {
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Export animation', exact: true });
	const downloadPromise = page.waitForEvent('download');

	await dialog.getByRole('button', { name: 'Export ZIP', exact: true }).click();
	const download = await downloadPromise;
	await expect(dialog.getByTestId('export-run-state')).toHaveAttribute('data-export-status', 'completed', { timeout: 30000 });
	const path = await download.path();

	if (!path) {
		throw new Error('The viewport export download path is unavailable.');
	}

	const archive = Uint8Array.from(await readFile(path));
	const entries = unzipSync(archive);
	const png = entries['atlas-0.png'];

	if (!png) {
		throw new Error('The export archive does not contain atlas-0.png.');
	}

	return { bytes: png.slice(), frame: atlasFrameFor(archive) };
};

const overlayCountsFor = async function overlayCountsFor(page: Page): Promise<OverlayCounts> {
	return page.locator('canvas.editor-pixi-canvas').evaluate(async (element) => {
		if (!(element instanceof HTMLCanvasElement)) {
			throw new Error('The editor Pixi canvas is unavailable.');
		}

		const image = await new Promise<HTMLImageElement>((resolve, reject) => {
			const nextImage = new Image();
			nextImage.addEventListener('load', () => resolve(nextImage), { once: true });
			nextImage.addEventListener('error', () => reject(new Error('The editor canvas screenshot could not be decoded.')), { once: true });
			nextImage.src = element.toDataURL('image/png');
		});
		const scratch = document.createElement('canvas');
		scratch.width = image.naturalWidth;
		scratch.height = image.naturalHeight;
		const context = scratch.getContext('2d', { willReadFrequently: true });

		if (!context || scratch.width === 0 || scratch.height === 0) {
			throw new Error('The editor canvas pixel context is unavailable.');
		}

		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, scratch.width, scratch.height).data;
		const indexes = Array.from({ length: pixels.length / 4 }, (_, index) => index);
		const colorDistance = function colorDistance(index: number, color: readonly [number, number, number]): number {
			const offset = index * 4;

			return Math.max(
				Math.abs((pixels[offset] ?? 0) - color[0]),
				Math.abs((pixels[offset + 1] ?? 0) - color[1]),
				Math.abs((pixels[offset + 2] ?? 0) - color[2])
			);
		};
		const countColor = function countColor(color: readonly [number, number, number]): number {
			return indexes.reduce((count, index) => {
				const alpha = pixels[index * 4 + 3] ?? 0;

				return alpha > 120 && colorDistance(index, color) <= 14 ? count + 1 : count;
			}, 0);
		};
		const scenePixels = indexes.reduce((count, index) => {
			const offset = index * 4;
			const alpha = pixels[offset + 3] ?? 0;
			const red = pixels[offset] ?? 0;
			const green = pixels[offset + 1] ?? 0;
			const blue = pixels[offset + 2] ?? 0;
			const checkerboard = Math.min(
				Math.max(Math.abs(red - 39), Math.abs(green - 49), Math.abs(blue - 61)),
				Math.max(Math.abs(red - 31), Math.abs(green - 40), Math.abs(blue - 51))
			);

			return alpha > 120 && checkerboard > 8 ? count + 1 : count;
		}, 0);

		return {
			bones: countColor([111, 212, 189]),
			gameplayGuides: countColor([240, 184, 109]),
			selectionGuides: countColor([255, 210, 125]),
			scenePixels
		};
	});
};

const visualPixelEvidenceFor = async function visualPixelEvidenceFor(
	page: Page,
	exportCapture: ExportCapture,
	logicalCanvas: Readonly<{ width: number; height: number }>
): Promise<PixelEvidence> {
	return page.evaluate(async ({ pngBytes, frame, canvas }) => {
		const pngBuffer = new ArrayBuffer(pngBytes.length);
		new Uint8Array(pngBuffer).set(pngBytes);
		const bitmap = await createImageBitmap(new Blob([pngBuffer], { type: 'image/png' }));
		const atlasWidth = bitmap.width;
		const atlasHeight = bitmap.height;
		const exportCanvas = document.createElement('canvas');
		exportCanvas.width = atlasWidth;
		exportCanvas.height = atlasHeight;
		const exportContext = exportCanvas.getContext('2d', { willReadFrequently: true });

		if (!exportContext || frame.x + canvas.width > atlasWidth || frame.y + canvas.height > atlasHeight) {
			bitmap.close();
			throw new Error('The clean export frame cannot be sampled.');
		}

		exportContext.drawImage(bitmap, 0, 0);
		const exportPixels = exportContext.getImageData(0, 0, atlasWidth, atlasHeight).data;
		const rgbaAt = function rgbaAt(
			pixels: Uint8ClampedArray,
			width: number,
			x: number,
			y: number
		): readonly number[] {
			const offset = (y * width + x) * 4;

			return [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0, pixels[offset + 3] ?? 0];
		};
		const colorDistance = function colorDistance(left: readonly number[], right: readonly number[]): number {
			return Math.max(
				Math.abs((left[0] ?? 0) - (right[0] ?? 0)),
				Math.abs((left[1] ?? 0) - (right[1] ?? 0)),
				Math.abs((left[2] ?? 0) - (right[2] ?? 0))
			);
		};
		const sampleWidth = Math.min(canvas.width, frame.w);
		const sampleHeight = Math.min(canvas.height, frame.h);
		const xPositions = Array.from({ length: Math.max(0, Math.floor((sampleWidth - 16) / 4)) }, (_, index) => 8 + index * 4);
		const yPositions = Array.from({ length: Math.max(0, Math.floor((sampleHeight - 16) / 4)) }, (_, index) => 8 + index * 4);
		const candidates = yPositions.flatMap((y) => xPositions.map((x) => ({ x, y })));
		const samples = candidates
			.filter((point) => {
				const pixel = rgbaAt(exportPixels, atlasWidth, frame.x + point.x, frame.y + point.y);
				const neighbors = [
					{ x: point.x - 1, y: point.y },
					{ x: point.x + 1, y: point.y },
					{ x: point.x, y: point.y - 1 },
					{ x: point.x, y: point.y + 1 }
				];

				return pixel[3] >= 245 && neighbors.every((neighbor) => {
					const adjacent = rgbaAt(exportPixels, atlasWidth, frame.x + neighbor.x, frame.y + neighbor.y);

					return adjacent[3] >= 245 && colorDistance(pixel, adjacent) <= 3;
				});
			})
			.slice(0, 32)
			.map((point) => ({
				point,
				rgba: rgbaAt(exportPixels, atlasWidth, frame.x + point.x, frame.y + point.y)
			}));

		bitmap.close();

		if (samples.length < 8) {
			throw new Error(`Only ${samples.length} stable opaque export samples were available.`);
		}

		const editor = document.querySelector<HTMLCanvasElement>('canvas.editor-pixi-canvas');
		const viewport = document.querySelector<HTMLElement>('.pixi-viewport');

		if (!editor || !viewport) {
			throw new Error('The editor canvas or viewport is unavailable.');
		}

		const editorImage = await new Promise<HTMLImageElement>((resolve, reject) => {
			const nextImage = new Image();
			nextImage.addEventListener('load', () => resolve(nextImage), { once: true });
			nextImage.addEventListener('error', () => reject(new Error('The editor canvas could not be decoded.')), { once: true });
			nextImage.src = editor.toDataURL('image/png');
		});
		const editorCanvas = document.createElement('canvas');
		editorCanvas.width = editorImage.naturalWidth;
		editorCanvas.height = editorImage.naturalHeight;
		const editorContext = editorCanvas.getContext('2d', { willReadFrequently: true });
		const editorBounds = editor.getBoundingClientRect();
		const viewportBounds = viewport.getBoundingClientRect();
		const scale = Number(viewport.getAttribute('data-camera-scale'));
		const offsetX = Number(viewport.getAttribute('data-camera-offset-x'));
		const offsetY = Number(viewport.getAttribute('data-camera-offset-y'));

		if (!editorContext || editorCanvas.width === 0 || editorCanvas.height === 0 || editorBounds.width === 0 || editorBounds.height === 0 || !Number.isFinite(scale) || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
			throw new Error('The editor canvas transform data is unavailable.');
		}

		editorContext.drawImage(editorImage, 0, 0);
		const editorPixels = editorContext.getImageData(0, 0, editorCanvas.width, editorCanvas.height).data;
		const matchingCount = samples.filter(({ point, rgba }) => {
			const screenX = viewportBounds.left + viewportBounds.width / 2 + offsetX + (point.x + 0.5 - canvas.width / 2) * scale;
			const screenY = viewportBounds.top + viewportBounds.height / 2 + offsetY + (point.y + 0.5 - canvas.height / 2) * scale;
			const editorX = Math.max(0, Math.min(editorCanvas.width - 1, Math.round((screenX - editorBounds.left) * editorCanvas.width / editorBounds.width)));
			const editorY = Math.max(0, Math.min(editorCanvas.height - 1, Math.round((screenY - editorBounds.top) * editorCanvas.height / editorBounds.height)));
			const actual = rgbaAt(editorPixels, editorCanvas.width, editorX, editorY);

			return actual[3] >= 180 && colorDistance(actual, rgba) <= 32;
		}).length;

		return {
			sampleCount: samples.length,
			matchingCount,
			atlasWidth,
			atlasHeight
		};
	}, {
		pngBytes: Array.from(exportCapture.bytes),
		frame: exportCapture.frame,
		canvas: logicalCanvas
	});
};

const toolbarLayoutFor = async function toolbarLayoutFor(page: Page): Promise<Readonly<{ overflow: boolean; controlInside: boolean; noReadoutOverlap: boolean }>> {
	return page.locator('.viewport-toolbar').evaluate((toolbar) => {
		const control = toolbar.querySelector('[data-testid="viewport-preset-control"]');
		const readout = toolbar.querySelector('.viewport-readout');

		if (!(toolbar instanceof HTMLElement) || !(control instanceof HTMLElement) || !(readout instanceof HTMLElement)) {
			throw new Error('The viewport toolbar layout is unavailable.');
		}

		const toolbarBounds = toolbar.getBoundingClientRect();
		const controlBounds = control.getBoundingClientRect();
		const readoutBounds = readout.getBoundingClientRect();

		return {
			overflow: toolbar.scrollWidth > toolbar.clientWidth,
			controlInside: controlBounds.left >= toolbarBounds.left && controlBounds.right <= toolbarBounds.right,
			noReadoutOverlap: controlBounds.left >= readoutBounds.right
		};
	});
};

test('proves all viewport presets against clean export pixels at supported sizes', async ({ page }) => {
	test.setTimeout(120000);

	await supportedViewports.reduce(async (previous, supportedViewport) => {
		await previous;
		await page.setViewportSize(supportedViewport);
		await loadExample(page);
		await page.getByRole('button', { name: 'Animate', exact: true }).click();
		await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();

		const root = page.getByRole('button', { name: 'root', exact: true });
		await root.click();
		await expect(root).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
		expect(await toolbarLayoutFor(page)).toEqual({ overflow: false, controlInside: true, noReadoutOverlap: true });

		const exportCapture = await exportCaptureFor(page);
		await page.getByRole('button', { name: 'Close Export animation', exact: true }).click();

		await choosePreset(page, 'authoring', 'Authoring');
		await page.mouse.move(8, 8);
		await page.locator('canvas.editor-pixi-canvas').screenshot({ path: `/tmp/rigatta-v1-${supportedViewport.width}-authoring.png` });
		const authoring = await overlayCountsFor(page);

		await choosePreset(page, 'visual-preview', 'Visual preview');
		await expect(root).toHaveAttribute('aria-pressed', 'true');
		await page.locator('canvas.editor-pixi-canvas').screenshot({ path: `/tmp/rigatta-v1-${supportedViewport.width}-visual-preview.png` });
		const visual = await overlayCountsFor(page);
		const pixels = await visualPixelEvidenceFor(page, exportCapture, { width: 256, height: 256 });

		await page.getByRole('button', { name: 'Setup', exact: true }).click();
		await expect(page.locator('.pixi-viewport')).toHaveAttribute('data-viewport-preset', 'visual-preview');
		await page.getByRole('button', { name: 'Animate', exact: true }).click();
		await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();
		await expect(root).toHaveAttribute('aria-pressed', 'true');

		await choosePreset(page, 'gameplay-preview', 'Gameplay preview');
		await page.locator('canvas.editor-pixi-canvas').screenshot({ path: `/tmp/rigatta-v1-${supportedViewport.width}-gameplay-preview.png` });
		const gameplay = await overlayCountsFor(page);

		expect(pixels.atlasWidth).toBeGreaterThan(256);
		expect(pixels.atlasHeight).toBeGreaterThan(256);
		expect(pixels.sampleCount).toBeGreaterThanOrEqual(8);
		expect(pixels.matchingCount).toBeGreaterThanOrEqual(Math.max(8, Math.floor(pixels.sampleCount * 0.75)));
		expect(authoring.scenePixels).toBeGreaterThan(100);
		expect(visual.scenePixels).toBeGreaterThan(100);
		expect(gameplay.scenePixels).toBeGreaterThan(100);
		expect(authoring.bones).toBeGreaterThan(visual.bones + 20);
		expect(authoring.selectionGuides).toBeGreaterThan(visual.selectionGuides + 20);
		expect(gameplay.gameplayGuides).toBeGreaterThan(visual.gameplayGuides + 8);
		expect(gameplay.gameplayGuides).toBeGreaterThan(12);
		expect(gameplay.bones).toBeLessThanOrEqual(visual.bones + 40);
		expect(gameplay.selectionGuides).toBeLessThanOrEqual(visual.selectionGuides + 40);
		expect(await page.getByRole('button', { name: 'Undo', exact: true }).isDisabled()).toBe(true);
	}, Promise.resolve());
});

test('preserves navigation, playback, selection, and history while gating and cancelling transforms', async ({ page }) => {
	await page.setViewportSize({ width: 1120, height: 720 });
	await loadExample(page);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();

	const root = page.getByRole('button', { name: 'root', exact: true });
	const viewport = page.locator('.pixi-viewport');
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	await root.click();
	await choosePreset(page, 'visual-preview', 'Visual preview');
	await expect(root).toHaveAttribute('aria-pressed', 'true');
	await expect(viewport).toHaveAttribute('data-transform-enabled', 'false');
	await expect(undo).toBeDisabled();

	await page.getByRole('button', { name: 'Actual size', exact: true }).click();
	const beforePan = await cameraFor(page);
	const bounds = await viewportBoundsFor(page);
	await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.move(bounds.x + bounds.width / 2 + 48, bounds.y + bounds.height / 2 + 28, { steps: 3 });
	await page.mouse.up({ button: 'middle' });
	await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
	await page.mouse.wheel(0, -80);
	await expect.poll(async () => (await cameraFor(page)).scale).toBeGreaterThan(beforePan.scale);
	await expect(undo).toBeDisabled();

	const frameReadout = page.locator('.playback-readout');
	const initialFrame = await frameReadout.textContent();
	await page.getByRole('button', { name: 'Play animation', exact: true }).click();
	await expect.poll(async () => frameReadout.textContent()).not.toBe(initialFrame);
	await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
	await page.getByRole('slider', { name: 'Playhead', exact: true }).fill('4');
	await expect(frameReadout).toContainText('Frame 5 / 12');
	await page.getByRole('button', { name: 'Setup', exact: true }).click();
	await expect(viewport).toHaveAttribute('data-viewport-preset', 'visual-preview');
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await expect(viewport).toHaveAttribute('data-viewport-preset', 'visual-preview');
	await expect(root).toHaveAttribute('aria-pressed', 'true');

	await choosePreset(page, 'authoring', 'Authoring');
	await page.getByRole('button', { name: 'Center viewport', exact: true }).click();
	const xField = page.locator('input[name="x"]');
	const yField = page.locator('input[name="y"]');
	const originalX = await xField.inputValue();
	const originalY = await yField.inputValue();
	const start = await screenPointForLogical(page, { x: 128, y: 128 }, { width: 256, height: 256 });

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 32, start.y + 18, { steps: 4 });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'transform');
	await page.evaluate(() => {
		const button = document.querySelector<HTMLButtonElement>('[data-preset="visual-preview"]');

		if (!button) {
			throw new Error('The Visual preview button is unavailable.');
		}

		button.click();
	});
	await expect(viewport).toHaveAttribute('data-viewport-preset', 'visual-preview');
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');
	await page.mouse.up();
	await expect(xField).toHaveValue(originalX);
	await expect(yField).toHaveValue(originalY);
	await expect(undo).toBeDisabled();

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 36, start.y + 24, { steps: 4 });
	await expect(viewport).not.toHaveAttribute('data-gesture-mode', 'transform');
	await page.keyboard.press('Escape');
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');
	await page.mouse.up();
	await expect(xField).toHaveValue(originalX);
	await expect(yField).toHaveValue(originalY);
	await expect(root).toHaveAttribute('aria-pressed', 'true');
	await expect(undo).toBeDisabled();
});

test('isolates project presets and falls back from malformed preference storage', async ({ page }) => {
	await page.setViewportSize({ width: 1120, height: 720 });
	await loadExample(page);
	await choosePreset(page, 'gameplay-preview', 'Gameplay preview');
	await page.waitForTimeout(450);

	await page.getByRole('button', { name: 'Project', exact: true }).click();
	page.once('dialog', (dialog) => void dialog.accept());
	await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Untitled project', exact: true })).toBeVisible();
	await expect(page.getByTestId('viewport-preset-control').getByRole('button', { name: 'Authoring', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();

	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
	await expect(page.getByTestId('viewport-preset-control').getByRole('button', { name: 'Gameplay preview', exact: true })).toHaveAttribute('aria-pressed', 'true');

	await page.addInitScript((key) => localStorage.setItem(key, '{broken'), UI_PREFERENCES_STORAGE_KEY);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
	await expect(page.getByTestId('viewport-preset-control').getByRole('button', { name: 'Authoring', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('restores a project preset after reload', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await loadExample(page);
	await choosePreset(page, 'visual-preview', 'Visual preview');
	await page.waitForTimeout(450);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
	await expect(page.getByTestId('viewport-preset-control').getByRole('button', { name: 'Visual preview', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('.pixi-viewport')).toHaveAttribute('data-viewport-preset', 'visual-preview');
});
