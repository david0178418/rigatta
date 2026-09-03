import { describe, expect, test } from 'bun:test';
import { validateImageBytes } from '../../src/assets/images.ts';
import { validateProject } from '../../src/domain/validation.ts';
import { exampleExportFixture } from '../../src/examples/example-project.ts';
import { sampleClipFrames } from '../../src/export/sampling.ts';

describe('built-in example project', () => {
	test('is a valid project with a decodable export asset', () => {
		const images = exampleExportFixture.project.assets.map((asset) => {
			const assetBytes = exampleExportFixture.assets.get(asset.id);

			if (!assetBytes) {
				throw new Error(`The example export fixture is missing ${asset.name}.`);
			}

			return validateImageBytes(assetBytes, 'image/png');
		});

		expect(validateProject(exampleExportFixture.project)).toEqual([]);
		expect(images.every((image) => image.ok)).toBe(true);
		expect(exampleExportFixture.project.bones).toHaveLength(14);
		expect(exampleExportFixture.project.slots).toHaveLength(12);
	});

	test('samples its animation clip without export diagnostics', () => {
		const clip = exampleExportFixture.project.clips[0];

		if (!clip) {
			throw new Error('The example project is missing its animation clip.');
		}

		const sampled = sampleClipFrames(exampleExportFixture.project, clip.id);

		expect(sampled.diagnostics).toEqual([]);
		expect(sampled.frames).toHaveLength(12);
		expect(sampled.frames[6]?.gameplay.points[0]?.id).toBe('123e4567-e89b-42d3-a456-426614174106');
	});

	test('coordinates a multi-part walk and returns every track to its loop-start value', () => {
		const clip = exampleExportFixture.project.clips[0];

		if (!clip) {
			throw new Error('The example project is missing its animation clip.');
		}

		expect(clip.name).toBe('walk');
		expect(clip.tracks).toHaveLength(10);
		expect(clip.tracks.every((track) => track.kind === 'bone-transform' && track.keys.length === 5)).toBe(true);
		expect(clip.tracks.every((track) => track.keys[0]?.value === track.keys.at(-1)?.value)).toBe(true);
		expect(clip.events.map((event) => event.name)).toEqual(['left-footstep', 'right-footstep']);
	});
});
