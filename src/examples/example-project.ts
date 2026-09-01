import { DEFAULT_LOCAL_TRANSFORM } from '../domain/coordinates.ts';
import type { EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';
import { createEmptyProject } from '../domain/model.ts';
import { encodeRgbaPng } from '../export/png.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';

export const EXAMPLE_PROJECT_ID = '123e4567-e89b-42d3-a456-426614174100';
export const EXAMPLE_ASSET_ID = '123e4567-e89b-42d3-a456-426614174101';
export const EXAMPLE_ROOT_BONE_ID = '123e4567-e89b-42d3-a456-426614174102';
export const EXAMPLE_ARM_BONE_ID = '123e4567-e89b-42d3-a456-426614174103';
export const EXAMPLE_SLOT_ID = '123e4567-e89b-42d3-a456-426614174104';
export const EXAMPLE_IMAGE_ID = '123e4567-e89b-42d3-a456-426614174105';
export const EXAMPLE_POINT_ID = '123e4567-e89b-42d3-a456-426614174106';
export const EXAMPLE_RECTANGLE_ID = '123e4567-e89b-42d3-a456-426614174107';
export const EXAMPLE_CLIP_ID = '123e4567-e89b-42d3-a456-426614174108';
export const EXAMPLE_TRACK_ID = '123e4567-e89b-42d3-a456-426614174109';
export const EXAMPLE_KEY_START_ID = '123e4567-e89b-42d3-a456-42661417410a';
export const EXAMPLE_KEY_END_ID = '123e4567-e89b-42d3-a456-42661417410b';
export const EXAMPLE_KEY_LOOP_ID = '123e4567-e89b-42d3-a456-42661417410d';
export const EXAMPLE_EVENT_ID = '123e4567-e89b-42d3-a456-42661417410c';

const EXAMPLE_IMAGE_SIZE = 32;

const examplePixelBytes = function examplePixelBytes(): Uint8Array {
	return Uint8Array.from(Array.from({ length: EXAMPLE_IMAGE_SIZE * EXAMPLE_IMAGE_SIZE }, (_, index) => {
		const x = index % EXAMPLE_IMAGE_SIZE;
		const y = Math.floor(index / EXAMPLE_IMAGE_SIZE);
		const border = x < 2 || y < 2 || x >= EXAMPLE_IMAGE_SIZE - 2 || y >= EXAMPLE_IMAGE_SIZE - 2;
		const center = x >= 8 && x < 24 && y >= 8 && y < 24;

		return border || center ? [54, 190, 164, 255] : [0, 0, 0, 0];
	}).flat());
};

const createExamplePng = function createExamplePng(): Uint8Array {
	const encoded = encodeRgbaPng({ width: EXAMPLE_IMAGE_SIZE, height: EXAMPLE_IMAGE_SIZE, pixels: examplePixelBytes() });

	if (!encoded.ok) {
		throw new Error(encoded.error);
	}

	return encoded.value;
};

export const exampleProject: Project = {
	...createEmptyProject({
		id: EXAMPLE_PROJECT_ID,
		name: 'Cutout Robot Example',
		logicalCanvas: { width: 256, height: 256 }
	}),
	assets: [{
		id: EXAMPLE_ASSET_ID,
		name: 'robot-core.png',
		relativePath: 'example/robot-core.png',
		mimeType: 'image/png',
		width: EXAMPLE_IMAGE_SIZE,
		height: EXAMPLE_IMAGE_SIZE
	}],
	bones: [
		{
			id: EXAMPLE_ROOT_BONE_ID,
			name: 'root',
			parentId: null,
			transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 128, y: 128 }
		},
		{
			id: EXAMPLE_ARM_BONE_ID,
			name: 'arm',
			parentId: EXAMPLE_ROOT_BONE_ID,
			transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 24 }
		}
	],
	boneOrder: [EXAMPLE_ROOT_BONE_ID, EXAMPLE_ARM_BONE_ID],
	slots: [{
		id: EXAMPLE_SLOT_ID,
		name: 'body',
		boneId: EXAMPLE_ROOT_BONE_ID,
		setupAttachmentId: EXAMPLE_IMAGE_ID
	}],
	attachments: [
		{
			id: EXAMPLE_IMAGE_ID,
			kind: 'image',
			name: 'robot core',
			slotId: EXAMPLE_SLOT_ID,
			assetId: EXAMPLE_ASSET_ID,
			transform: DEFAULT_LOCAL_TRANSFORM,
			opacity: 1,
			pivotX: 0.5,
			pivotY: 0.5
		},
		{
			id: EXAMPLE_POINT_ID,
			kind: 'point',
			name: 'muzzle',
			boneId: EXAMPLE_ARM_BONE_ID,
			transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 18 },
			enabled: true
		},
		{
			id: EXAMPLE_RECTANGLE_ID,
			kind: 'rectangle',
			name: 'hurtbox',
			boneId: EXAMPLE_ROOT_BONE_ID,
			transform: { ...DEFAULT_LOCAL_TRANSFORM, y: 24 },
			width: 48,
			height: 16,
			enabled: true
		}
	],
	setupDrawOrder: [EXAMPLE_SLOT_ID],
	clips: [{
		id: EXAMPLE_CLIP_ID,
		name: 'pulse',
		durationSeconds: 1,
		fps: 12,
		loop: true,
		tracks: [{
			id: EXAMPLE_TRACK_ID,
			kind: 'bone-transform',
			targetId: EXAMPLE_ARM_BONE_ID,
			property: 'rotation',
			keys: [
				{ id: EXAMPLE_KEY_START_ID, timeSeconds: 0, value: -0.15, interpolation: 'linear', curve: null },
				{ id: EXAMPLE_KEY_END_ID, timeSeconds: 0.5, value: 0.15, interpolation: 'linear', curve: null },
				{ id: EXAMPLE_KEY_LOOP_ID, timeSeconds: 1, value: -0.15, interpolation: 'linear', curve: null }
			]
		}],
		events: [{
			id: EXAMPLE_EVENT_ID,
			timeSeconds: 0.5,
			name: 'pulse-hit',
			payload: { intensity: 1, tag: 'example' }
		}]
	}],
	exportSettings: {
		mode: 'grid',
		maxTextureSize: 2048,
		padding: 1,
		extrudeEdges: false
	}
};

export type ExampleExportFixture = Readonly<{
	project: Project;
	assets: ReadonlyMap<EntityId, Uint8Array>;
}>;

export const exampleExportFixture: ExampleExportFixture = {
	project: exampleProject,
	assets: new Map([[EXAMPLE_ASSET_ID, createExamplePng()]])
};

export const createExampleAssetBlobs = function createExampleAssetBlobs(): ProjectAssetBlobs {
	const assetBytes = exampleExportFixture.assets.get(EXAMPLE_ASSET_ID);

	if (!assetBytes) {
		return new Map();
	}

	const buffer = new ArrayBuffer(assetBytes.byteLength);
	new Uint8Array(buffer).set(assetBytes);

	return new Map([[EXAMPLE_ASSET_ID, new Blob([buffer], { type: 'image/png' })]]);
};
