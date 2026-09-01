import { DEFAULT_LOCAL_TRANSFORM } from '../src/domain/coordinates.ts';
import { createEmptyProject } from '../src/domain/model.ts';
import type { Project } from '../src/domain/model.ts';

export const fixtureIds = {
	project: '123e4567-e89b-42d3-a456-426614174001',
	root: '123e4567-e89b-42d3-a456-426614174002',
	parentA: '123e4567-e89b-42d3-a456-426614174003',
	parentB: '123e4567-e89b-42d3-a456-426614174004',
	child: '123e4567-e89b-42d3-a456-426614174005',
	slot: '123e4567-e89b-42d3-a456-426614174006',
	asset: '123e4567-e89b-42d3-a456-426614174007',
	image: '123e4567-e89b-42d3-a456-426614174008',
	point: '123e4567-e89b-42d3-a456-426614174009',
	rectangle: '123e4567-e89b-42d3-a456-42661417400a'
} as const;

export const createRigProject = function createRigProject(): Project {
	return {
		...createEmptyProject({ id: fixtureIds.project }),
		assets: [{
			id: fixtureIds.asset,
			name: 'hero.png',
			relativePath: 'characters/hero.png',
			mimeType: 'image/png',
			width: 64,
			height: 64
		}],
		bones: [
			{
				id: fixtureIds.root,
				name: 'root',
				parentId: null,
				transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 100, y: 50 }
			},
			{
				id: fixtureIds.parentA,
				name: 'parent A',
				parentId: fixtureIds.root,
				transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 20, rotation: 0.3 }
			},
			{
				id: fixtureIds.parentB,
				name: 'parent B',
				parentId: fixtureIds.root,
				transform: { ...DEFAULT_LOCAL_TRANSFORM, x: -30, y: 20, rotation: -0.4, scaleX: 1.2, scaleY: 0.8 }
			},
			{
				id: fixtureIds.child,
				name: 'child',
				parentId: fixtureIds.parentA,
				transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 10, y: 5, rotation: 0.6, scaleX: 0.9, scaleY: 1.1, shearX: 0.2 }
			}
		],
		boneOrder: [fixtureIds.root, fixtureIds.parentA, fixtureIds.parentB, fixtureIds.child],
		slots: [{
			id: fixtureIds.slot,
			name: 'body',
			boneId: fixtureIds.child,
			setupAttachmentId: fixtureIds.image
		}],
		attachments: [
			{
				id: fixtureIds.image,
				kind: 'image',
				name: 'hero',
				slotId: fixtureIds.slot,
				assetId: fixtureIds.asset,
				transform: DEFAULT_LOCAL_TRANSFORM,
				opacity: 1,
				pivotX: 0.5,
				pivotY: 0.5
			},
			{
				id: fixtureIds.point,
				kind: 'point',
				name: 'muzzle',
				boneId: fixtureIds.child,
				transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 32 },
				enabled: true
			},
			{
				id: fixtureIds.rectangle,
				kind: 'rectangle',
				name: 'hitbox',
				boneId: fixtureIds.child,
				transform: DEFAULT_LOCAL_TRANSFORM,
				width: 20,
				height: 30,
				enabled: true
			}
		],
		setupDrawOrder: [fixtureIds.slot]
	};
};
