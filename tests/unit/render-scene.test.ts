import { describe, expect, test } from 'bun:test';
import { createClip } from '../../src/domain/animation.ts';
import type { Project } from '../../src/domain/model.ts';
import { evaluatePose } from '../../src/domain/pose.ts';
import { createPoseRenderScene, createSetupRenderScene } from '../../src/rendering/render-scene.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174080';

const projectWithClip = function projectWithClip(): Project {
	const result = createClip(createRigProject(), { name: 'walk' }, () => clipId);

	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

describe('viewport render presentation flags', () => {
	test('filters authoring overlays without affecting images or per-entity visibility', () => {
		const project = createRigProject();
		const preview = createSetupRenderScene(project, {
			showBones: false,
			showGameplay: false,
			showSelectionGuides: false,
			showTransformHandles: false,
			selectedIds: [fixtureIds.root, fixtureIds.point],
			transformTool: 'translate'
		});

		if (!preview.ok) {
			throw new Error(preview.error.message);
		}

		expect(preview.value.images).toHaveLength(1);
		expect(preview.value.images[0]?.attachment.id).toBe(fixtureIds.image);
		expect(preview.value.bones).toEqual([]);
		expect(preview.value.gameplayAttachments).toEqual([]);
		expect(preview.value.selectionGuides).toEqual([]);
		expect(preview.value.transformHandles).toBeUndefined();
	});

	test('applies the same overlay contract to Animate poses', () => {
		const project = projectWithClip();
		const poseResult = evaluatePose(project, clipId, 0);

		if (!poseResult.pose) {
			throw new Error('The fixture clip should produce a pose.');
		}

		const preview = createPoseRenderScene(project, poseResult.pose, {
			showBones: false,
			showGameplay: true,
			showSelectionGuides: false,
			showTransformHandles: false,
			selectedIds: [fixtureIds.root, fixtureIds.point],
			transformTool: 'rotate'
		});

		if (!preview.ok) {
			throw new Error(preview.error.message);
		}

		expect(preview.value.images).toHaveLength(1);
		expect(preview.value.bones).toEqual([]);
		expect(preview.value.gameplayAttachments).toHaveLength(2);
		expect(preview.value.selectionGuides).toEqual([]);
		expect(preview.value.transformHandles).toBeUndefined();
	});

	test('keeps default fixed-renderer overlay behavior when flags are omitted', () => {
		const scene = createSetupRenderScene(createRigProject(), {
			selectedIds: [fixtureIds.root],
			transformTool: 'translate'
		});

		if (!scene.ok) {
			throw new Error(scene.error.message);
		}

		expect(scene.value.bones.length).toBeGreaterThan(0);
		expect(scene.value.gameplayAttachments.length).toBe(2);
		expect(scene.value.selectionGuides.length).toBe(1);
		expect(scene.value.transformHandles).toBeDefined();
	});
});
