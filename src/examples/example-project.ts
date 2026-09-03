import { DEFAULT_LOCAL_TRANSFORM } from '../domain/coordinates.ts';
import type { EntityId } from '../domain/ids.ts';
import type { BoneTransformProperty, BoneTransformTrack, ImageAsset, NumberKey, Project } from '../domain/model.ts';
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
export const EXAMPLE_EVENT_ID = '123e4567-e89b-42d3-a456-42661417410c';

const exampleEntityId = function exampleEntityId(sequence: number): EntityId {
	return `123e4567-e89b-42d3-a456-${sequence.toString(16).padStart(12, '0')}`;
};

const EXAMPLE_HEAD_ASSET_ID = exampleEntityId(0x110);
const EXAMPLE_LIMB_ASSET_ID = exampleEntityId(0x111);
const EXAMPLE_FOOT_ASSET_ID = exampleEntityId(0x112);
const EXAMPLE_HIPS_BONE_ID = exampleEntityId(0x120);
const EXAMPLE_TORSO_BONE_ID = exampleEntityId(0x121);
const EXAMPLE_HEAD_BONE_ID = exampleEntityId(0x122);
const EXAMPLE_RIGHT_ARM_BONE_ID = exampleEntityId(0x123);
const EXAMPLE_LEFT_FOREARM_BONE_ID = exampleEntityId(0x124);
const EXAMPLE_RIGHT_FOREARM_BONE_ID = exampleEntityId(0x125);
const EXAMPLE_LEFT_THIGH_BONE_ID = exampleEntityId(0x126);
const EXAMPLE_RIGHT_THIGH_BONE_ID = exampleEntityId(0x127);
const EXAMPLE_LEFT_SHIN_BONE_ID = exampleEntityId(0x128);
const EXAMPLE_RIGHT_SHIN_BONE_ID = exampleEntityId(0x129);
const EXAMPLE_LEFT_FOOT_BONE_ID = exampleEntityId(0x12a);
const EXAMPLE_RIGHT_FOOT_BONE_ID = exampleEntityId(0x12b);

const imageAssets = [
	{ id: EXAMPLE_ASSET_ID, name: 'robot-core.png', relativePath: 'example/robot-core.png', mimeType: 'image/png', width: 32, height: 32 },
	{ id: EXAMPLE_HEAD_ASSET_ID, name: 'robot-head.png', relativePath: 'example/robot-head.png', mimeType: 'image/png', width: 34, height: 30 },
	{ id: EXAMPLE_LIMB_ASSET_ID, name: 'robot-limb.png', relativePath: 'example/robot-limb.png', mimeType: 'image/png', width: 30, height: 12 },
	{ id: EXAMPLE_FOOT_ASSET_ID, name: 'robot-foot.png', relativePath: 'example/robot-foot.png', mimeType: 'image/png', width: 24, height: 12 }
] as const satisfies readonly ImageAsset[];

const imagePixels = function imagePixels(
	width: number,
	height: number,
	fill: readonly [number, number, number],
	accent: boolean
): Uint8Array {
	return Uint8Array.from(Array.from({ length: width * height }, (_, index) => {
		const x = index % width;
		const y = Math.floor(index / width);
		const outline = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
		const detail = accent && y >= Math.floor(height * 0.38) && y < Math.floor(height * 0.58)
			&& (x < Math.floor(width * 0.32) || x >= Math.floor(width * 0.68));
		const color = outline ? [24, 62, 72] : detail ? [245, 196, 67] : fill;

		return [...color, 255];
	}).flat());
};

const createExamplePng = function createExamplePng(
	asset: ImageAsset,
	fill: readonly [number, number, number],
	accent = false
): Uint8Array {
	const encoded = encodeRgbaPng({
		width: asset.width,
		height: asset.height,
		pixels: imagePixels(asset.width, asset.height, fill, accent)
	});

	if (!encoded.ok) {
		throw new Error(encoded.error);
	}

	return encoded.value;
};

const keyTimes = [0, 0.25, 0.5, 0.75, 1] as const;

const createNumberKeys = function createNumberKeys(trackSequence: number, values: readonly number[]): readonly NumberKey[] {
	return keyTimes.map((timeSeconds, index) => ({
		id: exampleEntityId(0x300 + trackSequence * 8 + index),
		timeSeconds,
		value: values[index] ?? values[0] ?? 0,
		interpolation: 'linear' as const,
		curve: null
	}));
};

const createTransformTrack = function createTransformTrack(
	sequence: number,
	targetId: EntityId,
	property: BoneTransformProperty,
	values: readonly number[]
): BoneTransformTrack {
	return {
		id: sequence === 0 ? EXAMPLE_TRACK_ID : exampleEntityId(0x200 + sequence),
		kind: 'bone-transform',
		targetId,
		property,
		keys: createNumberKeys(sequence, values)
	};
};

