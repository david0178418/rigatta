import { describe, expect, test } from 'bun:test';
import { createClip } from '../../src/domain/animation.ts';
import { evaluatePose } from '../../src/domain/pose.ts';
import { evaluateBoneWorldMatrices } from '../../src/domain/transforms.ts';
import { poseImageRenderInstances, setupImageRenderInstances } from '../../src/rendering/pose-images.ts';
import type { Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174080';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const projectWithClip = function projectWithClip(): Project {
	return unwrap(createClip(createRigProject(), { name: 'walk' }, () => clipId));
};

describe('fixed-canvas image instances', () => {
	test('builds setup instances in setup draw order', () => {
		const project = createRigProject();
		const evaluation = evaluateBoneWorldMatrices(project);
		const instances = setupImageRenderInstances(project, evaluation.matrices);

		expect(instances).toHaveLength(1);
		expect(instances[0]?.attachment.id).toBe(fixtureIds.image);
		expect(instances[0]?.opacity).toBe(1);
	});

	test('builds sampled instances from active pose attachment state', () => {
		const project = projectWithClip();
		const poseResult = evaluatePose(project, clipId, 0);

		if (!poseResult.pose) {
			throw new Error('The fixture clip should produce a pose.');
		}

		const instances = poseImageRenderInstances(project, poseResult.pose);
		const evaluatedImage = poseResult.pose.attachments.find((attachment) => attachment.id === fixtureIds.image);

		if (evaluatedImage?.kind !== 'image') {
			throw new Error('The fixture pose should include an evaluated image.');
		}

		expect(instances).toHaveLength(1);
		expect(instances[0]?.attachment.id).toBe(fixtureIds.image);
		expect(instances[0]?.worldMatrix).toEqual(evaluatedImage.worldMatrix);
	});
});
