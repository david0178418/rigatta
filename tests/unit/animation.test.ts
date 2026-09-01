import { describe, expect, test } from 'bun:test';
import {
	addAttachmentKey,
	addBooleanKey,
	addDrawOrderKey,
	addNumberKey,
	copyKey,
	createClip,
	createTrack,
	deleteKey,
	deleteTrack,
	duplicateClip,
	moveKey,
	retimeKeys,
	setNumberKeyInterpolation,
	updateAttachmentKey,
	upsertNumberKey,
	updateClipPlayback
} from '../../src/domain/animation.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import type { Project } from '../../src/domain/model.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174010';
const boneTrackId = '123e4567-e89b-42d3-a456-426614174011';
const attachmentTrackId = '123e4567-e89b-42d3-a456-426614174012';
const opacityTrackId = '123e4567-e89b-42d3-a456-426614174013';
const pointTrackId = '123e4567-e89b-42d3-a456-426614174014';
const rectangleTrackId = '123e4567-e89b-42d3-a456-426614174015';
const enabledTrackId = '123e4567-e89b-42d3-a456-426614174016';
const drawOrderTrackId = '123e4567-e89b-42d3-a456-426614174017';
const keyIds = [
	'123e4567-e89b-42d3-a456-426614174018',
	'123e4567-e89b-42d3-a456-426614174019',
	'123e4567-e89b-42d3-a456-42661417401a',
	'123e4567-e89b-42d3-a456-42661417401b',
	'123e4567-e89b-42d3-a456-42661417401c',
	'123e4567-e89b-42d3-a456-42661417401d',
	'123e4567-e89b-42d3-a456-42661417401e',
	'123e4567-e89b-42d3-a456-42661417401f',
	'123e4567-e89b-42d3-a456-426614174020',
	'123e4567-e89b-42d3-a456-426614174021',
	'123e4567-e89b-42d3-a456-426614174022',
	'123e4567-e89b-42d3-a456-426614174023'
] as const;
const duplicateClipId = '123e4567-e89b-42d3-a456-426614174024';
const duplicateTrackId = '123e4567-e89b-42d3-a456-426614174025';
const duplicateKeyId = '123e4567-e89b-42d3-a456-426614174026';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};


const withClip = function withClip(): Project {
	return unwrap(createClip(createRigProject(), { name: 'walk' }, () => clipId));
};