const slots = [
	{ id: EXAMPLE_SLOT_ID, name: 'body', boneId: EXAMPLE_TORSO_BONE_ID, setupAttachmentId: EXAMPLE_IMAGE_ID },
	{ id: exampleEntityId(0x140), name: 'head', boneId: EXAMPLE_HEAD_BONE_ID, setupAttachmentId: exampleEntityId(0x160) },
	{ id: exampleEntityId(0x141), name: 'left upper arm', boneId: EXAMPLE_ARM_BONE_ID, setupAttachmentId: exampleEntityId(0x161) },
	{ id: exampleEntityId(0x142), name: 'left forearm', boneId: EXAMPLE_LEFT_FOREARM_BONE_ID, setupAttachmentId: exampleEntityId(0x162) },
	{ id: exampleEntityId(0x143), name: 'right upper arm', boneId: EXAMPLE_RIGHT_ARM_BONE_ID, setupAttachmentId: exampleEntityId(0x163) },
	{ id: exampleEntityId(0x144), name: 'right forearm', boneId: EXAMPLE_RIGHT_FOREARM_BONE_ID, setupAttachmentId: exampleEntityId(0x164) },
	{ id: exampleEntityId(0x145), name: 'left thigh', boneId: EXAMPLE_LEFT_THIGH_BONE_ID, setupAttachmentId: exampleEntityId(0x165) },
	{ id: exampleEntityId(0x146), name: 'left shin', boneId: EXAMPLE_LEFT_SHIN_BONE_ID, setupAttachmentId: exampleEntityId(0x166) },
	{ id: exampleEntityId(0x147), name: 'left foot', boneId: EXAMPLE_LEFT_FOOT_BONE_ID, setupAttachmentId: exampleEntityId(0x167) },
	{ id: exampleEntityId(0x148), name: 'right thigh', boneId: EXAMPLE_RIGHT_THIGH_BONE_ID, setupAttachmentId: exampleEntityId(0x168) },
	{ id: exampleEntityId(0x149), name: 'right shin', boneId: EXAMPLE_RIGHT_SHIN_BONE_ID, setupAttachmentId: exampleEntityId(0x169) },
	{ id: exampleEntityId(0x14a), name: 'right foot', boneId: EXAMPLE_RIGHT_FOOT_BONE_ID, setupAttachmentId: exampleEntityId(0x16a) }
] as const;

const imageAttachments = slots.map((slot, index) => {
	const isTorso = index === 0;
	const isHead = index === 1;
	const isFoot = slot.name.endsWith('foot');

	return {
		id: slot.setupAttachmentId,
		kind: 'image' as const,
		name: isTorso ? 'robot core' : slot.name,
		slotId: slot.id,
		assetId: isTorso ? EXAMPLE_ASSET_ID : isHead ? EXAMPLE_HEAD_ASSET_ID : isFoot ? EXAMPLE_FOOT_ASSET_ID : EXAMPLE_LIMB_ASSET_ID,
		transform: DEFAULT_LOCAL_TRANSFORM,
		opacity: 1,
		pivotX: isTorso || isHead ? 0.5 : 0,
		pivotY: 0.5
	};
});

