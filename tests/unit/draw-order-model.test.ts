import { describe, expect, test } from 'bun:test';
import type { Clip, Project } from '../../src/domain/model.ts';
import { drawOrderViewForFrame, completeDrawOrder, reorderDrawOrder } from '../../src/app/draw-order-model.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const secondSlotId = '123e4567-e89b-42d3-a456-42661417400c';
const clipId = '123e4567-e89b-42d3-a456-42661417400d';
const trackId = '123e4567-e89b-42d3-a456-42661417400e';
const firstKeyId = '123e4567-e89b-42d3-a456-42661417400f';
const secondKeyId = '123e4567-e89b-42d3-a456-426614174010';

const projectWithTwoSlots = function projectWithTwoSlots(): Project {
	const project = createRigProject();

	return {
		...project,
		slots: [...project.slots, { id: secondSlotId, name: 'second', boneId: fixtureIds.root, setupAttachmentId: null }],
		setupDrawOrder: [fixtureIds.slot, secondSlotId]
	};
};

const clipWithDrawOrderKeys = function clipWithDrawOrderKeys(): Clip {
	return {
		id: clipId,
		name: 'motion',
		durationSeconds: 2,
		fps: 24,
		loop: false,
		tracks: [{
			id: trackId,
			kind: 'slot-draw-order',
			keys: [
				{ id: firstKeyId, timeSeconds: 1 / 24, value: [secondSlotId, fixtureIds.slot] },
				{ id: secondKeyId, timeSeconds: 5 / 24, value: [fixtureIds.slot, secondSlotId] }
			]
		}],
		events: []
	};
};

describe('draw-order presentation model', () => {
	test('uses setup order before the first keyed frame', () => {
		const project = projectWithTwoSlots();
		const view = drawOrderViewForFrame(project, clipWithDrawOrderKeys(), 0);

		expect(view.source).toBe('setup');
		expect(view.order).toEqual([fixtureIds.slot, secondSlotId]);
		expect(view.keyId).toBeUndefined();
	});

	test('uses the preceding keyed override throughout the interval until the next key', () => {
		const project = projectWithTwoSlots();
		const view = drawOrderViewForFrame(project, clipWithDrawOrderKeys(), 2);

		expect(view.source).toBe('keyed');
		expect(view.keyId).toBe(firstKeyId);
		expect(view.keyFrameIndex).toBe(1);
		expect(view.order).toEqual([secondSlotId, fixtureIds.slot]);
	});

	test('switches to the next keyed override at its evaluated frame', () => {
		const project = projectWithTwoSlots();
		const view = drawOrderViewForFrame(project, clipWithDrawOrderKeys(), 5);

		expect(view.source).toBe('keyed');
		expect(view.keyId).toBe(secondKeyId);
		expect(view.keyFrameIndex).toBe(5);
		expect(view.order).toEqual([fixtureIds.slot, secondSlotId]);
	});

	test('returns every project slot even when imported order data is incomplete', () => {
		const project = projectWithTwoSlots();

		expect(completeDrawOrder(project, [secondSlotId, secondSlotId])).toEqual([secondSlotId, fixtureIds.slot]);
	});

	test('reorders a known slot without mutating the source order', () => {
		const order = [fixtureIds.slot, secondSlotId] as const;

		expect(reorderDrawOrder(order, fixtureIds.slot, 1)).toEqual([secondSlotId, fixtureIds.slot]);
		expect(order).toEqual([fixtureIds.slot, secondSlotId]);
		expect(reorderDrawOrder(order, 'missing-slot', 0)).toBe(order);
	});
});
