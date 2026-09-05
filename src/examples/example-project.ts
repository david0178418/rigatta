import { DEFAULT_LOCAL_TRANSFORM } from '../domain/coordinates.ts';
import type { EntityId } from '../domain/ids.ts';
import type {
	Bone,
	BoneTransformProperty,
	BoneTransformTrack,
	ImageAttachment,
	ImageAsset,
	NumberKey,
	Project,
	Slot
} from '../domain/model.ts';
import { createEmptyProject } from '../domain/model.ts';
import {
	ADVENTURER_SOURCE_ARCHIVE,
	ADVENTURER_SOURCE_URL,
	adventurerAssetData,
	adventurerImageAssetFor
} from './adventurer-asset-data.ts';
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
const EXAMPLE_ARM_ASSET_ID = exampleEntityId(0x111);
const EXAMPLE_HAND_ASSET_ID = exampleEntityId(0x112);
const EXAMPLE_LEG_ASSET_ID = exampleEntityId(0x113);

export const EXAMPLE_HIPS_BONE_ID = exampleEntityId(0x120);
export const EXAMPLE_TORSO_BONE_ID = exampleEntityId(0x121);
export const EXAMPLE_HEAD_BONE_ID = exampleEntityId(0x122);
export const EXAMPLE_RIGHT_ARM_BONE_ID = EXAMPLE_ARM_BONE_ID;
export const EXAMPLE_LEFT_ARM_BONE_ID = exampleEntityId(0x124);
export const EXAMPLE_LEFT_HAND_BONE_ID = exampleEntityId(0x125);
export const EXAMPLE_RIGHT_HAND_BONE_ID = exampleEntityId(0x126);
export const EXAMPLE_LEFT_LEG_BONE_ID = exampleEntityId(0x127);
export const EXAMPLE_RIGHT_LEG_BONE_ID = exampleEntityId(0x128);

const EXAMPLE_HEAD_SLOT_ID = exampleEntityId(0x140);
const EXAMPLE_LEFT_ARM_SLOT_ID = exampleEntityId(0x141);
const EXAMPLE_RIGHT_ARM_SLOT_ID = exampleEntityId(0x142);
const EXAMPLE_LEFT_HAND_SLOT_ID = exampleEntityId(0x143);
const EXAMPLE_RIGHT_HAND_SLOT_ID = exampleEntityId(0x144);
const EXAMPLE_LEFT_LEG_SLOT_ID = exampleEntityId(0x145);
const EXAMPLE_RIGHT_LEG_SLOT_ID = exampleEntityId(0x146);

const EXAMPLE_HEAD_IMAGE_ID = exampleEntityId(0x160);
const EXAMPLE_LEFT_ARM_IMAGE_ID = exampleEntityId(0x161);
const EXAMPLE_RIGHT_ARM_IMAGE_ID = exampleEntityId(0x162);
const EXAMPLE_LEFT_HAND_IMAGE_ID = exampleEntityId(0x163);
const EXAMPLE_RIGHT_HAND_IMAGE_ID = exampleEntityId(0x164);
const EXAMPLE_LEFT_LEG_IMAGE_ID = exampleEntityId(0x165);
const EXAMPLE_RIGHT_LEG_IMAGE_ID = exampleEntityId(0x166);

export const EXAMPLE_HAND_GRIP_BONE_ID = EXAMPLE_RIGHT_HAND_BONE_ID;

const imageAssets = [
	adventurerImageAssetFor('bodyFront', EXAMPLE_ASSET_ID, 'body_front.png', 'example/adventurer/body_front.png'),
	adventurerImageAssetFor('head', EXAMPLE_HEAD_ASSET_ID, 'head.png', 'example/adventurer/head.png'),
	adventurerImageAssetFor('arm', EXAMPLE_ARM_ASSET_ID, 'arm.png', 'example/adventurer/arm.png'),
	adventurerImageAssetFor('hand', EXAMPLE_HAND_ASSET_ID, 'hand.png', 'example/adventurer/hand.png'),
	adventurerImageAssetFor('leg', EXAMPLE_LEG_ASSET_ID, 'leg.png', 'example/adventurer/leg.png')
] as const satisfies readonly ImageAsset[];

