import { describe, expect, test } from 'bun:test';
import {
	addAttachmentKey,
	addBooleanKey,
	addDrawOrderKey,
	addEvent,
	addNumberKey,
	createClip,
	createTrack,
	setNumberKeyInterpolation
} from '../../src/domain/animation.ts';
import type { Clip, Project, Track } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import {
	buildGroupedTimelineRows,
	createTimelineClipboard,
	planKeyDrag,
	planPasteTimelineClipboard,
	selectableTimelineKeysForRows
} from '../../src/app/timeline-model.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const ids = {
	clip: '123e4567-e89b-42d3-a456-426614174060',
	rootTrack: '123e4567-e89b-42d3-a456-426614174061',
	rootYTrack: '123e4567-e89b-42d3-a456-426614174062',
	childTrack: '123e4567-e89b-42d3-a456-426614174063',
	slotTrack: '123e4567-e89b-42d3-a456-426614174064',
	imageTrack: '123e4567-e89b-42d3-a456-426614174065',
	pointTrack: '123e4567-e89b-42d3-a456-426614174066',
	rectangleSizeTrack: '123e4567-e89b-42d3-a456-426614174067',
	rectangleEnabledTrack: '123e4567-e89b-42d3-a456-426614174068',
	drawOrderTrack: '123e4567-e89b-42d3-a456-426614174069',
	rootKey: '123e4567-e89b-42d3-a456-42661417406a',
	rootSecondKey: '123e4567-e89b-42d3-a456-42661417406b',
	childKey: '123e4567-e89b-42d3-a456-42661417406c',
	slotKey: '123e4567-e89b-42d3-a456-42661417406d',
	imageKey: '123e4567-e89b-42d3-a456-42661417406e',
	pointKey: '123e4567-e89b-42d3-a456-42661417406f',
	rectangleSizeKey: '123e4567-e89b-42d3-a456-426614174070',
	rectangleEnabledKey: '123e4567-e89b-42d3-a456-426614174071',
	drawOrderKey: '123e4567-e89b-42d3-a456-426614174072',
	event: '123e4567-e89b-42d3-a456-426614174073',
	missingKey: '123e4567-e89b-42d3-a456-426614174074'
} as const;

type TimelineFixture = Readonly<{
	project: Project;
	clip: Clip;
}>;

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const clipFromProject = function clipFromProject(project: Project): Clip {
	const clip = project.clips.find((candidate) => candidate.id === ids.clip);

	if (!clip) {
		throw new Error('The fixture clip is unavailable.');
	}

	return clip;
};

const trackFromClip = function trackFromClip(clip: Clip, trackId: string): Track {
	const track = clip.tracks.find((candidate) => candidate.id === trackId);

	if (!track) {
		throw new Error(`The fixture track ${trackId} is unavailable.`);
	}

	return track;
};