export const exampleProject: Project = {
	...createEmptyProject({ id: EXAMPLE_PROJECT_ID, name: 'Cutout Robot Example', logicalCanvas: { width: 256, height: 256 } }),
	assets: imageAssets,
	bones: [
		{ id: EXAMPLE_ROOT_BONE_ID, name: 'root', parentId: null, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 128, y: 128 } },
		{ id: EXAMPLE_HIPS_BONE_ID, name: 'hips', parentId: EXAMPLE_ROOT_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, y: 26 } },
		{ id: EXAMPLE_TORSO_BONE_ID, name: 'torso', parentId: EXAMPLE_HIPS_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, y: -32 } },
		{ id: EXAMPLE_HEAD_BONE_ID, name: 'head', parentId: EXAMPLE_TORSO_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, y: -43 } },
		{ id: EXAMPLE_ARM_BONE_ID, name: 'arm', parentId: EXAMPLE_ROOT_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 24 } },
		{ id: EXAMPLE_LEFT_FOREARM_BONE_ID, name: 'left forearm', parentId: EXAMPLE_ARM_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 28 } },
		{ id: EXAMPLE_RIGHT_ARM_BONE_ID, name: 'right upper arm', parentId: EXAMPLE_TORSO_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 18, y: -20, rotation: 1.39 } },
		{ id: EXAMPLE_RIGHT_FOREARM_BONE_ID, name: 'right forearm', parentId: EXAMPLE_RIGHT_ARM_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 28 } },
		{ id: EXAMPLE_LEFT_THIGH_BONE_ID, name: 'left thigh', parentId: EXAMPLE_HIPS_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: -10, rotation: 1.7 } },
		{ id: EXAMPLE_LEFT_SHIN_BONE_ID, name: 'left shin', parentId: EXAMPLE_LEFT_THIGH_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 28 } },
		{ id: EXAMPLE_LEFT_FOOT_BONE_ID, name: 'left foot', parentId: EXAMPLE_LEFT_SHIN_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 28, rotation: -1.7 } },
		{ id: EXAMPLE_RIGHT_THIGH_BONE_ID, name: 'right thigh', parentId: EXAMPLE_HIPS_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 10, rotation: 1.44 } },
		{ id: EXAMPLE_RIGHT_SHIN_BONE_ID, name: 'right shin', parentId: EXAMPLE_RIGHT_THIGH_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 28 } },
		{ id: EXAMPLE_RIGHT_FOOT_BONE_ID, name: 'right foot', parentId: EXAMPLE_RIGHT_SHIN_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 28, rotation: -1.44 } }
	],
	boneOrder: [
		EXAMPLE_ROOT_BONE_ID, EXAMPLE_HIPS_BONE_ID, EXAMPLE_TORSO_BONE_ID, EXAMPLE_HEAD_BONE_ID,
		EXAMPLE_ARM_BONE_ID, EXAMPLE_LEFT_FOREARM_BONE_ID, EXAMPLE_RIGHT_ARM_BONE_ID, EXAMPLE_RIGHT_FOREARM_BONE_ID,
		EXAMPLE_LEFT_THIGH_BONE_ID, EXAMPLE_LEFT_SHIN_BONE_ID, EXAMPLE_LEFT_FOOT_BONE_ID,
		EXAMPLE_RIGHT_THIGH_BONE_ID, EXAMPLE_RIGHT_SHIN_BONE_ID, EXAMPLE_RIGHT_FOOT_BONE_ID
	],
	slots,
	attachments: [
		...imageAttachments,
		{ id: EXAMPLE_POINT_ID, kind: 'point', name: 'muzzle', boneId: EXAMPLE_ARM_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 18 }, enabled: true },
		{ id: EXAMPLE_RECTANGLE_ID, kind: 'rectangle', name: 'hurtbox', boneId: EXAMPLE_ROOT_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, y: 24 }, width: 48, height: 16, enabled: true }
	],
	setupDrawOrder: slots.map((slot) => slot.id),
	clips: [{
		id: EXAMPLE_CLIP_ID,
		name: 'walk',
		durationSeconds: 1,
		fps: 12,
		loop: true,
		tracks: [
			createTransformTrack(0, EXAMPLE_HIPS_BONE_ID, 'y', [26, 22, 26, 22, 26]),
			createTransformTrack(1, EXAMPLE_HIPS_BONE_ID, 'rotation', [-0.04, 0, 0.04, 0, -0.04]),
			createTransformTrack(2, EXAMPLE_ARM_BONE_ID, 'rotation', [0.7, 1.3, 1.9, 1.3, 0.7]),
			createTransformTrack(3, EXAMPLE_LEFT_FOREARM_BONE_ID, 'rotation', [0.3, 0.05, -0.15, 0.05, 0.3]),
			createTransformTrack(4, EXAMPLE_RIGHT_ARM_BONE_ID, 'rotation', [2.05, 1.55, 1.2, 1.55, 2.05]),
			createTransformTrack(5, EXAMPLE_RIGHT_FOREARM_BONE_ID, 'rotation', [-0.15, 0.05, 0.3, 0.05, -0.15]),
			createTransformTrack(6, EXAMPLE_LEFT_THIGH_BONE_ID, 'rotation', [1.22, 1.55, 1.95, 1.6, 1.22]),
			createTransformTrack(7, EXAMPLE_LEFT_SHIN_BONE_ID, 'rotation', [0.35, -0.1, -0.4, 0.2, 0.35]),
			createTransformTrack(8, EXAMPLE_RIGHT_THIGH_BONE_ID, 'rotation', [1.95, 1.6, 1.22, 1.55, 1.95]),
			createTransformTrack(9, EXAMPLE_RIGHT_SHIN_BONE_ID, 'rotation', [-0.4, 0.2, 0.35, -0.1, -0.4])
		],
		events: [
			{ id: EXAMPLE_EVENT_ID, timeSeconds: 0, name: 'left-footstep', payload: { foot: 'left', surface: 'metal' } },
			{ id: exampleEntityId(0x180), timeSeconds: 0.5, name: 'right-footstep', payload: { foot: 'right', surface: 'metal' } }
		]
	}],
	exportSettings: { mode: 'grid', maxTextureSize: 2048, padding: 1, extrudeEdges: false }
};

export type ExampleExportFixture = Readonly<{
	project: Project;
	assets: ReadonlyMap<EntityId, Uint8Array>;
}>;

const exampleAssetBytes = new Map<EntityId, Uint8Array>([
	[EXAMPLE_ASSET_ID, createExamplePng(imageAssets[0], [54, 190, 164])],
	[EXAMPLE_HEAD_ASSET_ID, createExamplePng(imageAssets[1], [84, 214, 189], true)],
	[EXAMPLE_LIMB_ASSET_ID, createExamplePng(imageAssets[2], [70, 145, 184])],
	[EXAMPLE_FOOT_ASSET_ID, createExamplePng(imageAssets[3], [245, 196, 67])]
]);

export const exampleExportFixture: ExampleExportFixture = { project: exampleProject, assets: exampleAssetBytes };

export const createExampleAssetBlobs = function createExampleAssetBlobs(): ProjectAssetBlobs {
	return new Map([...exampleAssetBytes].map(([assetId, assetBytes]) => [
		assetId,
		new Blob([assetBytes.slice().buffer], { type: 'image/png' })
	] as const));
};
