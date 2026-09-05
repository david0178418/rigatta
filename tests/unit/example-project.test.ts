import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { validateImageBytes } from '../../src/assets/images.ts';
import { validateProject } from '../../src/domain/validation.ts';
import { adventurerAssetData } from '../../src/examples/adventurer-asset-data.ts';
import {
	EXAMPLE_HAND_GRIP_BONE_ID,
	EXAMPLE_POINT_ID,
	exampleExportFixture,
	exampleProject
} from '../../src/examples/example-project.ts';
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
		expect(exampleProject.name).toBe('Cutout Adventurer Example');
		expect(exampleProject.assets.map(({ name, width, height }) => ({ name, width, height }))).toEqual([
			{ name: 'body_front.png', width: 39, height: 31 },
			{ name: 'head.png', width: 48, height: 54 },
			{ name: 'arm.png', width: 18, height: 33 },
			{ name: 'hand.png', width: 17, height: 15 },
			{ name: 'leg.png', width: 21, height: 23 }
		]);
		expect(exampleProject.bones).toHaveLength(10);
		expect(exampleProject.bones.map(({ name }) => name)).toEqual([
			'root', 'hips', 'torso', 'head', 'left arm', 'right arm', 'left hand', 'right hand', 'left leg', 'right leg'
		]);
		expect(exampleProject.slots).toHaveLength(8);
		expect(exampleProject.attachments.filter((attachment) => attachment.kind === 'image')).toHaveLength(8);
		const handGrip = exampleProject.attachments.find((attachment) => attachment.id === EXAMPLE_POINT_ID);

		if (handGrip?.kind !== 'point') {
			throw new Error('The Adventurer example is missing its hand-grip point.');
		}

		expect(handGrip.name).toBe('hand-grip');
		expect(handGrip.boneId).toBe(EXAMPLE_HAND_GRIP_BONE_ID);
	});

	test('keeps the embedded PNG bytes matched to the source provenance hashes', () => {
		const hashes = Object.fromEntries(Object.entries(adventurerAssetData).map(([name, asset]) => [
			name,
			createHash('sha256').update(asset.bytes).digest('hex')
		]));

		expect(hashes).toEqual({
			bodyFront: '534d2890d0934630835ad57e8654cd2f1e90866d6e96876676624b12fff13acf',
			head: 'b9549b7777171512b1311519f7610984b21a8365faeace74a5113d72e7551a93',
			arm: 'b7b33dca7c696ef7ef747a95a01106db2c06c63de40db95a7c2b372e381640db',
			hand: '536d2d16e89dc993d66e08df530ffaddbf9b2331e86ffca22d5f47adc162c312',
			leg: '465488cb4775bce737c88b9e60645806dd71fa61c602488f854286a186c6da77'
		});
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
		expect(clip.tracks).toHaveLength(7);
		expect(clip.tracks.every((track) => track.kind === 'bone-transform' && track.keys.length === 5)).toBe(true);
		expect(clip.tracks.every((track) => track.keys[0]?.value === track.keys.at(-1)?.value)).toBe(true);
		expect(clip.events.map((event) => event.name)).toEqual(['left-footstep', 'right-footstep']);
	});
});
