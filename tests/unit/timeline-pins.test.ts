import { describe, expect, test } from 'bun:test';
import { addNumberKey, createClip, createTrack } from '../../src/domain/animation.ts';
import type { Clip, Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import {
	buildGroupedTimelineRows,
	selectableEntityForTimelineRow,
	timelineEntityIdsForProject,
	validPinnedTimelineEntityIds
} from '../../src/app/timeline-model.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const ids = {
	clip: '123e4567-e89b-42d3-a456-426614174120',
	rootTrack: '123e4567-e89b-42d3-a456-426614174121',
	childTrack: '123e4567-e89b-42d3-a456-426614174122',
	rootKey: '123e4567-e89b-42d3-a456-426614174123',
	childKey: '123e4567-e89b-42d3-a456-426614174124',
	stale: '123e4567-e89b-42d3-a456-426614174125'
} as const;

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

type TimelineFixture = Readonly<{
	project: Project;
	clip: Clip;
}>;

const timelineFixture = function timelineFixture(): TimelineFixture {
	const withClip = unwrap(createClip(createRigProject(), {
		name: 'walk',
		durationSeconds: 1,
		fps: 10
	}, () => ids.clip));
	const withRootTrack = unwrap(createTrack(withClip, ids.clip, {
		kind: 'bone-transform',
		targetId: fixtureIds.root,
		property: 'x'
	}, () => ids.rootTrack));
	const withRootKey = unwrap(addNumberKey(withRootTrack, ids.clip, ids.rootTrack, {
		timeSeconds: 0,
		value: 10
	}, () => ids.rootKey));
	const withChildTrack = unwrap(createTrack(withRootKey, ids.clip, {
		kind: 'bone-transform',
		targetId: fixtureIds.child,
		property: 'rotation'
	}, () => ids.childTrack));
	const project = unwrap(addNumberKey(withChildTrack, ids.clip, ids.childTrack, {
		timeSeconds: 0.5,
		value: 0.5
	}, () => ids.childKey));
	const clip = project.clips.find((candidate) => candidate.id === ids.clip);

	if (!clip) {
		throw new Error('The timeline fixture clip is unavailable.');
	}

	return { project, clip };
};

describe('UX P2-22 pinned timeline rows', () => {
	test('keeps pinned entity groups visible and synchronized as selection changes', () => {
		const { project, clip } = timelineFixture();
		const pinnedEntityIds = new Set([fixtureIds.root]);
		const childSelection = [{ kind: 'bone' as const, id: fixtureIds.child }];
		const rootSelection = [{ kind: 'bone' as const, id: fixtureIds.root }];
		const childSelectedRows = buildGroupedTimelineRows(project, clip, {
			mode: 'selection',
			selection: childSelection,
			pinnedEntityIds
		});
		const rootPinnedRow = childSelectedRows.find((row) => row.id === `entity:${fixtureIds.root}`);
		const childSelectedRow = childSelectedRows.find((row) => row.id === `entity:${fixtureIds.child}`);

		expect(rootPinnedRow).toMatchObject({ entityId: fixtureIds.root, selected: false });
		expect(childSelectedRow).toMatchObject({ entityId: fixtureIds.child, selected: true });
		expect(rootPinnedRow ? selectableEntityForTimelineRow(project, rootPinnedRow) : undefined).toEqual({ kind: 'bone', id: fixtureIds.root });

		const rootSelectedRows = buildGroupedTimelineRows(project, clip, {
			mode: 'selection',
			selection: rootSelection,
			pinnedEntityIds
		});

		expect(rootSelectedRows.find((row) => row.id === `entity:${fixtureIds.root}`)).toMatchObject({ selected: true });
		expect(rootSelectedRows.some((row) => row.id === `entity:${fixtureIds.child}`)).toBe(false);

		const unpinnedRows = buildGroupedTimelineRows(project, clip, {
			mode: 'selection',
			selection: rootSelection,
			pinnedEntityIds: new Set()
		});

		expect(unpinnedRows.some((row) => row.id === `entity:${fixtureIds.root}`)).toBe(true);
		expect(unpinnedRows.some((row) => row.id === `entity:${fixtureIds.child}`)).toBe(false);
	});

	test('filters removed and non-timeline targets before rendering pinned groups', () => {
		const { project, clip } = timelineFixture();
		const pinnedEntityIds = validPinnedTimelineEntityIds(project, new Set([fixtureIds.root, fixtureIds.asset, ids.stale]));

		expect([...pinnedEntityIds]).toEqual([fixtureIds.root]);
		expect(timelineEntityIdsForProject(project)).not.toContain(fixtureIds.asset);

		const staleClip: Clip = {
			...clip,
			tracks: clip.tracks.map((track) => track.id === ids.rootTrack
				? { ...track, targetId: ids.stale }
				: track)
		};
		const staleProject: Project = { ...project, clips: [staleClip] };
		const rows = buildGroupedTimelineRows(staleProject, staleClip, {
			mode: 'selection',
			pinnedEntityIds: new Set([ids.stale])
		});

		expect(rows.some((row) => row.id === `entity:${ids.stale}`)).toBe(false);
	});
});