const timelineFixture = function timelineFixture(): TimelineFixture {
	const withClip = unwrap(createClip(createRigProject(), {
		name: 'walk',
		durationSeconds: 2,
		fps: 10
	}, () => ids.clip));
	const withRootTrack = unwrap(createTrack(withClip, ids.clip, {
		kind: 'bone-transform',
		targetId: fixtureIds.root,
		property: 'x'
	}, () => ids.rootTrack));
	const withRootKey = unwrap(addNumberKey(withRootTrack, ids.clip, ids.rootTrack, {
		timeSeconds: 0.2,
		value: 10
	}, () => ids.rootKey));
	const withRootSecondKey = unwrap(addNumberKey(withRootKey, ids.clip, ids.rootTrack, {
		timeSeconds: 0.6,
		value: 20
	}, () => ids.rootSecondKey));
	const withRootYTrack = unwrap(createTrack(withRootSecondKey, ids.clip, {
		kind: 'bone-transform',
		targetId: fixtureIds.root,
		property: 'y'
	}, () => ids.rootYTrack));
	const withChildTrack = unwrap(createTrack(withRootYTrack, ids.clip, {
		kind: 'bone-transform',
		targetId: fixtureIds.child,
		property: 'rotation'
	}, () => ids.childTrack));
	const withChildKey = unwrap(addNumberKey(withChildTrack, ids.clip, ids.childTrack, {
		timeSeconds: 0.4,
		value: 0.5
	}, () => ids.childKey));
	const withSlotTrack = unwrap(createTrack(withChildKey, ids.clip, {
		kind: 'slot-attachment',
		targetId: fixtureIds.slot
	}, () => ids.slotTrack));
	const withSlotKey = unwrap(addAttachmentKey(withSlotTrack, ids.clip, ids.slotTrack, {
		timeSeconds: 0.3,
		value: null
	}, () => ids.slotKey));
	const withImageTrack = unwrap(createTrack(withSlotKey, ids.clip, {
		kind: 'attachment-opacity',
		targetId: fixtureIds.image
	}, () => ids.imageTrack));
	const withImageKey = unwrap(addNumberKey(withImageTrack, ids.clip, ids.imageTrack, {
		timeSeconds: 0.1,
		value: 0.8
	}, () => ids.imageKey));
	const withPointTrack = unwrap(createTrack(withImageKey, ids.clip, {
		kind: 'point-enabled',
		targetId: fixtureIds.point
	}, () => ids.pointTrack));
	const withPointKey = unwrap(addBooleanKey(withPointTrack, ids.clip, ids.pointTrack, {
		timeSeconds: 0.5,
		value: false
	}, () => ids.pointKey));
	const withRectangleSizeTrack = unwrap(createTrack(withPointKey, ids.clip, {
		kind: 'rectangle-size',
		targetId: fixtureIds.rectangle,
		property: 'width'
	}, () => ids.rectangleSizeTrack));
	const withRectangleSizeKey = unwrap(addNumberKey(withRectangleSizeTrack, ids.clip, ids.rectangleSizeTrack, {
		timeSeconds: 0.7,
		value: 24
	}, () => ids.rectangleSizeKey));
	const withRectangleEnabledTrack = unwrap(createTrack(withRectangleSizeKey, ids.clip, {
		kind: 'rectangle-enabled',
		targetId: fixtureIds.rectangle
	}, () => ids.rectangleEnabledTrack));
	const withRectangleEnabledKey = unwrap(addBooleanKey(withRectangleEnabledTrack, ids.clip, ids.rectangleEnabledTrack, {
		timeSeconds: 0.8,
		value: true
	}, () => ids.rectangleEnabledKey));
	const withDrawOrderTrack = unwrap(createTrack(withRectangleEnabledKey, ids.clip, {
		kind: 'slot-draw-order'
	}, () => ids.drawOrderTrack));
	const withDrawOrderKey = unwrap(addDrawOrderKey(withDrawOrderTrack, ids.clip, ids.drawOrderTrack, {
		timeSeconds: 0.9,
		value: [fixtureIds.slot]
	}, () => ids.drawOrderKey));
	const project = unwrap(addEvent(withDrawOrderKey, ids.clip, {
		timeSeconds: 1.1,
		name: 'impact',
		payload: { damage: 4 }
	}, () => ids.event));

	return { project, clip: clipFromProject(project) };
};