const slots = [
	{ id: EXAMPLE_SLOT_ID, name: 'body', boneId: EXAMPLE_TORSO_BONE_ID, setupAttachmentId: EXAMPLE_IMAGE_ID },
	{ id: EXAMPLE_HEAD_SLOT_ID, name: 'head', boneId: EXAMPLE_HEAD_BONE_ID, setupAttachmentId: EXAMPLE_HEAD_IMAGE_ID },
	{ id: EXAMPLE_LEFT_ARM_SLOT_ID, name: 'left arm', boneId: EXAMPLE_LEFT_ARM_BONE_ID, setupAttachmentId: EXAMPLE_LEFT_ARM_IMAGE_ID },
	{ id: EXAMPLE_RIGHT_ARM_SLOT_ID, name: 'right arm', boneId: EXAMPLE_RIGHT_ARM_BONE_ID, setupAttachmentId: EXAMPLE_RIGHT_ARM_IMAGE_ID },
	{ id: EXAMPLE_LEFT_HAND_SLOT_ID, name: 'left hand', boneId: EXAMPLE_LEFT_HAND_BONE_ID, setupAttachmentId: EXAMPLE_LEFT_HAND_IMAGE_ID },
	{ id: EXAMPLE_RIGHT_HAND_SLOT_ID, name: 'right hand', boneId: EXAMPLE_RIGHT_HAND_BONE_ID, setupAttachmentId: EXAMPLE_RIGHT_HAND_IMAGE_ID },
	{ id: EXAMPLE_LEFT_LEG_SLOT_ID, name: 'left leg', boneId: EXAMPLE_LEFT_LEG_BONE_ID, setupAttachmentId: EXAMPLE_LEFT_LEG_IMAGE_ID },
	{ id: EXAMPLE_RIGHT_LEG_SLOT_ID, name: 'right leg', boneId: EXAMPLE_RIGHT_LEG_BONE_ID, setupAttachmentId: EXAMPLE_RIGHT_LEG_IMAGE_ID }
] as const satisfies readonly Slot[];

const imageAttachmentFor = function imageAttachmentFor(
	id: EntityId,
	name: string,
	slotId: EntityId,
	assetId: EntityId,
	transform: ImageAttachment['transform'],
	pivotX: number,
	pivotY: number
): ImageAttachment {
	return {
		id,
		kind: 'image',
		name,
		slotId,
		assetId,
		transform,
		opacity: 1,
		pivotX,
		pivotY
	};
};

const imageAttachments = [
	imageAttachmentFor(EXAMPLE_IMAGE_ID, 'body front', EXAMPLE_SLOT_ID, EXAMPLE_ASSET_ID, DEFAULT_LOCAL_TRANSFORM, 0.5, 1),
	imageAttachmentFor(EXAMPLE_HEAD_IMAGE_ID, 'head', EXAMPLE_HEAD_SLOT_ID, EXAMPLE_HEAD_ASSET_ID, DEFAULT_LOCAL_TRANSFORM, 0.5, 1),
	imageAttachmentFor(
		EXAMPLE_LEFT_ARM_IMAGE_ID,
		'left arm',
		EXAMPLE_LEFT_ARM_SLOT_ID,
		EXAMPLE_ARM_ASSET_ID,
		{ ...DEFAULT_LOCAL_TRANSFORM, scaleX: -1 },
		0.5,
		0
	),
	imageAttachmentFor(EXAMPLE_RIGHT_ARM_IMAGE_ID, 'right arm', EXAMPLE_RIGHT_ARM_SLOT_ID, EXAMPLE_ARM_ASSET_ID, DEFAULT_LOCAL_TRANSFORM, 0.5, 0),
	imageAttachmentFor(
		EXAMPLE_LEFT_HAND_IMAGE_ID,
		'left hand',
		EXAMPLE_LEFT_HAND_SLOT_ID,
		EXAMPLE_HAND_ASSET_ID,
		{ ...DEFAULT_LOCAL_TRANSFORM, scaleX: -1 },
		0.5,
		0
	),
	imageAttachmentFor(EXAMPLE_RIGHT_HAND_IMAGE_ID, 'right hand', EXAMPLE_RIGHT_HAND_SLOT_ID, EXAMPLE_HAND_ASSET_ID, DEFAULT_LOCAL_TRANSFORM, 0.5, 0),
	imageAttachmentFor(
		EXAMPLE_LEFT_LEG_IMAGE_ID,
		'left leg',
		EXAMPLE_LEFT_LEG_SLOT_ID,
		EXAMPLE_LEG_ASSET_ID,
		{ ...DEFAULT_LOCAL_TRANSFORM, scaleX: -1 },
		0.5,
		0
	),
	imageAttachmentFor(EXAMPLE_RIGHT_LEG_IMAGE_ID, 'right leg', EXAMPLE_RIGHT_LEG_SLOT_ID, EXAMPLE_LEG_ASSET_ID, DEFAULT_LOCAL_TRANSFORM, 0.5, 0)
];

