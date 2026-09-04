import { expect, type Download, type Locator, type Page } from '@playwright/test';
import { strFromU8, unzlibSync, unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import type { SpritesheetData, SpritesheetFrameData } from 'pixi.js';
import type { AtlasValidationHook } from '../../src/export/atlas-validation-page.ts';
import {
	EXAMPLE_CLIP_ID,
	EXAMPLE_EVENT_ID,
	EXAMPLE_POINT_ID,
	EXAMPLE_RECTANGLE_ID,
	createExampleAssetBlobs,
	exampleProject
} from '../../src/examples/example-project.ts';
import type { Project } from '../../src/domain/model.ts';
import { exportProjectArchive } from '../../src/persistence/archive.ts';

export type ExportProofControl = {
	captureDelayMs: number;
	failCapture: boolean;
	failZipBlob: boolean;
	failDownload: boolean;
};

declare global {
	interface Window {
		__boneAnimationExportProof?: ExportProofControl;
		__boneAnimationValidateAtlas?: AtlasValidationHook;
	}
}

type JsonObject = Readonly<Record<string, unknown>>;
type ZipEntries = ReturnType<typeof unzipSync>;
type PngFrame = Readonly<{
	width: number;
	height: number;
	pixels: Uint8Array;
}>;
type ExportDownload = Readonly<{
	download: Download;
	bytes: Uint8Array;
	entries: ZipEntries;
}>;

const isJsonObject = function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isFiniteNumber = function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
};

const jsonObjectFor = function jsonObjectFor(entries: ZipEntries, path: string): JsonObject {
	const bytes = entries[path];

	if (!bytes) {
		throw new Error(`Export ZIP is missing ${path}.`);
	}

	const value: unknown = JSON.parse(strFromU8(bytes));

	if (!isJsonObject(value)) {
		throw new Error(`Export ZIP entry ${path} is not a JSON object.`);
	}

	return value;
};

const objectProperty = function objectProperty(object: JsonObject, key: string): unknown {
	return object[key];
};

const arrayProperty = function arrayProperty(object: JsonObject, key: string): readonly unknown[] {
	const value = objectProperty(object, key);

	if (!Array.isArray(value)) {
		throw new Error(`Export JSON property ${key} is not an array.`);
	}

	return value;
};

const stringArrayProperty = function stringArrayProperty(object: JsonObject, key: string): readonly string[] {
	const values = arrayProperty(object, key);

	if (!values.every((value): value is string => typeof value === 'string')) {
		throw new Error(`Export JSON property ${key} is not a string array.`);
	}

	return values;
};

const frameData = function frameData(value: unknown): value is SpritesheetFrameData {
	if (!isJsonObject(value) || !isJsonObject(value.frame)) {
		return false;
	}

	const frame = value.frame;
	const spriteSourceSize = value.spriteSourceSize;
	const sourceSize = value.sourceSize;

	return ['x', 'y', 'w', 'h'].every((key) => isFiniteNumber(frame[key]))
		&& (value.trimmed === undefined || typeof value.trimmed === 'boolean')
		&& (value.rotated === undefined || typeof value.rotated === 'boolean')
		&& (spriteSourceSize === undefined || isJsonObject(spriteSourceSize))
		&& (sourceSize === undefined || isJsonObject(sourceSize));
};

const isAtlasData = function isAtlasData(value: unknown): value is SpritesheetData {
	if (!isJsonObject(value) || !isJsonObject(value.frames) || !isJsonObject(value.meta)) {
		return false;
	}

	return Object.values(value.frames).every(frameData)
		&& (typeof value.meta.scale === 'string' || typeof value.meta.scale === 'number');
};

const atlasData = function atlasData(entries: ZipEntries, path: string): SpritesheetData {
	const value = jsonObjectFor(entries, path);

	if (!isAtlasData(value)) {
		throw new Error(`Export ZIP entry ${path} is not a valid Pixi atlas.`);
	}

	return value;
};