describe('UX P1-16 grouped timeline model', () => {
	test('derives stable overview, entity, property, draw-order, and event rows', () => {
		const { project, clip } = timelineFixture();
		const options = {
			mode: 'all-keyed' as const,
			expandedIds: new Set([`entity:${fixtureIds.root}`])
		};
		const rows = buildGroupedTimelineRows(project, clip, options);
		const root = rows.find((row) => row.id === `entity:${fixtureIds.root}`);
		const rootProperty = rows.find((row) => row.id === `property:${ids.rootTrack}`);
		const drawOrder = rows.find((row) => row.kind === 'draw-order');
		const events = rows.find((row) => row.kind === 'events');

		expect(rows.find((row) => row.id === 'overview')).toMatchObject({
			depth: 0,
			keyed: true,
			subLabel: '8 tracks'
		});
		expect(root).toMatchObject({
			kind: 'entity',
			depth: 0,
			entityId: fixtureIds.root,
			expandable: true,
			expanded: true,
			keyed: true,
			keys: [{ id: ids.rootKey, frameIndex: 2 }, { id: ids.rootSecondKey, frameIndex: 6 }]
		});
		expect(rootProperty).toMatchObject({
			kind: 'property',
			depth: 1,
			trackId: ids.rootTrack,
			entityId: fixtureIds.root,
			keys: [{ id: ids.rootKey, frameIndex: 2 }, { id: ids.rootSecondKey, frameIndex: 6 }]
		});
		expect(rows.some((row) => row.id === `property:${ids.rootYTrack}`)).toBe(false);
		expect(drawOrder).toMatchObject({
			id: 'draw-order',
			depth: 0,
			keyed: true,
			keys: [{ id: ids.drawOrderKey, frameIndex: 9 }]
		});
		expect(events).toMatchObject({
			id: 'events',
			depth: 0,
			keyed: true,
			subLabel: '1 event',
			keys: [{ id: ids.event, frameIndex: 11 }]
		});

		const reorderedRows = buildGroupedTimelineRows(project, {
			...clip,
			tracks: clip.tracks.toReversed()
		}, options);

		expect(reorderedRows.map((row) => row.id)).toEqual(rows.map((row) => row.id));
	});

	test('classifies aggregate markers by key type and interpolation', () => {
		const { project, clip } = timelineFixture();
		const steppedProject = unwrap(setNumberKeyInterpolation(project, clip.id, ids.rootTrack, ids.rootKey, { interpolation: 'stepped' }));
		const classifiedProject = unwrap(setNumberKeyInterpolation(steppedProject, clip.id, ids.rootTrack, ids.rootSecondKey, { interpolation: 'bezier' }));
		const classifiedClip = clipFromProject(classifiedProject);
		const rows = buildGroupedTimelineRows(classifiedProject, classifiedClip, {
			mode: 'all-keyed',
			expandedIds: new Set()
		});
		const rootProperty = rows.find((row) => row.id === `property:${ids.rootTrack}`);
		const drawOrder = rows.find((row) => row.kind === 'draw-order');
		const events = rows.find((row) => row.kind === 'events');
		const enabled = rows.find((row) => row.id === `property:${ids.pointTrack}`);
		const attachment = rows.find((row) => row.id === `property:${ids.slotTrack}`);

		expect(rootProperty?.keys).toMatchObject([
			{ id: ids.rootKey, trackId: ids.rootTrack, markerKind: 'continuous-stepped' },
			{ id: ids.rootSecondKey, trackId: ids.rootTrack, markerKind: 'continuous-bezier' }
		]);
		expect(enabled?.keys[0]?.markerKind).toBe('enabled');
		expect(attachment?.keys[0]?.markerKind).toBe('attachment');
		expect(drawOrder?.keys[0]?.markerKind).toBe('draw-order');
		expect(events?.keys[0]?.markerKind).toBe('event');
	});

	test('exposes copyable property and draw-order keys while excluding event markers', () => {
		const { project, clip } = timelineFixture();
		const rows = buildGroupedTimelineRows(project, clip, { mode: 'all-keyed' });
		const selected = selectableTimelineKeysForRows(rows);

		expect(selected).toHaveLength(9);
		expect(selected).toContainEqual({ trackId: ids.drawOrderTrack, keyId: ids.drawOrderKey, frameIndex: 9 });
		expect(selected.some((key) => key.keyId === ids.event)).toBe(false);
	});

	test('supports selected entities, selected tracks, filtering, and safe malformed targets', () => {
		const { project, clip } = timelineFixture();
		const selectedRows = buildGroupedTimelineRows(project, clip, {
			mode: 'selection',
			selection: [{ kind: 'bone', id: fixtureIds.root }],
			selectedTrackIds: new Set([ids.rootYTrack])
		});
		const selectedRoot = selectedRows.find((row) => row.id === `entity:${fixtureIds.root}`);
		const selectedY = selectedRows.find((row) => row.id === `property:${ids.rootYTrack}`);

		expect(selectedRoot?.selected).toBe(true);
		expect(selectedY?.selected).toBe(true);
		expect(selectedRows.some((row) => row.id === `entity:${fixtureIds.child}`)).toBe(false);
		expect(selectedRows.some((row) => row.kind === 'draw-order')).toBe(true);
		expect(selectedRows.some((row) => row.kind === 'events')).toBe(true);

		const filteredRows = buildGroupedTimelineRows(project, clip, {
			mode: 'all-keyed',
			filter: 'opacity',
			expandedIds: new Set()
		});
		const filteredGroup = filteredRows.find((row) => row.id === `entity:${fixtureIds.image}`);
		const filteredProperty = filteredRows.find((row) => row.id === `property:${ids.imageTrack}`);

		expect(filteredGroup).toMatchObject({ expanded: true, entityId: fixtureIds.image });
		expect(filteredProperty).toMatchObject({ depth: 1, trackId: ids.imageTrack });
		expect(filteredRows.some((row) => row.id === `entity:${fixtureIds.root}`)).toBe(false);

		const rootTrack = trackFromClip(clip, ids.rootTrack);
		const malformedClip: Clip = {
			...clip,
			tracks: clip.tracks.map((track) => track.id === rootTrack.id
				? { ...track, targetId: fixtureIds.asset }
				: track)
		};
		const malformedProject: Project = {
			...project,
			clips: project.clips.map((candidate) => candidate.id === clip.id ? malformedClip : candidate)
		};
		const malformedRows = buildGroupedTimelineRows(malformedProject, malformedClip, { mode: 'all-keyed' });
		const malformedGroup = malformedRows.find((row) => row.id === `entity:${fixtureIds.asset}`);

		expect(malformedGroup).toBeUndefined();
	});
});

