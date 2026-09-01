import { describe, expect, test } from 'bun:test';
import {
	createBone,
	createImageAttachment,
	createPointAttachment,
	createRectangleAttachment,
	createSlot,
	deleteAttachment,
	deleteBone,
	deleteSlot,
	renameAttachment,
	renameBone,
	renameSlot,
	reorderBone,
	reorderSlot,
	reparentBone
} from '../../src/domain/operations.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createEmptyProject } from '../../src/domain/model.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

describe('immutable project operations', () => {
	test('creates a root, child, slot, and three attachment kinds', () => {
		const empty = createEmptyProject({ id: fixtureIds.project });
		const root = createBone(empty, { name: ' root ', parentId: null }, () => fixtureIds.root);
		const withRoot = unwrap<typeof empty>(root);
		const child = createBone(withRoot, { name: 'child', parentId: fixtureIds.root }, () => fixtureIds.child);
		const withChild = unwrap<typeof empty>(child);
		const slot = createSlot(withChild, { name: 'body', boneId: fixtureIds.child }, () => fixtureIds.slot);
		const withSlot = unwrap<typeof empty>(slot);
		const withAsset = {
			...withSlot,
			assets: [{
				id: fixtureIds.asset,
				name: 'hero.png',
				relativePath: 'hero.png',
				mimeType: 'image/png' as const,
				width: 64,
				height: 64
			}]
		};
		const missingImage = createImageAttachment(withSlot, {
			name: 'hero',
			slotId: fixtureIds.slot,
			assetId: fixtureIds.asset
		}, () => fixtureIds.image);
		const imageWithAsset = createImageAttachment(withAsset, {
			name: 'hero',
			slotId: fixtureIds.slot,
			assetId: fixtureIds.asset
		}, () => fixtureIds.image);

		expect(root.ok).toBe(true);
		expect(child.ok).toBe(true);
		expect(slot.ok).toBe(true);
		expect(missingImage.ok).toBe(false);
		expect(withAsset.assets).toHaveLength(1);
		expect(imageWithAsset.ok).toBe(true);
		if (!imageWithAsset.ok) {
			return;
		}

		const point = createPointAttachment(imageWithAsset.value, {
			name: 'muzzle',
			boneId: fixtureIds.child
		}, () => fixtureIds.point);
		const rectangle = createRectangleAttachment(imageWithAsset.value, {
			name: 'hitbox',
			boneId: fixtureIds.child,
			width: 20,
			height: 30
		}, () => fixtureIds.rectangle);

		expect(point.ok).toBe(true);
		expect(rectangle.ok).toBe(true);
	});

	test('renames entities immutably and trims labels', () => {
		const project = createRigProject();
		const renamed = renameBone(project, fixtureIds.root, '  torso  ');

		expect(renamed.ok).toBe(true);
		expect(project.bones[0]?.name).toBe('root');
		if (!renamed.ok) {
			return;
		}

		expect(renamed.value.bones[0]?.name).toBe('torso');
		expect(renameSlot(renamed.value, fixtureIds.slot, 'body slot').ok).toBe(true);
		expect(renameAttachment(renamed.value, fixtureIds.image, 'hero image').ok).toBe(true);
		expect(renameBone(renamed.value, fixtureIds.root, '   ').ok).toBe(false);
	});

	test('rejects destructive deletes while references remain', () => {
		const project = createRigProject();

		expect(deleteBone(project, fixtureIds.child)).toMatchObject({ ok: false, error: { code: 'has-dependents' } });
		expect(deleteSlot(project, fixtureIds.slot)).toMatchObject({ ok: false, error: { code: 'has-dependents' } });
		expect(deleteAttachment(project, fixtureIds.image)).toMatchObject({ ok: false, error: { code: 'has-dependents' } });
	});

	test('reorders sibling bones and setup slots without mutation', () => {
		const project = createRigProject();
		const extraBone = createBone(project, {
			name: 'extra',
			parentId: fixtureIds.root
		}, () => '123e4567-e89b-42d3-a456-42661417400b');

		expect(extraBone.ok).toBe(true);
		if (!extraBone.ok) {
			return;
		}

		const reorderedBones = reorderBone(extraBone.value, fixtureIds.parentB, 0);
		const extraSlot = createSlot(extraBone.value, { name: 'extra slot', boneId: fixtureIds.root }, () => '123e4567-e89b-42d3-a456-42661417400c');

		expect(reorderedBones.ok).toBe(true);
		expect(extraSlot.ok).toBe(true);
		if (!reorderedBones.ok || !extraSlot.ok) {
			return;
		}

		expect(reorderedBones.value.boneOrder).toEqual([
			fixtureIds.root,
			fixtureIds.parentB,
			fixtureIds.parentA,
			fixtureIds.child,
			'123e4567-e89b-42d3-a456-42661417400b'
		]);
		const reorderedSlots = reorderSlot(extraSlot.value, '123e4567-e89b-42d3-a456-42661417400c', 0);

		expect(reorderedSlots.ok).toBe(true);
		if (reorderedSlots.ok) {
			expect(reorderedSlots.value.setupDrawOrder).toEqual([
				'123e4567-e89b-42d3-a456-42661417400c',
				fixtureIds.slot
			]);
		}
	});

	test('rejects root cycles and invalid parents', () => {
		const project = createRigProject();

		expect(reparentBone(project, fixtureIds.root, fixtureIds.child)).toMatchObject({
			ok: false,
			error: { code: 'hierarchy-cycle' }
		});
		expect(reparentBone(project, fixtureIds.child, '123e4567-e89b-42d3-a456-426614174099')).toMatchObject({
			ok: false,
			error: { code: 'invalid-reference' }
		});
	});
});
