import { describe, expect, test } from 'bun:test';
import { validateImageBytes } from '../../src/assets/images.ts';
import { validateProject } from '../../src/domain/validation.ts';
import { exampleExportFixture } from '../../src/examples/example-project.ts';
import { sampleClipFrames } from '../../src/export/sampling.ts';

describe('built-in example project', () => {
	test('is a valid project with a decodable export asset', () => {
		const assetBytes = exampleExportFixture.assets.get(exampleExportFixture.project.assets[0]?.id ?? '');

		if (!assetBytes) {
			throw new Error('The example export fixture is missing its image bytes.');
		}

		const image = validateImageBytes(assetBytes, 'image/png');

		expect(validateProject(exampleExportFixture.project)).toEqual([]);
		expect(image).toMatchObject({ ok: true, value: { width: 32, height: 32 } });
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
});