const bones = [
	{ id: EXAMPLE_ROOT_BONE_ID, name: 'root', parentId: null, transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 128, y: 128 } },
	{ id: EXAMPLE_HIPS_BONE_ID, name: 'hips', parentId: EXAMPLE_ROOT_BONE_ID, transform: { ...DEFAULT_LOCAL_TRANSFORM, y: 14 } },
	{ id: EXAMPLE_TORSO_BONE_ID, name: 'torso', parentId: EXAMPLE_HIPS_BONE_ID, transform: DEFAULT_LOCAL_TRANSFORM },
	{
		id: EXAMPLE_HEAD_BONE_ID,
		name: 'head',
		parentId: EXAMPLE_TORSO_BONE_ID,
		transform: { ...DEFAULT_LOCAL_TRANSFORM, x: -2.5, y: -23 }
	},
	{
		id: EXAMPLE_LEFT_ARM_BONE_ID,
		name: 'left arm',
		parentId: EXAMPLE_TORSO_BONE_ID,
		transform: { ...DEFAULT_LOCAL_TRANSFORM, x: -18, y: -27 }
	},
	{
		id: EXAMPLE_RIGHT_ARM_BONE_ID,
		name: 'right arm',
		parentId: EXAMPLE_TORSO_BONE_ID,
		transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 18, y: -27 }
	},
	{
		id: EXAMPLE_LEFT_HAND_BONE_ID,
		name: 'left hand',
		parentId: EXAMPLE_LEFT_ARM_BONE_ID,
		transform: { ...DEFAULT_LOCAL_TRANSFORM, x: -5, y: 33 }
	},
	{
		id: EXAMPLE_RIGHT_HAND_BONE_ID,
		name: 'right hand',
		parentId: EXAMPLE_RIGHT_ARM_BONE_ID,
		transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 5, y: 33 }
	},
	{
		id: EXAMPLE_LEFT_LEG_BONE_ID,
		name: 'left leg',
		parentId: EXAMPLE_HIPS_BONE_ID,
		transform: { ...DEFAULT_LOCAL_TRANSFORM, x: -11, y: -6 }
	},
	{
		id: EXAMPLE_RIGHT_LEG_BONE_ID,
		name: 'right leg',
		parentId: EXAMPLE_HIPS_BONE_ID,
		transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 11, y: -6 }
	}
] as const satisfies readonly Bone[];

const keyTimes = [0, 0.25, 0.5, 0.75, 1] as const;

