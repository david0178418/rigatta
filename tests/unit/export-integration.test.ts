import { describe, expect, test } from 'bun:test';
import { strToU8, unzipSync } from 'fflate';
import { createAnimationData, createPixiGridAtlasData, createPixiPackedAtlasData } from '../../src/export/atlas.ts';
import { createClip } from '../../src/domain/animation.ts';
import { createCompanionMetadata } from '../../src/export/metadata.ts';
import { composePackedAtlasPages } from '../../src/export/packed-atlas.ts';
import { encodeRgbaPng } from '../../src/export/png.ts';
import { createExportClipSelection, setExportOutputMode } from '../../src/export/selection.ts';
import { sampleClipFrames } from '../../src/export/sampling.ts';
import { createGridLayout, composeGridFrames } from '../../src/export/grid.ts';
import { createExportZip } from '../../src/export/package.ts';
import { trimRgbaFrame, type RgbaFrame, type TrimmedRgbaFrame } from '../../src/export/trim.ts';
import type { Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createRigProject } from '../fixtures.ts';

const clipIds = [
	'123e4567-e89b-42d3-a456-4266141740a0',
	'123e4567-e89b-42d3-a456-4266141740a1'
] as const;

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const projectWithClips = function projectWithClips(): Project {
	const first = unwrap(createClip(createRigProject(), { name: 'walk' }, () => clipIds[0]));

	return unwrap(createClip(first, { name: 'idle' }, () => clipIds[1]));
};

const samplePixels = function samplePixels(index: number): RgbaFrame {
	return {
		width: 2,
		height: 2,
		pixels: Uint8Array.from([
			index, 0, 0, 255, index, 0, 0, 255,
			index, 0, 0, 255, index, 0, 0, 255
		])
	};
};

const trimmedFrame = function trimmedFrame(index: number): TrimmedRgbaFrame {
	const pixels = new Uint8Array(16);
	const source = samplePixels(index);

	Array.from({ length: source.height }, (_, row) => row).forEach((row) => {
		pixels.set(source.pixels.subarray(row * source.width * 4, (row + 1) * source.width * 4), row * source.width * 4);
	});

	return {
		sourceSize: { w: 4, h: 4 },
		spriteSourceSize: { x: 1, y: 1, w: 2, h: 2 },
		pixels,
		trimmed: true
	};
};

describe('export integration matrix', () => {
	test('builds combined grid output with frame JSON, metadata, PNG, and ZIP files', () => {
		const project = projectWithClips();
		const clip = project.clips[0];

		if (!clip) {
			throw new Error('The grid fixture clip is unavailable.');
		}

		const sampled = sampleClipFrames(project, clip.id);
		const frameKeys = sampled.frames.map((frame) => `walk/frame-${String(frame.index).padStart(4, '0')}`);
		const layout = createGridLayout(2, 2, sampled.frames.length, 8);

		if (!layout.ok) {
			throw new Error(layout.error);
		}

		const composed = composeGridFrames(sampled.frames.map((frame) => samplePixels(frame.index)), layout.value);

		if (!composed.ok) {
			throw new Error(composed.error);
		}

		const png = encodeRgbaPng(composed.value);
		const atlas = createPixiGridAtlasData(frameKeys, layout.value);
		const animations = createAnimationData([{ name: clip.name, frameKeys }]);
		const metadata = createCompanionMetadata(project, [{
			clip,
			frames: sampled.frames,
			frameKeys,
			atlasPages: sampled.frames.map(() => 0)
		}]);

		if (!png.ok || !atlas.ok || !animations.ok || !metadata.ok) {
			throw new Error('The valid combined grid output should be generated.');
		}

		const archive = createExportZip([
			{ path: 'atlas-0.png', bytes: png.value },
			{ path: 'atlas-0.json', bytes: strToU8(JSON.stringify(atlas.value)) },
			{ path: 'animations.json', bytes: strToU8(JSON.stringify(animations.value)) },
			{ path: 'boneanim-metadata.json', bytes: strToU8(JSON.stringify(metadata.value)) }
		]);

		if (!archive.ok) {
			throw new Error(archive.error);
		}

		expect(Object.keys(unzipSync(archive.value))).toEqual([
			'animations.json',
			'atlas-0.json',
			'atlas-0.png',
			'boneanim-metadata.json'
		]);
		expect(atlas.value.frames[frameKeys[0] ?? '']?.trimmed).toBe(false);
		expect(metadata.value.clips.walk?.frames).toHaveLength(sampled.frames.length);
	});

	test('builds trimmed multipage packed output with per-clip selection', () => {
		const project = projectWithClips();
		const clip = project.clips[0];

		if (!clip) {
			throw new Error('The packed fixture clip is unavailable.');
		}

		const sampled = sampleClipFrames(project, clip.id);
		const frameKeys = sampled.frames.map((frame) => `walk/frame-${String(frame.index).padStart(4, '0')}`);
		const frames = sampled.frames.map((frame) => ({ key: `walk/frame-${String(frame.index).padStart(4, '0')}`, frame: trimmedFrame(frame.index) }));
		const packed = composePackedAtlasPages(frames, {
			size: { width: 8, height: 8 },
			padding: 1,
			extrudeEdges: true
		});
		const selection = setExportOutputMode(createExportClipSelection(project), 'per-clip');

		if (!packed.ok) {
			throw new Error(packed.error);
		}

		const atlasPages = packed.value.map((page) => createPixiPackedAtlasData(page, frames));

		expect(selection.mode).toBe('per-clip');
		expect(selection.clipIds).toEqual(project.clips.map((candidate) => candidate.id));
		expect(packed.value.length).toBeGreaterThan(1);
		expect(atlasPages.every((page) => page.ok)).toBe(true);
		expect(packed.value.flatMap((page) => page.placements.map((placement) => placement.key))).toEqual(frameKeys);
	});

	test('keeps trimmed source offsets through the scan and packed metadata path', () => {
		const source: RgbaFrame = {
			width: 4,
			height: 4,
			pixels: Uint8Array.from([
				0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
				0, 0, 0, 0, 10, 20, 30, 255, 40, 50, 60, 255, 0, 0, 0, 0,
				0, 0, 0, 0, 70, 80, 90, 255, 100, 110, 120, 255, 0, 0, 0, 0,
				0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
			])
		};
		const trimmed = trimRgbaFrame(source);

		if (!trimmed.ok) {
			throw new Error(trimmed.error);
		}

		expect(trimmed.value.spriteSourceSize).toEqual({ x: 1, y: 1, w: 2, h: 2 });
		expect(trimmed.value.sourceSize).toEqual({ w: 4, h: 4 });
	});
});
