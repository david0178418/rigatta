import { describe, expect, test } from 'bun:test';
import { dispatchCommand } from '../../src/domain/history.ts';
import { beginTransaction, commitTransaction, createHistory, currentProject, undo } from '../../src/domain/history.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import type { HistoryState } from '../../src/domain/history.ts';
import type { ProjectCommand } from '../../src/domain/commands.ts';
import { DEFAULT_LOCAL_TRANSFORM } from '../../src/domain/coordinates.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

describe('setup mutation history', () => {
	test('groups multiple setup commands into one undo entry', () => {
		const project = createRigProject();
		const commands: readonly ProjectCommand[] = [
			{
				kind: 'update-bone-transform',
				boneId: fixtureIds.root,
				transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 140, y: 75 }
			},
			{
				kind: 'update-attachment-transform',
				attachmentId: fixtureIds.image,
				transform: { ...DEFAULT_LOCAL_TRANSFORM, x: 20, y: 10 }
			}
		];
		const result = commands.reduce<OperationResult<HistoryState>>(
			(current, command) => current.ok ? dispatchCommand(current.value, command) : current,
			{ ok: true, value: beginTransaction(createHistory(project)) }
		);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}

		const committed = commitTransaction(result.value);
		const nextProject = currentProject(committed);

		expect(committed.past).toHaveLength(1);
		expect(nextProject.bones.find((bone) => bone.id === fixtureIds.root)?.transform.x).toBe(140);
		expect(nextProject.attachments.find((attachment) => attachment.id === fixtureIds.image)?.transform.x).toBe(20);
		expect(currentProject(undo(committed))).toEqual(project);
	});
});
