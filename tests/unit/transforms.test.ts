import { describe, expect, test } from 'bun:test';
import { fixtureIds, createRigProject } from '../fixtures.ts';
import {
	evaluateBoneWorldMatrices,
	localPointForBone,
	preserveWorldPoseOnReparent,
	worldPointForBone
} from '../../src/domain/transforms.ts';

describe('hierarchy transforms', () => {
	test('evaluates world matrices and converts points in both directions', () => {
		const evaluation = evaluateBoneWorldMatrices(createRigProject());
		const localPoint = { x: 4, y: -2 };
		const worldPoint = worldPointForBone(evaluation, fixtureIds.child, localPoint);
		const recovered = worldPoint ? localPointForBone(evaluation, fixtureIds.child, worldPoint) : undefined;

		expect(evaluation.diagnostics).toEqual([]);
		expect(worldPoint).toBeDefined();
		expect(recovered?.x).toBeCloseTo(localPoint.x, 9);
		expect(recovered?.y).toBeCloseTo(localPoint.y, 9);
	});

	test('preserves a child world pose when changing parents', () => {
		const project = createRigProject();
		const before = evaluateBoneWorldMatrices(project).matrices.get(fixtureIds.child);
		const result = preserveWorldPoseOnReparent(project, fixtureIds.child, fixtureIds.parentB);

		expect(result.ok).toBe(true);
		if (!result.ok || !before) {
			return;
		}

		const after = evaluateBoneWorldMatrices(result.value).matrices.get(fixtureIds.child);

		expect(after?.a).toBeCloseTo(before.a, 9);
		expect(after?.b).toBeCloseTo(before.b, 9);
		expect(after?.c).toBeCloseTo(before.c, 9);
		expect(after?.d).toBeCloseTo(before.d, 9);
		expect(after?.tx).toBeCloseTo(before.tx, 9);
		expect(after?.ty).toBeCloseTo(before.ty, 9);
		expect(result.value.bones.find((bone) => bone.id === fixtureIds.child)?.parentId).toBe(fixtureIds.parentB);
	});

	test('reports invalid reparenting without changing the project', () => {
		const project = createRigProject();
		const result = preserveWorldPoseOnReparent(project, fixtureIds.root, fixtureIds.child);

		expect(result).toMatchObject({ ok: false, error: { code: 'hierarchy-cycle' } });
		expect(project.bones.find((bone) => bone.id === fixtureIds.root)?.parentId).toBeNull();
	});
});