const readUint32 = function readUint32(bytes: Uint8Array, offset: number): number {
	const values = Array.from(bytes.slice(offset, offset + 4));

	if (values.length !== 4) {
		throw new Error('PNG has a truncated 32-bit field.');
	}

	return values.reduce((total, value) => total * 256 + value, 0);
};

const concatBytes = function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
	return Uint8Array.from(parts.flatMap((part) => [...part]));
};

const idatChunksFrom = function idatChunksFrom(
	bytes: Uint8Array,
	offset: number,
	chunks: readonly Uint8Array[]
): readonly Uint8Array[] {
	if (offset >= bytes.byteLength) {
		return chunks;
	}

	const length = readUint32(bytes, offset);
	const typeBytes = bytes.slice(offset + 4, offset + 8);
	const nextOffset = offset + 12 + length;

	if (typeBytes.length !== 4 || nextOffset > bytes.byteLength) {
		throw new Error('PNG contains a truncated chunk.');
	}

	const type = String.fromCharCode(...typeBytes);
	const nextChunks = type === 'IDAT'
		? [...chunks, bytes.slice(offset + 8, offset + 8 + length)]
		: chunks;

	return idatChunksFrom(bytes, nextOffset, nextChunks);
};

export const decodePng = function decodePng(bytes: Uint8Array): PngFrame {
	const signature = [137, 80, 78, 71, 13, 10, 26, 10];
	const actualSignature = Array.from(bytes.slice(0, signature.length));

	if (actualSignature.length !== signature.length || !signature.every((value, index) => actualSignature[index] === value)) {
		throw new Error('Export entry is not a PNG.');
	}

	const width = readUint32(bytes, 16);
	const height = readUint32(bytes, 20);
	const scanlines = unzlibSync(concatBytes(idatChunksFrom(bytes, 8, [])));
	const rowLength = width * 4 + 1;

	if (width < 1 || height < 1 || scanlines.byteLength !== rowLength * height) {
		throw new Error('Export PNG scanlines do not match the image dimensions.');
	}

	const filters = Array.from({ length: height }, (_, row) => scanlines[row * rowLength]);

	if (filters.some((filter) => filter !== 0)) {
		throw new Error('Export PNG uses an unsupported scanline filter.');
	}

	return {
		width,
		height,
		pixels: Uint8Array.from(Array.from({ length: width * height * 4 }, (_, index) => {
			const row = Math.floor(index / (width * 4));
			const column = index % (width * 4);

			return scanlines[row * rowLength + column + 1] ?? 0;
		}))
	};
};

const framePixelsFor = function framePixelsFor(png: PngFrame, frame: SpritesheetFrameData['frame']): PngFrame {
	if (frame.x < 0 || frame.y < 0 || frame.w < 1 || frame.h < 1 || frame.x + frame.w > png.width || frame.y + frame.h > png.height) {
		throw new Error('Pixi frame bounds exceed the exported PNG.');
	}

	return {
		width: frame.w,
		height: frame.h,
		pixels: Uint8Array.from(Array.from({ length: frame.w * frame.h * 4 }, (_, index) => {
			const row = Math.floor(index / (frame.w * 4));
			const column = index % (frame.w * 4);

			return png.pixels[((frame.y + row) * png.width * 4) + frame.x * 4 + column] ?? 0;
		}))
	};
};

const overlayColors = [
	[0x6f, 0xd4, 0xbd],
	[0x9a, 0xe8, 0xd4],
	[0xff, 0xd2, 0x7d],
	[0xf0, 0xb8, 0x6d],
	[0x29, 0x33, 0x42]
] as const;

const nearOverlayColor = function nearOverlayColor(red: number, green: number, blue: number): boolean {
	return overlayColors.some(([overlayRed, overlayGreen, overlayBlue]) => Math.max(
		Math.abs(red - overlayRed),
		Math.abs(green - overlayGreen),
		Math.abs(blue - overlayBlue)
	) <= 3);
};