describe('typed animation tracks', () => {
	test('creates clips and typed tracks with immutable key insertion', () => {
		const project = withClip();
		const withBoneTrack = unwrap(createTrack(project, clipId, {
			kind: 'bone-transform',
			targetId: fixtureIds.child,
			property: 'x'
		}, () => boneTrackId));
		const withFirstKey = unwrap(addNumberKey(withBoneTrack, clipId, boneTrackId, {
			timeSeconds: 1,
			value: 40
		}, () => keyIds[1]));
		const withSecondKey = unwrap(addNumberKey(withFirstKey, clipId, boneTrackId, {
			timeSeconds: 0,
			value: 10
		}, () => keyIds[0]));
		const clip = withSecondKey.clips[0];

		expect(clip?.tracks[0]?.keys.map((key) => key.timeSeconds)).toEqual([0, 1]);
		expect(addNumberKey(withSecondKey, clipId, boneTrackId, {
			timeSeconds: 1,
			value: 50
		}, () => keyIds[2])).toMatchObject({ ok: false, error: { code: 'invalid-value' } });
		expect(createTrack(withSecondKey, clipId, {
			kind: 'bone-transform',
			targetId: fixtureIds.child,
			property: 'x'
		}, () => keyIds[3])).toMatchObject({ ok: false, error: { code: 'invalid-value' } });
	});

	test('supports discrete attachment, visibility, rectangle, and draw-order tracks', () => {
		const project = withClip();
		const withAttachment = unwrap(createTrack(project, clipId, {
			kind: 'slot-attachment',
			targetId: fixtureIds.slot
		}, () => attachmentTrackId));
		const withOpacity = unwrap(createTrack(withAttachment, clipId, {
			kind: 'attachment-opacity',
			targetId: fixtureIds.image
		}, () => opacityTrackId));
		const withPoint = unwrap(createTrack(withOpacity, clipId, {
			kind: 'point-enabled',
			targetId: fixtureIds.point
		}, () => pointTrackId));
		const withRectangle = unwrap(createTrack(withPoint, clipId, {
			kind: 'rectangle-size',
			targetId: fixtureIds.rectangle,
			property: 'width'
		}, () => rectangleTrackId));
		const withEnabled = unwrap(createTrack(withRectangle, clipId, {
			kind: 'rectangle-enabled',
			targetId: fixtureIds.rectangle
		}, () => enabledTrackId));
		const withDrawOrder = unwrap(createTrack(withEnabled, clipId, {
			kind: 'slot-draw-order'
		}, () => drawOrderTrackId));
		const withAttachmentKey = unwrap(addAttachmentKey(withDrawOrder, clipId, attachmentTrackId, {
			timeSeconds: 0.5,
			value: null
		}, () => keyIds[4]));
		const withOpacityKey = unwrap(addNumberKey(withAttachmentKey, clipId, opacityTrackId, {
			timeSeconds: 0,
			value: 1
		}, () => keyIds[5]));
		const withPointKey = unwrap(addBooleanKey(withOpacityKey, clipId, pointTrackId, {
			timeSeconds: 0.5,
			value: false
		}, () => keyIds[6]));
		const withRectangleKey = unwrap(addNumberKey(withPointKey, clipId, rectangleTrackId, {
			timeSeconds: 0,
			value: 22
		}, () => keyIds[7]));
		const withEnabledKey = unwrap(addBooleanKey(withRectangleKey, clipId, enabledTrackId, {
			timeSeconds: 0.5,
			value: false
		}, () => keyIds[8]));
		const withDrawOrderKey = unwrap(addDrawOrderKey(withEnabledKey, clipId, drawOrderTrackId, {
			timeSeconds: 0,
			value: [fixtureIds.slot]
		}, () => keyIds[9]));

		expect(withDrawOrderKey.clips[0]?.tracks).toHaveLength(6);
		expect(addAttachmentKey(withDrawOrderKey, clipId, attachmentTrackId, {
			timeSeconds: 0,
			value: fixtureIds.asset
		}, () => keyIds[10])).toMatchObject({ ok: false, error: { code: 'invalid-reference' } });
		expect(deleteKey(withDrawOrderKey, clipId, pointTrackId, keyIds[6]).ok).toBe(true);
		expect(deleteTrack(withDrawOrderKey, clipId, drawOrderTrackId).ok).toBe(true);
	});

	test('updates a slot attachment key while preserving its time and ID', () => {
		const project = withClip();
		const withTrack = unwrap(createTrack(project, clipId, {
			kind: 'slot-attachment',
			targetId: fixtureIds.slot
		}, () => attachmentTrackId));
		const withKey = unwrap(addAttachmentKey(withTrack, clipId, attachmentTrackId, {
			timeSeconds: 0.5,
			value: null
		}, () => keyIds[4]));
		const assigned = unwrap(updateAttachmentKey(withKey, clipId, attachmentTrackId, keyIds[4], fixtureIds.image));
		const invalid = updateAttachmentKey(withKey, clipId, attachmentTrackId, keyIds[4], fixtureIds.point);

		expect(assigned.clips[0]?.tracks[0]?.keys).toMatchObject([{
			id: keyIds[4],
			timeSeconds: 0.5,
			value: fixtureIds.image
		}]);
		expect(withKey.clips[0]?.tracks[0]?.keys).toMatchObject([{ id: keyIds[4], value: null }]);
		expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-reference' } });
	});

	test('updates playback settings without mutating the original clip', () => {
		const project = withClip();
		const updated = updateClipPlayback(project, clipId, { durationSeconds: 2, fps: 24, loop: false });

		expect(updated.ok).toBe(true);
		expect(project.clips[0]?.durationSeconds).toBe(1);
		if (updated.ok) {
			expect(updated.value.clips[0]?.durationSeconds).toBe(2);
			expect(updated.value.clips[0]?.fps).toBe(24);
			expect(updated.value.clips[0]?.loop).toBe(false);
		}
	});

	test('upserts a numeric key at an existing frame without changing its ID', () => {
		const project = withClip();
		const withTrack = unwrap(createTrack(project, clipId, {
			kind: 'bone-transform',
			targetId: fixtureIds.root,
			property: 'x'
		}, () => duplicateTrackId));
		const withKey = unwrap(addNumberKey(withTrack, clipId, duplicateTrackId, {
			timeSeconds: 0,
			value: 12
		}, () => duplicateKeyId));
		const updated = unwrap(upsertNumberKey(withKey, clipId, duplicateTrackId, {
			timeSeconds: 0,
			value: 30
		}, () => keyIds[2]));

		expect(updated.clips[0]?.tracks[0]?.keys).toMatchObject([{ id: duplicateKeyId, value: 30 }]);
		expect(withKey.clips[0]?.tracks[0]?.keys).toMatchObject([{ id: duplicateKeyId, value: 12 }]);
	});

	test('updates numeric key interpolation without mutating the source project', () => {
		const project = withClip();
		const withTrack = unwrap(createTrack(project, clipId, {
			kind: 'bone-transform',
			targetId: fixtureIds.root,
			property: 'x'
		}, () => duplicateTrackId));
		const withKey = unwrap(addNumberKey(withTrack, clipId, duplicateTrackId, {
			timeSeconds: 0,
			value: 12
		}, () => duplicateKeyId));
		const bezier = unwrap(setNumberKeyInterpolation(withKey, clipId, duplicateTrackId, duplicateKeyId, { interpolation: 'bezier' }));
		const stepped = unwrap(setNumberKeyInterpolation(bezier, clipId, duplicateTrackId, duplicateKeyId, { interpolation: 'stepped' }));
		const invalidCurve = setNumberKeyInterpolation(withKey, clipId, duplicateTrackId, duplicateKeyId, {
			interpolation: 'bezier',
			curve: { x1: 1.1, y1: 0, x2: 0.5, y2: 1 }
		});

		expect(bezier.clips[0]?.tracks[0]?.keys).toMatchObject([{
			id: duplicateKeyId,
			interpolation: 'bezier',
			curve: { x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 }
		}]);
		expect(stepped.clips[0]?.tracks[0]?.keys).toMatchObject([{ id: duplicateKeyId, interpolation: 'stepped', curve: null }]);
		expect(withKey.clips[0]?.tracks[0]?.keys).toMatchObject([{ id: duplicateKeyId, interpolation: 'linear', curve: null }]);
		expect(invalidCurve).toMatchObject({ ok: false, error: { code: 'invalid-value' } });
	});

	test('duplicates a clip with fresh nested IDs and retained content', () => {
		const project = withClip();
		const withTrack = unwrap(createTrack(project, clipId, {
			kind: 'bone-transform',
			targetId: fixtureIds.root,
			property: 'x'
		}, () => duplicateTrackId));
		const withKey = unwrap(addNumberKey(withTrack, clipId, duplicateTrackId, {
			timeSeconds: 0,
			value: 12
		}, () => duplicateKeyId));
		const duplicated = duplicateClip(withKey, clipId, {
			id: duplicateClipId,
			trackIds: [keyIds[10]],
			keyIds: [[keyIds[11]]],
			eventIds: []
		});

		expect(duplicated.ok).toBe(true);
		if (duplicated.ok) {
			expect(duplicated.value.clips).toHaveLength(2);
			expect(duplicated.value.clips[1]).toMatchObject({ name: 'walk copy', tracks: [{ id: keyIds[10], keys: [{ id: keyIds[11], value: 12 }] }] });
			expect(duplicated.value.clips[0]).toEqual(withKey.clips[0]);
		}
	});

	test('moves and copies keys without mutating the source track', () => {
		const project = withClip();
		const withTrack = unwrap(createTrack(project, clipId, {
			kind: 'bone-transform',
			targetId: fixtureIds.root,
			property: 'x'
		}, () => duplicateTrackId));
		const withKey = unwrap(addNumberKey(withTrack, clipId, duplicateTrackId, {
			timeSeconds: 0,
			value: 12
		}, () => duplicateKeyId));
		const moved = unwrap(moveKey(withKey, clipId, duplicateTrackId, duplicateKeyId, 0.5));
		const copied = unwrap(copyKey(moved, clipId, duplicateTrackId, duplicateKeyId, keyIds[2], 1));
		const track = copied.clips[0]?.tracks[0];

		expect(moved.clips[0]?.tracks[0]?.keys.map((key) => key.timeSeconds)).toEqual([0.5]);
		expect(track?.keys.map((key) => [key.id, key.timeSeconds])).toEqual([[duplicateKeyId, 0.5], [keyIds[2], 1]]);
		expect(deleteKey(copied, clipId, duplicateTrackId, keyIds[2]).ok).toBe(true);
		expect(withKey.clips[0]?.tracks[0]?.keys[0]?.timeSeconds).toBe(0);
	});

	test('retimes multiple keys atomically and rejects collisions', () => {
		const project = withClip();
		const withTrack = unwrap(createTrack(project, clipId, {
			kind: 'bone-transform',
			targetId: fixtureIds.root,
			property: 'x'
		}, () => duplicateTrackId));
		const withFirstKey = unwrap(addNumberKey(withTrack, clipId, duplicateTrackId, {
			timeSeconds: 0,
			value: 12
		}, () => duplicateKeyId));
		const withSecondKey = unwrap(addNumberKey(withFirstKey, clipId, duplicateTrackId, {
			timeSeconds: 0.25,
			value: 24
		}, () => keyIds[2]));
		const retimed = retimeKeys(withSecondKey, clipId, [
			{ trackId: duplicateTrackId, keyId: duplicateKeyId, timeSeconds: 0.5 },
			{ trackId: duplicateTrackId, keyId: keyIds[2], timeSeconds: 0.75 }
		]);
		const collision = retimeKeys(withSecondKey, clipId, [{ trackId: duplicateTrackId, keyId: duplicateKeyId, timeSeconds: 0.25 }]);

		expect(retimed.ok).toBe(true);
		if (retimed.ok) {
			expect(retimed.value.clips[0]?.tracks[0]?.keys.map((key) => key.timeSeconds)).toEqual([0.5, 0.75]);
		}
		expect(collision).toMatchObject({ ok: false, error: { code: 'invalid-value' } });
		expect(withSecondKey.clips[0]?.tracks[0]?.keys.map((key) => key.timeSeconds)).toEqual([0, 0.25]);
	});
});
