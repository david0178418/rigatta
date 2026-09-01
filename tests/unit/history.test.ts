import { describe, expect, test } from 'bun:test';
import {
	beginTransaction,
	canRedo,
	canUndo,
	cancelTransaction,
	commitTransaction,
	createHistory,
	currentProject,
	dispatchCommand,
	redo,
	undo,
	updateTransaction
} from '../../src/domain/history.ts';
import { createEmptyProject } from '../../src/domain/model.ts';
import type { ProjectCommand } from '../../src/domain/commands.ts';
import { fixtureIds } from '../fixtures.ts';

const firstProject = createEmptyProject({ id: fixtureIds.project, name: 'First' });
const secondNameCommand = { kind: 'rename-project', name: 'Second' } as const;
const thirdNameCommand = { kind: 'rename-project', name: 'Third' } as const;

const dispatch = function dispatch(
	history: ReturnType<typeof createHistory>,
	command: ProjectCommand
): ReturnType<typeof createHistory> {
	const result = dispatchCommand(history, command);

	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

describe('bounded command history', () => {
	test('reduces commands and moves immutable snapshots through undo and redo', () => {
		const first = createHistory(firstProject, 2);
		const second = dispatch(first, secondNameCommand);
		const third = dispatch(second, thirdNameCommand);

		expect(first.present.name).toBe('First');
		expect(third.present.name).toBe('Third');
		expect(canUndo(third)).toBe(true);
		const undone = undo(third);
		const redone = redo(undone);

		expect(undone.present.name).toBe('Second');
		expect(redone.present.name).toBe('Third');
		expect(canRedo(undone)).toBe(true);
	});

	test('bounds past snapshots and clears redo after a new command', () => {
		const first = createHistory(firstProject, 1);
		const second = dispatch(first, secondNameCommand);
		const third = dispatch(second, thirdNameCommand);
		const undone = undo(third);
		const changed = dispatch(undone, { kind: 'rename-project', name: 'Changed' });

		expect(third.past).toHaveLength(1);
		expect(undone.future).toHaveLength(1);
		expect(canRedo(changed)).toBe(false);
		expect(changed.present.name).toBe('Changed');
	});

	test('groups a continuous gesture into one undo entry', () => {
		const initial = createHistory(firstProject);
		const started = beginTransaction(initial);
		const firstDraft = { ...firstProject, name: 'Drag 1' };
		const secondDraft = { ...firstProject, name: 'Drag 2' };
		const updated = updateTransaction(started, firstDraft);
		const finished = commitTransaction(updateTransaction(updated, secondDraft));

		expect(currentProject(started).name).toBe('First');
		expect(currentProject(updated).name).toBe('Drag 1');
		expect(finished.present.name).toBe('Drag 2');
		expect(finished.past).toHaveLength(1);
		expect(undo(finished).present.name).toBe('First');
	});

	test('cancel restores the committed project and does not create history', () => {
		const initial = createHistory(firstProject);
		const started = beginTransaction(initial);
		const changed = updateTransaction(started, { ...firstProject, name: 'Uncommitted' });
		const cancelled = cancelTransaction(changed);

		expect(currentProject(cancelled).name).toBe('First');
		expect(cancelled.past).toHaveLength(0);
		expect(canUndo(cancelled)).toBe(false);
	});

	test('failed commands leave history unchanged', () => {
		const initial = createHistory(firstProject);
		const result = dispatchCommand(initial, { kind: 'rename-project', name: '   ' });

		expect(result).toMatchObject({ ok: false, error: { code: 'invalid-name' } });
		expect(result.ok ? result.value.present.name : initial.present.name).toBe('First');
		expect(initial.past).toHaveLength(0);
	});
});
