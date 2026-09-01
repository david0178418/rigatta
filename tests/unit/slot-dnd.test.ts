import { describe, expect, test } from 'bun:test';
import { reduceProject } from '../../src/domain/commands.ts';
import { slotDropCommands, slotDropZoneForClientY } from '../../src/app/slot-dnd.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import type { Project } from '../../src/domain/model.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

describe('slot draw-order drag and drop', () => {
	test('creates a reorder command at the requested side of the target', () => {
		const project = createRigProject();

		expect(slotDropCommands(project, fixtureIds.slot, fixtureIds.slot, 'after')).toEqual([]);
		expect(slotDropCommands(project, fixtureIds.slot, fixtureIds.rectangle, 'before')).toBeUndefined();

		const secondSlotId = '123e4567-e89b-42d3-a456-42661417400c';
		const projectWithSecondSlot: Project = {
			...project,
			slots: [...project.slots, { id: secondSlotId, name: 'second', boneId: fixtureIds.root, setupAttachmentId: null }],
			setupDrawOrder: [fixtureIds.slot, secondSlotId]
		};
		const commands = slotDropCommands(projectWithSecondSlot, fixtureIds.slot, secondSlotId, 'after');

		expect(commands).toEqual([{ kind: 'reorder-slot', slotId: fixtureIds.slot, targetIndex: 1 }]);

		if (!commands) {
			throw new Error('A valid slot drop did not create a command.');
		}

		const result = commands.reduce<OperationResult<Project>>(
			(current, command) => current.ok ? reduceProject(current.value, command) : current,
			{ ok: true, value: projectWithSecondSlot }
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.setupDrawOrder).toEqual([secondSlotId, fixtureIds.slot]);
		}
	});

	test('maps row halves to before and after zones', () => {
		expect(slotDropZoneForClientY(100, 40, 105)).toBe('before');
		expect(slotDropZoneForClientY(100, 40, 125)).toBe('after');
	});
});
