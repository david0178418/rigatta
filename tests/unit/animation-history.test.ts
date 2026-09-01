import { describe, expect, test } from 'bun:test';
import {
	beginTransaction,
	commitTransaction,
	createHistory,
	currentProject,
	dispatchCommand,
	undo,
	type HistoryState
} from '../../src/domain/history.ts';
import type { ProjectCommand } from '../../src/domain/commands.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174010';
const trackId = '123e4567-e89b-42d3-a456-426614174011';
const firstKeyId = '123e4567-e89b-42d3-a456-426614174012';
const secondKeyId = '123e4567-e89b-42d3-a456-426614174013';

const dispatch = function dispatch(
	history: HistoryState,
	command: ProjectCommand
): HistoryState {
	const result = dispatchCommand(history, command);

	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const animationHistory = function animationHistory(): HistoryState {
	const project = createRigProject();
	const withClip = dispatch(createHistory(project), {
		kind: 'create-clip',
		id: clipId,
		input: { name: 'walk' }
	});
	const withTrack = dispatch(withClip, {
		kind: 'create-track',
		id: trackId,
		clipId,
		definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'x' }
	});
	const withFirstKey = dispatch(withTrack, {
		kind: 'add-number-key',
		id: firstKeyId,
		clipId,
		trackId,
		input: { timeSeconds: 0, value: 0 }
	});

	return dispatch(withFirstKey, {
		kind: 'add-number-key',
		id: secondKeyId,
		clipId,
		trackId,
		input: { timeSeconds: 0.5, value: 20 }
	});
};

describe('animation mutation history', () => {
	test('groups deleting multiple selected keys into one undo entry', () => {
		const history = animationHistory();
		const commands: readonly ProjectCommand[] = [firstKeyId, secondKeyId].map((keyId) => ({
			kind: 'delete-key',
			clipId,
			trackId,
			keyId
		}));
		const result = commands.reduce<OperationResult<HistoryState>>(
			(current, command) => current.ok ? dispatchCommand(current.value, command) : current,
			{ ok: true, value: beginTransaction(history) }
		);

		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}

		const committed = commitTransaction(result.value);

		expect(committed.past).toHaveLength(history.past.length + 1);
		expect(currentProject(committed).clips[0]?.tracks[0]?.keys).toHaveLength(0);
		expect(currentProject(undo(committed))).toEqual(currentProject(history));
	});
});
