import { describe, expect, test } from 'bun:test';
import { addNumberKey, createClip, createTrack } from '../../src/domain/animation.ts';
import type { Clip, Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import {
	buildGroupedTimelineRows,
	effectiveTimelineEntityIds,
	resolveEffectiveTimelineRows,
	selectedTimelineEntityIdsForProject
} from '../../src/app/timeline-model.ts';
import { defaultProjectUiPreferences, parseUiPreferences, UI_PREFERENCES_VERSION } from '../../src/app/ui-preferences.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const ids = {
	clip: '123e4567-e89b-42d3-a456-426614174130',
	rootTrack: '123e4567-e89b-42d3-a456-426614174131',
	childTrack: '123e4567-e89b-42d3-a456-426614174132',
	malformedTrack: '123e4567-e89b-42d3-a456-426614174133',
	rootKey: '123e4567-e89b-42d3-a456-426614174134',
	malformedKey: '123e4567-e89b-42d3-a456-426614174135',
	stale: '123e4567-e89b-42d3-a456-426614174136'
} as const;

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const clipFor = function clipFor(project: Project): Clip {
	const clip = project.clips.find((candidate) => candidate.id === ids.clip);

	if (!clip) {
		throw new Error('The adaptive timeline fixture clip is unavailable.');
	}

	return clip;
};

const adaptiveTimelineFixture = function adaptiveTimelineFixture(): Readonly<{ project: Project; clip: Clip }> {
	const withClip = unwrap(createClip(createRigProject(), { name: 'walk', durationSeconds: 1, fps: 10 }, () => ids.clip));
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
	const malformedTrack = {
		id: ids.malformedTrack,
		kind: 'bone-transform' as const,
		targetId: fixtureIds.asset,
		property: 'x' as const,
		keys: [{ id: ids.malformedKey, timeSeconds: 0, value: 4, interpolation: 'linear' as const, curve: null }]
	};
	const project: Project = {
		...withChildTrack,
		clips: withChildTrack.clips.map((clip) => clip.id === ids.clip
			? { ...clip, tracks: [...clip.tracks, malformedTrack] }
			: clip)
	};

	return { project, clip: clipFor(project) };
};