const expectVisualFrame = function expectVisualFrame(frame: PngFrame): void {
	const visiblePixels = Array.from({ length: frame.width * frame.height }, (_, index) => index)
		.filter((index) => (frame.pixels[index * 4 + 3] ?? 0) > 16);
	const guidePixels = visiblePixels.filter((index) => nearOverlayColor(
		frame.pixels[index * 4] ?? 0,
		frame.pixels[index * 4 + 1] ?? 0,
		frame.pixels[index * 4 + 2] ?? 0
	));

	expect(visiblePixels.length).toBeGreaterThan(0);
	expect(guidePixels).toHaveLength(0);
};

const safePath = function safePath(directory: string, filename: string): string {
	return directory.length > 0 ? `${directory}/${filename}` : filename;
};

const bytesFor = function bytesFor(entries: ZipEntries, path: string): Uint8Array {
	const bytes = entries[path];

	if (!bytes) {
		throw new Error(`Export ZIP is missing ${path}.`);
	}

	return bytes;
};

const frameKeysFromAnimation = function frameKeysFromAnimation(
	animations: JsonObject,
	clipName: string
): readonly string[] {
	const animationMap = objectProperty(animations, 'animations');

	if (!isJsonObject(animationMap)) {
		throw new Error('Export animations JSON has no animations object.');
	}

	return stringArrayProperty(animationMap, clipName);
};

const metadataClipFrames = function metadataClipFrames(
	metadata: JsonObject,
	clipName: string
): readonly JsonObject[] {
	const clips = objectProperty(metadata, 'clips');

	if (!isJsonObject(clips)) {
		throw new Error('Export metadata has no clips object.');
	}

	const clip = objectProperty(clips, clipName);

	if (!isJsonObject(clip)) {
		throw new Error(`Export metadata is missing clip ${clipName}.`);
	}

	const frames = arrayProperty(clip, 'frames');

	if (!frames.every(isJsonObject)) {
		throw new Error(`Export metadata frames for ${clipName} are malformed.`);
	}

	return frames;
};

const reloadPixiAtlasPage = async function reloadPixiAtlasPage(
	page: Page,
	png: Uint8Array,
	atlas: SpritesheetData,
	frameKeys: readonly string[]
): Promise<void> {
	await page.goto('/?atlas-validation');
	await expect(page.locator('#atlas-validation-result')).toContainText('"ok":true');
	const validation = await page.evaluate(async ({ pngBytes, atlasData, keys }) => {
		const validateAtlas = window.__boneAnimationValidateAtlas;

		if (!validateAtlas) {
			throw new Error('The bundled atlas validation hook is unavailable.');
		}

		return validateAtlas({ pngBytes, atlasData, frameKeys: keys });
	}, { pngBytes: Array.from(png), atlasData: atlas, keys: frameKeys });

	if (!validation.ok) {
		throw new Error(`Pixi atlas reload failed: ${validation.error}`);
	}

	expect(validation.value).toHaveLength(frameKeys.length);
};

export const installExportProofControls = async function installExportProofControls(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const control: ExportProofControl = {
			captureDelayMs: 0,
			failCapture: false,
			failZipBlob: false,
			failDownload: false
		};
		const originalToBlob = HTMLCanvasElement.prototype.toBlob;
		const originalBlob = globalThis.Blob;
		const originalCreateObjectURL = globalThis.URL.createObjectURL.bind(globalThis.URL);

		window.__boneAnimationExportProof = control;
		HTMLCanvasElement.prototype.toBlob = function toBlob(callback, type, quality): void {
			const capture = (): void => {
				if (control.failCapture) {
					callback(null);
					return;
				}

				originalToBlob.call(this, callback, type, quality);
			};

			if (control.captureDelayMs > 0) {
				window.setTimeout(capture, control.captureDelayMs);
				return;
			}

			capture();
		};
		globalThis.Blob = new Proxy(originalBlob, {
			construct(target, parameters): object {
				if (control.failZipBlob) {
					throw new Error('Synthetic ZIP Blob construction failure.');
				}

				return Reflect.construct(target, parameters);
			}
		});
		globalThis.URL.createObjectURL = (blob): string => {
			if (control.failDownload) {
				throw new Error('Synthetic browser download failure.');
			}

			return originalCreateObjectURL(blob);
		};
	});
};

