import { describe, expect, test } from 'bun:test';
import { reduceProject } from '../../src/domain/commands.ts';
import { boneDropCommands, dropZoneForClientY } from '../../src/app/hierarchy-dnd.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import type { Project } from '../../src/domain/model.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

describe('hierarchy drag and drop', () => {
	test('creates a preserving reparent followed by sibling placement', () => {
		const project = createRigProject();
		const commands = boneDropCommands(project, fixtureIds.child, fixtureIds.parentB, 'inside');

		expect(commands).toEqual([
			{ kind: 'reparent-bone-preserving-world', boneId: fixtureIds.child, parentId: fixtureIds.parentB },
			{ kind: 'reorder-bone', boneId: fixtureIds.child, targetSiblingIndex: 0 }
		]);

		if (!commands) {
			throw new Error('A valid bone drop did not create commands.');
		}

		const result = commands.reduce<OperationResult<Project>>(
			(current, command) => current.ok ? reduceProject(current.value, command) : current,
			{ ok: true, value: project }
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.bones.find((bone) => bone.id === fixtureIds.child)?.parentId).toBe(fixtureIds.parentB);
		}
	});

	test('rejects self and descendant drops without commands', () => {
		const project = createRigProject();

		expect(boneDropCommands(project, fixtureIds.root, fixtureIds.child, 'inside')).toBeUndefined();
		expect(boneDropCommands(project, fixtureIds.child, fixtureIds.child, 'after')).toBeUndefined();
	});

	test('maps row thirds to before, inside, and after zones', () => {
		expect(dropZoneForClientY(100, 40, 105)).toBe('before');
		expect(dropZoneForClientY(100, 40, 120)).toBe('inside');
		expect(dropZoneForClientY(100, 40, 135)).toBe('after');
	});
});