describe('adaptive timeline row resolution', () => {
	test('falls back to keyed entity rows for no, asset-only, and stale selection', () => {
		const { project, clip } = adaptiveTimelineFixture();
		const noSelection = resolveEffectiveTimelineRows(project, clip, { mode: 'auto', selection: [] });
		const assetOnly = resolveEffectiveTimelineRows(project, clip, {
			mode: 'auto',
			selection: [{ kind: 'asset', id: fixtureIds.asset }]
		});
		const stale = resolveEffectiveTimelineRows(project, clip, {
			mode: 'auto',
			selection: [{ kind: 'bone', id: ids.stale }]
		});

		expect(noSelection.entityIds).toEqual([fixtureIds.root]);
		expect(noSelection.tracks.map((track) => track.id)).toEqual([ids.rootTrack]);
		expect(assetOnly.entityIds).toEqual(noSelection.entityIds);
		expect(stale.entityIds).toEqual(noSelection.entityIds);
		expect(noSelection.rows.some((row) => row.id === `entity:${fixtureIds.root}`)).toBe(true);
	});

	test('uses valid selected entities, augments them with pins, and keeps All keyed explicit', () => {
		const { project, clip } = adaptiveTimelineFixture();
		const selected = resolveEffectiveTimelineRows(project, clip, {
			mode: 'auto',
			selection: [
				{ kind: 'asset', id: fixtureIds.asset },
				{ kind: 'bone', id: fixtureIds.child }
			],
			pinnedEntityIds: new Set([fixtureIds.root, fixtureIds.asset, ids.stale])
		});
		const allKeyed = resolveEffectiveTimelineRows(project, clip, {
			mode: 'all-keyed',
			selection: [{ kind: 'bone', id: fixtureIds.child }],
			pinnedEntityIds: new Set([fixtureIds.root])
		});

		expect(selected.selectedEntityIds).toEqual([fixtureIds.child]);
		expect(selected.pinnedEntityIds).toEqual([fixtureIds.root]);
		expect(selected.entityIds).toEqual([fixtureIds.child, fixtureIds.root]);
		expect(selected.tracks.map((track) => track.id)).toEqual([ids.rootTrack, ids.childTrack]);
		expect(selected.keyedTrackCount).toBe(1);
		expect(allKeyed.entityIds).toEqual([fixtureIds.root]);
		expect(allKeyed.tracks.map((track) => track.id)).toEqual([ids.rootTrack]);
		expect(allKeyed.rows.some((row) => row.id === `entity:${fixtureIds.child}`)).toBe(false);
	});

	test('ignores malformed targets and reports zero keyed tracks without mutating inputs', () => {
		const { project, clip } = adaptiveTimelineFixture();
		const before = structuredClone(project);
		const malformedRows = buildGroupedTimelineRows(project, clip, { mode: 'all-keyed' });
		const emptyClip: Clip = { ...clip, tracks: clip.tracks.filter((track) => track.id === ids.childTrack) };
		const emptyProject: Project = { ...project, clips: project.clips.map((candidate) => candidate.id === clip.id ? emptyClip : candidate) };
		const empty = resolveEffectiveTimelineRows(emptyProject, emptyClip, { mode: 'auto', selection: [] });
		const selectedEmpty = resolveEffectiveTimelineRows(emptyProject, emptyClip, {
			mode: 'auto',
			selection: [{ kind: 'bone', id: fixtureIds.child }]
		});

		expect(malformedRows.some((row) => row.entityId === fixtureIds.asset)).toBe(false);
		expect(malformedRows.find((row) => row.id === 'overview')?.subLabel).toBe('1 track');
		expect(empty.trackCount).toBe(0);
		expect(empty.keyedTrackCount).toBe(0);
		expect(empty.entityIds).toEqual([]);
		expect(selectedEmpty.entityIds).toEqual([fixtureIds.child]);
		expect(selectedEmpty.trackCount).toBe(1);
		expect(project).toEqual(before);
	});

	test('filters selection IDs by their declared entity kind', () => {
		const { project } = adaptiveTimelineFixture();

		expect(selectedTimelineEntityIdsForProject(project, [
			{ kind: 'bone', id: fixtureIds.slot },
			{ kind: 'slot', id: fixtureIds.root },
			{ kind: 'attachment', id: fixtureIds.image },
			{ kind: 'asset', id: fixtureIds.asset }
		])).toEqual([fixtureIds.image]);
		expect(effectiveTimelineEntityIds(project, clipFor(project), { mode: 'auto', selection: [] })).toEqual([fixtureIds.root]);
	});
});

describe('timeline row preference migration', () => {
	test('defaults to Auto, migrates legacy Selection, preserves All keyed, and rejects unknown values', () => {
		const defaults = defaultProjectUiPreferences();
		const parsed = parseUiPreferences({
			version: UI_PREFERENCES_VERSION,
			globalDensity: 'list',
			projects: {
				[fixtureIds.project]: {
					timelineRowMode: 'selection'
				},
				'123e4567-e89b-42d3-a456-426614174099': {
					timelineRowMode: 'all-keyed'
				},
				'123e4567-e89b-42d3-a456-426614174098': {
					timelineRowMode: 'unsupported'
				}
			}
		});

		expect(defaults.timelineRowMode).toBe('auto');
		expect(parsed.projects[fixtureIds.project]?.timelineRowMode).toBe('auto');
		expect(parsed.projects['123e4567-e89b-42d3-a456-426614174099']?.timelineRowMode).toBe('all-keyed');
		expect(parsed.projects['123e4567-e89b-42d3-a456-426614174098']?.timelineRowMode).toBe('auto');
	});
});