export const setExportProofControl = async function setExportProofControl(
	page: Page,
	update: Readonly<Partial<ExportProofControl>>
): Promise<void> {
	await page.evaluate((next) => {
		const control = window.__boneAnimationExportProof;

		if (!control) {
			throw new Error('Export proof controls were not installed.');
		}

		Object.assign(control, next);
	}, update);
};

export const packedExampleProject = function packedExampleProject(maxTextureSize: number): Project {
	return {
		...exampleProject,
		exportSettings: {
			...exampleProject.exportSettings,
			mode: 'packed',
			maxTextureSize,
			padding: 1,
			extrudeEdges: true
		}
	};
};

const archiveFor = async function archiveFor(project: Project): Promise<Buffer> {
	const blobs = createExampleAssetBlobs();
	const assetBytes = new Map(await Promise.all([...blobs].map(async ([assetId, blob]) => [
		assetId,
		new Uint8Array(await blob.arrayBuffer())
	] as const)));
	const archive = await exportProjectArchive(project, assetBytes);

	if (!archive.ok) {
		throw new Error(`Could not create export browser fixture: ${archive.error.message}`);
	}

	return Buffer.from(archive.value);
};

export const loadExample = async function loadExample(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
};

export const importProjectFixture = async function importProjectFixture(page: Page, project: Project): Promise<void> {
	const archive = await archiveFor(project);

	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Import .boneanim', exact: true }).click();
	await page.locator('input[type="file"]').setInputFiles({
		name: 'export-proof-fixture.boneanim',
		mimeType: 'application/zip',
		buffer: archive
	});
	await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
};

export const exportDialogFor = async function exportDialogFor(page: Page): Promise<Locator> {
	await page.getByRole('button', { name: 'Export', exact: true }).click();

	const dialog = page.getByRole('dialog', { name: 'Export animation', exact: true });

	await expect(dialog).toBeVisible();

	return dialog;
};

export const exportZip = async function exportZip(page: Page, dialog: Locator): Promise<ExportDownload> {
	const downloadPromise = page.waitForEvent('download');

	await dialog.getByRole('button', { name: 'Export ZIP', exact: true }).click();
	const download = await downloadPromise;
	const downloadPath = await download.path();

	if (!downloadPath) {
		throw new Error('The export ZIP download path is unavailable.');
	}

	const bytes = new Uint8Array(await readFile(downloadPath));

	return { download, bytes, entries: unzipSync(bytes) };
};

export const retryZip = async function retryZip(page: Page, dialog: Locator): Promise<ExportDownload> {
	const downloadPromise = page.waitForEvent('download');

	await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
	const download = await downloadPromise;
	const downloadPath = await download.path();

	if (!downloadPath) {
		throw new Error('The retry export ZIP download path is unavailable.');
	}

	const bytes = new Uint8Array(await readFile(downloadPath));

	return { download, bytes, entries: unzipSync(bytes) };
};

export const waitForExportStatus = async function waitForExportStatus(
	page: Page,
	status: 'idle' | 'rendering' | 'packaging' | 'completed' | 'cancelled' | 'failed'
): Promise<void> {
	await expect(page.getByTestId('export-run-state')).toHaveAttribute('data-export-status', status, { timeout: 30000 });
};

