import { describe, expect, test } from 'bun:test';
import {
	addEvent,
	createClip,
	deleteEvent,
	moveEvent,
	updateEvent
} from '../../src/domain/animation.ts';
import type { Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createRigProject } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174050';
const firstEventId = '123e4567-e89b-42d3-a456-426614174051';
const secondEventId = '123e4567-e89b-42d3-a456-426614174052';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const projectWithClip = function projectWithClip(): Project {
	return unwrap(createClip(createRigProject(), { name: 'walk' }, () => clipId));
};

describe('event key operations', () => {
	test('adds, edits, moves, and deletes immutable sorted event keys', () => {
		const project = projectWithClip();
		const withFirst = unwrap(addEvent(project, clipId, {
			timeSeconds: 0.75,
			name: '  launch  ',
			payload: { projectile: 'bolt', origin: { x: 12, y: 8 } }
		}, () => firstEventId));
		const withSecond = unwrap(addEvent(withFirst, clipId, {
			timeSeconds: 0.25,
			name: 'impact',
			payload: {}
		}, () => secondEventId));
		const updated = unwrap(updateEvent(withSecond, clipId, secondEventId, {
			name: '  hit  ',
			payload: { damage: 4 }
		}));
		const moved = unwrap(moveEvent(updated, clipId, secondEventId, 1));
		const deleted = unwrap(deleteEvent(moved, clipId, firstEventId));

		expect(project.clips[0]?.events).toEqual([]);
		expect(withSecond.clips[0]?.events.map((event) => event.id)).toEqual([secondEventId, firstEventId]);
		expect(updated.clips[0]?.events[0]).toMatchObject({ id: secondEventId, name: 'hit', payload: { damage: 4 } });
		expect(moved.clips[0]?.events.map((event) => event.id)).toEqual([firstEventId, secondEventId]);
		expect(deleted.clips[0]?.events.map((event) => event.id)).toEqual([secondEventId]);
	});

	test('rejects invalid event values without changing the source project', () => {
		const project = projectWithClip();
		const invalidName = addEvent(project, clipId, { timeSeconds: 0, name: ' ', payload: {} }, () => firstEventId);
		const invalidPayload = addEvent(project, clipId, { timeSeconds: 0, name: 'bad', payload: { value: Number.NaN } }, () => firstEventId);
		const invalidTime = addEvent(project, clipId, { timeSeconds: 2, name: 'late', payload: {} }, () => firstEventId);

		expect(invalidName).toMatchObject({ ok: false, error: { code: 'invalid-name' } });
		expect(invalidPayload).toMatchObject({ ok: false, error: { code: 'invalid-value' } });
		expect(invalidTime).toMatchObject({ ok: false, error: { code: 'invalid-value' } });
		expect(project.clips[0]?.events).toEqual([]);
	});
});