describe('UX P1-19 pure key-drag planning', () => {
	test('converts pointer movement to whole-frame immutable retime inputs', () => {
		const { clip } = timelineFixture();
		const before = structuredClone(clip);
		const plan = planKeyDrag(clip, [{ trackId: ids.rootTrack, keyId: ids.rootKey }], 25, 10);

		expect(plan).toEqual({
			ok: true,
			value: {
				deltaFrames: 3,
				changes: [{ trackId: ids.rootTrack, keyId: ids.rootKey, timeSeconds: 0.5 }]
			}
		});
		expect(clip).toEqual(before);

		const noOp = planKeyDrag(clip, [{ trackId: ids.rootTrack, keyId: ids.rootKey }], 4, 10);

		expect(noOp).toEqual({ ok: true, value: { deltaFrames: 0, changes: [] } });
	});

	test('supports negative and multi-track movement while clamping the entire selection', () => {
		const { clip } = timelineFixture();
		const selectedKeys = [
			{ trackId: ids.rootTrack, keyId: ids.rootKey },
			{ trackId: ids.childTrack, keyId: ids.childKey }
		] as const;
		const positive = planKeyDrag(clip, selectedKeys, 1000, 10);
		const negative = planKeyDrag(clip, selectedKeys, -1000, 10);

		expect(positive).toEqual({
			ok: true,
			value: {
				deltaFrames: 15,
				changes: [
					{ trackId: ids.rootTrack, keyId: ids.rootKey, timeSeconds: 1.7 },
					{ trackId: ids.childTrack, keyId: ids.childKey, timeSeconds: 1.9 }
				]
			}
		});
		expect(negative).toEqual({
			ok: true,
			value: {
				deltaFrames: -2,
				changes: [
					{ trackId: ids.rootTrack, keyId: ids.rootKey, timeSeconds: 0 },
					{ trackId: ids.childTrack, keyId: ids.childKey, timeSeconds: 0.2 }
				]
			}
		});

		const smallNegative = planKeyDrag(clip, [{ trackId: ids.rootTrack, keyId: ids.rootSecondKey }], -30, 10);

		expect(smallNegative).toEqual({
			ok: true,
			value: {
				deltaFrames: -3,
				changes: [{ trackId: ids.rootTrack, keyId: ids.rootSecondKey, timeSeconds: 0.3 }]
			}
		});
	});

	test('rejects same-track collisions and invalid or stale selections atomically', () => {
		const { clip } = timelineFixture();
		const collision = planKeyDrag(clip, [{ trackId: ids.rootTrack, keyId: ids.rootKey }], 40, 10);
		const missing = planKeyDrag(clip, [{ trackId: ids.rootTrack, keyId: ids.missingKey }], 10, 10);
		const duplicate = planKeyDrag(clip, [
			{ trackId: ids.rootTrack, keyId: ids.rootKey },
			{ trackId: ids.rootTrack, keyId: ids.rootKey }
		], 10, 10);
		const rootTrack = trackFromClip(clip, ids.rootTrack);
		const malformedRootTrack: Track = rootTrack.kind === 'bone-transform'
			? {
				...rootTrack,
				keys: rootTrack.keys.map((key) => key.id === ids.rootKey
					? { ...key, timeSeconds: Number.NaN }
					: key)
			}
			: rootTrack;
		const malformedKeyClip: Clip = {
			...clip,
			tracks: clip.tracks.map((track) => track.id === ids.rootTrack ? malformedRootTrack : track)
		};
		const malformedKey = planKeyDrag(malformedKeyClip, [{ trackId: ids.rootTrack, keyId: ids.rootSecondKey }], 10, 10);
		const malformedTiming = planKeyDrag({ ...clip, fps: 0 }, [{ trackId: ids.rootTrack, keyId: ids.rootKey }], 10, 10);
		const nonfinitePointer = planKeyDrag(clip, [{ trackId: ids.rootTrack, keyId: ids.rootKey }], Number.POSITIVE_INFINITY, 10);

		expect(collision).toMatchObject({ ok: false });
		expect(missing).toMatchObject({ ok: false });
		expect(duplicate).toMatchObject({ ok: false });
		expect(malformedKey).toMatchObject({ ok: false });
		expect(malformedTiming).toMatchObject({ ok: false });
		expect(nonfinitePointer).toMatchObject({ ok: false });
	});

	test('validates typed clipboard data and fresh IDs before producing paste commands', () => {
		const { project, clip } = timelineFixture();
		const copied = createTimelineClipboard(clip, [
			{ trackId: ids.rootTrack, keyId: ids.rootKey },
			{ trackId: ids.rootTrack, keyId: ids.rootSecondKey }
		]);

		if (!copied.ok) {
			throw new Error(copied.error);
		}

		const invalid = {
			...copied.value,
			keys: copied.value.keys.map((key, index) => index === 1 ? { ...key, value: Number.NaN } : key)
		};
		const invalidResult = planPasteTimelineClipboard(clip, invalid, 0, () => ids.missingKey, project);
		const collidingIdResult = planPasteTimelineClipboard(clip, copied.value, 12, () => ids.rootKey, project);

		expect(invalidResult).toEqual({ ok: false, error: 'The key clipboard contains invalid typed data.' });
		expect(collidingIdResult).toEqual({ ok: false, error: 'Paste could not allocate unique key IDs.' });
	});
});