export const inspectExportGroup = async function inspectExportGroup(
	page: Page,
	entries: ZipEntries,
	options: Readonly<{
		directory: string;
		clipNames: readonly string[];
		frameCount: number;
		atlasMode: 'grid' | 'packed';
		maxTextureSize: number;
		expectedPageCount: number | 'multiple';
	}>
): Promise<void> {
	const prefix = options.directory.length > 0 ? `${options.directory}/` : '';
	const groupPaths = Object.keys(entries).filter((path) => path.startsWith(prefix));
	const animations = jsonObjectFor(entries, safePath(options.directory, 'animations.json'));
	const metadata = jsonObjectFor(entries, safePath(options.directory, 'boneanim-metadata.json'));
	const animationMap = objectProperty(animations, 'animations');
	const metadataMap = objectProperty(metadata, 'clips');

	if (!isJsonObject(animationMap) || !isJsonObject(metadataMap)) {
		throw new Error('Export JSON is missing its clip maps.');
	}

	expect(Object.keys(animationMap)).toEqual(options.clipNames);
	expect(Object.keys(metadataMap)).toEqual(options.clipNames);

	const allAnimationKeys = options.clipNames.flatMap((clipName) => frameKeysFromAnimation(animations, clipName));
	const atlasJsonPaths = groupPaths
		.filter((path) => /atlas-\d+\.json$/.test(path))
		.sort();
	const atlasPngPaths = groupPaths
		.filter((path) => /atlas-\d+\.png$/.test(path))
		.sort();

	expect(atlasJsonPaths).toHaveLength(atlasPngPaths.length);
	if (options.expectedPageCount === 'multiple') {
		expect(atlasJsonPaths.length).toBeGreaterThan(1);
	} else {
		expect(atlasJsonPaths.length).toBe(options.expectedPageCount);
	}

	const atlasFrameKeys = await atlasJsonPaths.reduce(async (previousPromise, atlasJsonPath, pageIndex) => {
		const previous = await previousPromise;
		const atlas = atlasData(entries, atlasJsonPath);
		const pngPath = safePath(options.directory, `atlas-${pageIndex}.png`);
		const png = decodePng(bytesFor(entries, pngPath));
		const atlasFrameKeysForPage = Object.keys(atlas.frames);
		const meta = atlas.meta;

		expect(png.width).toBe(options.atlasMode === 'packed' ? options.maxTextureSize : Math.max(1, Math.floor(png.width / 256)) * 256);
		expect(png.height).toBe(options.atlasMode === 'packed' ? options.maxTextureSize : Math.max(1, Math.floor(png.height / 256)) * 256);
		expect(meta.image).toBe(`atlas-${pageIndex}.png`);
		if (meta.size) {
			expect(meta.size.w).toBe(png.width);
			expect(meta.size.h).toBe(png.height);
		}

		await reloadPixiAtlasPage(page, bytesFor(entries, pngPath), atlas, atlasFrameKeysForPage);
		const firstKey = atlasFrameKeysForPage[0];

		if (!firstKey) {
			throw new Error(`Export atlas ${atlasJsonPath} has no frames.`);
		}

		const firstFrame = atlas.frames[firstKey];

		if (!firstFrame) {
			throw new Error(`Export atlas ${atlasJsonPath} is missing ${firstKey}.`);
		}

		expectVisualFrame(framePixelsFor(png, firstFrame.frame));

		return [...previous, ...atlasFrameKeysForPage];
	}, Promise.resolve<readonly string[]>([]));

	expect(atlasFrameKeys).toEqual(allAnimationKeys);
	expect(atlasFrameKeys).toHaveLength(options.frameCount);

	options.clipNames.forEach((clipName) => {
		const frames = metadataClipFrames(metadata, clipName);

		expect(frames).toHaveLength(options.frameCount / options.clipNames.length);
		const firstFrame = frames[0];

		if (!firstFrame) {
			throw new Error(`Export metadata has no first frame for ${clipName}.`);
		}

		const points = objectProperty(firstFrame, 'points');
		const rectangles = objectProperty(firstFrame, 'rectangles');
		const events = arrayProperty(firstFrame, 'events');

		if (!isJsonObject(points) || !isJsonObject(rectangles)) {
			throw new Error(`Export metadata has no gameplay geometry for ${clipName}.`);
		}

		expect(points[EXAMPLE_POINT_ID]).toBeDefined();
		expect(rectangles[EXAMPLE_RECTANGLE_ID]).toBeDefined();
		expect(events.some((event) => isJsonObject(event) && event.name === 'left-footstep')).toBe(true);
		expect(events.some((event) => isJsonObject(event) && event.id === EXAMPLE_EVENT_ID)).toBe(true);
	});
};

export const exampleProjectIdForAssertions = EXAMPLE_CLIP_ID;