const createNumberKeys = function createNumberKeys(
	trackSequence: number,
	values: readonly number[]
): readonly NumberKey[] {
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

const clips = [{
	id: EXAMPLE_CLIP_ID,
	name: 'walk',
	durationSeconds: 1,
	fps: 12,
	loop: true,
	tracks: [
		createTransformTrack(0, EXAMPLE_HIPS_BONE_ID, 'y', [0, -2, 0, -2, 0]),
		createTransformTrack(1, EXAMPLE_TORSO_BONE_ID, 'rotation', [-0.035, 0.02, 0.035, 0.02, -0.035]),
		createTransformTrack(2, EXAMPLE_HEAD_BONE_ID, 'rotation', [0.02, -0.01, -0.02, -0.01, 0.02]),
		createTransformTrack(3, EXAMPLE_LEFT_ARM_BONE_ID, 'rotation', [0.42, 0.12, -0.32, -0.1, 0.42]),
		createTransformTrack(4, EXAMPLE_RIGHT_ARM_BONE_ID, 'rotation', [-0.32, -0.1, 0.42, 0.12, -0.32]),
		createTransformTrack(5, EXAMPLE_LEFT_LEG_BONE_ID, 'rotation', [-0.45, -0.12, 0.45, 0.16, -0.45]),
		createTransformTrack(6, EXAMPLE_RIGHT_LEG_BONE_ID, 'rotation', [0.45, 0.16, -0.45, -0.12, 0.45])
	],
	events: [
		{ id: EXAMPLE_EVENT_ID, timeSeconds: 0, name: 'left-footstep', payload: { foot: 'left', surface: 'ground' } },
		{ id: exampleEntityId(0x180), timeSeconds: 0.5, name: 'right-footstep', payload: { foot: 'right', surface: 'ground' } }
	]
}] as const;

export const exampleProject: Project = {
	...createEmptyProject({
		id: EXAMPLE_PROJECT_ID,
		name: 'Cutout Adventurer Example',
		logicalCanvas: { width: 256, height: 256 }
	}),
	assets: imageAssets,
	bones,
	boneOrder: bones.map((bone) => bone.id),
	slots,
	attachments: [
		{
			id: EXAMPLE_POINT_ID,
			kind: 'point',
			name: 'hand-grip',
			boneId: EXAMPLE_HAND_GRIP_BONE_ID,
			transform: { ...DEFAULT_LOCAL_TRANSFORM, y: 7 },
			enabled: true
		},
		{
			id: EXAMPLE_RECTANGLE_ID,
			kind: 'rectangle',
			name: 'hurtbox',
			boneId: EXAMPLE_ROOT_BONE_ID,
			transform: { ...DEFAULT_LOCAL_TRANSFORM, y: -16 },
			width: 60,
			height: 100,
			enabled: true
		},
		...imageAttachments
	],
	setupDrawOrder: [
		EXAMPLE_LEFT_LEG_SLOT_ID,
		EXAMPLE_LEFT_ARM_SLOT_ID,
		EXAMPLE_LEFT_HAND_SLOT_ID,
		EXAMPLE_SLOT_ID,
		EXAMPLE_HEAD_SLOT_ID,
		EXAMPLE_RIGHT_LEG_SLOT_ID,
		EXAMPLE_RIGHT_ARM_SLOT_ID,
		EXAMPLE_RIGHT_HAND_SLOT_ID
	],
	clips,
	exportSettings: { mode: 'grid', maxTextureSize: 2048, padding: 1, extrudeEdges: false }
};

export type ExampleExportFixture = Readonly<{
	project: Project;
	assets: ReadonlyMap<EntityId, Uint8Array>;
}>;

const exampleAssetBytes = new Map<EntityId, Uint8Array>([
	[EXAMPLE_ASSET_ID, adventurerAssetData.bodyFront.bytes],
	[EXAMPLE_HEAD_ASSET_ID, adventurerAssetData.head.bytes],
	[EXAMPLE_ARM_ASSET_ID, adventurerAssetData.arm.bytes],
	[EXAMPLE_HAND_ASSET_ID, adventurerAssetData.hand.bytes],
	[EXAMPLE_LEG_ASSET_ID, adventurerAssetData.leg.bytes]
]);

export const exampleExportFixture: ExampleExportFixture = { project: exampleProject, assets: exampleAssetBytes };

export const createExampleAssetBlobs = function createExampleAssetBlobs(): ProjectAssetBlobs {
	return new Map([...exampleAssetBytes].map(([assetId, assetBytes]) => [
		assetId,
		new Blob([assetBytes.slice().buffer], { type: 'image/png' })
	] as const));
};

export const exampleAssetProvenance = {
	sourceUrl: ADVENTURER_SOURCE_URL,
	archiveName: ADVENTURER_SOURCE_ARCHIVE,
	assetNames: imageAssets.map((asset) => asset.name)
} as const;
