import { describe, expect, test } from 'bun:test';
import { createClip } from '../../src/domain/animation.ts';
import { canvasWarningsForPose, canvasWarningsForSetup } from '../../src/domain/canvas-warnings.ts';
import { evaluatePose } from '../../src/domain/pose.ts';
import type { Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174090';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const projectWithClip = function projectWithClip(project: Project): Project {
	return unwrap(createClip(project, { name: 'walk' }, () => clipId));
};

describe('logical canvas overflow warnings', () => {
	test('does not warn when setup content fits inside the logical canvas', () => {
		expect(canvasWarningsForSetup(createRigProject())).toEqual([]);
	});

	test('reports clipped setup image bounds and fully outside gameplay bounds', () => {
		const clippedProject = {
			...createRigProject(),
			logicalCanvas: { width: 128, height: 128 }
		};
		const warnings = canvasWarningsForSetup(clippedProject);
		const imageWarning = warnings.find(({ attachmentId }) => attachmentId === fixtureIds.image);
		const pointWarning = warnings.find(({ attachmentId }) => attachmentId === fixtureIds.point);

		expect(imageWarning).toMatchObject({ code: 'canvas-clipping', edges: ['right'] });
		expect(pointWarning).toMatchObject({ code: 'canvas-overflow', edges: ['right'] });
	});

	test('uses active evaluated pose geometry for image bounds', () => {
		const baseProject = createRigProject();
		const project = projectWithClip({
			...baseProject,
			logicalCanvas: { width: 128, height: 128 },
			bones: baseProject.bones.map((bone) => bone.id === fixtureIds.root
				? { ...bone, transform: { ...bone.transform, x: -200 } }
				: bone)
		});
		const poseResult = evaluatePose(project, clipId, 0);

		if (!poseResult.pose) {
			throw new Error('The fixture clip should produce a pose.');
		}

		const warnings = canvasWarningsForPose(project, poseResult.pose);
		const imageWarning = warnings.find(({ attachmentId }) => attachmentId === fixtureIds.image);

		expect(imageWarning).toMatchObject({ code: 'canvas-overflow', edges: ['left'] });
	});
});
