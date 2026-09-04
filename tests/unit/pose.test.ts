import { describe, expect, test } from 'bun:test';
import {
	addAttachmentKey,
	addBooleanKey,
	addNumberKey,
	createClip,
	createTrack
} from '../../src/domain/animation.ts';
import { evaluateGameplayFrame, evaluatePose } from '../../src/domain/pose.ts';
import type { Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174030';
const trackIds = {
	bone: '123e4567-e89b-42d3-a456-426614174031',
	attachment: '123e4567-e89b-42d3-a456-426614174032',
	opacity: '123e4567-e89b-42d3-a456-426614174033',
	point: '123e4567-e89b-42d3-a456-426614174034',
	rectangle: '123e4567-e89b-42d3-a456-426614174035',
	enabled: '123e4567-e89b-42d3-a456-426614174036'
} as const;
const keyIds = [
	'123e4567-e89b-42d3-a456-426614174037',
	'123e4567-e89b-42d3-a456-426614174038',
	'123e4567-e89b-42d3-a456-426614174039',
	'123e4567-e89b-42d3-a456-42661417403a',
	'123e4567-e89b-42d3-a456-42661417403b',
	'123e4567-e89b-42d3-a456-42661417403c',
	'123e4567-e89b-42d3-a456-42661417403d',
	'123e4567-e89b-42d3-a456-42661417403e',
	'123e4567-e89b-42d3-a456-42661417403f',
	'123e4567-e89b-42d3-a456-426614174040',
	'123e4567-e89b-42d3-a456-426614174041'
] as const;

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const animatedProject = function animatedProject(): Project {
	const withClip = unwrap(createClip(createRigProject(), { name: 'walk' }, () => clipId));
	const withBoneTrack = unwrap(createTrack(withClip, clipId, {
		kind: 'bone-transform',
		targetId: fixtureIds.child,
		property: 'x'
	}, () => trackIds.bone));
	const withBoneKeys = unwrap(addNumberKey(withBoneTrack, clipId, trackIds.bone, {
		timeSeconds: 0,
		value: 10
	}, () => keyIds[0]));
	const withSecondBoneKey = unwrap(addNumberKey(withBoneKeys, clipId, trackIds.bone, {
		timeSeconds: 1,
		value: 30
	}, () => keyIds[1]));
	const withAttachmentTrack = unwrap(createTrack(withSecondBoneKey, clipId, {
		kind: 'slot-attachment',
		targetId: fixtureIds.slot
	}, () => trackIds.attachment));
	const withAttachmentKey = unwrap(addAttachmentKey(withAttachmentTrack, clipId, trackIds.attachment, {
		timeSeconds: 0.5,
		value: null
	}, () => keyIds[2]));
	const withOpacityTrack = unwrap(createTrack(withAttachmentKey, clipId, {
		kind: 'attachment-opacity',
		targetId: fixtureIds.image
	}, () => trackIds.opacity));
	const withOpacityStart = unwrap(addNumberKey(withOpacityTrack, clipId, trackIds.opacity, {
		timeSeconds: 0,
		value: 1
	}, () => keyIds[3]));
	const withOpacityEnd = unwrap(addNumberKey(withOpacityStart, clipId, trackIds.opacity, {
		timeSeconds: 1,
		value: 0
	}, () => keyIds[4]));
	const withPointTrack = unwrap(createTrack(withOpacityEnd, clipId, {
		kind: 'point-enabled',
		targetId: fixtureIds.point
	}, () => trackIds.point));
	const withPointKey = unwrap(addBooleanKey(withPointTrack, clipId, trackIds.point, {
		timeSeconds: 0.5,
		value: false
	}, () => keyIds[5]));
	const withRectangleTrack = unwrap(createTrack(withPointKey, clipId, {
		kind: 'rectangle-size',
		targetId: fixtureIds.rectangle,
		property: 'width'
	}, () => trackIds.rectangle));
	const withRectangleStart = unwrap(addNumberKey(withRectangleTrack, clipId, trackIds.rectangle, {
		timeSeconds: 0,
		value: 20
	}, () => keyIds[6]));
	const withRectangleEnd = unwrap(addNumberKey(withRectangleStart, clipId, trackIds.rectangle, {
		timeSeconds: 1,
		value: 40
	}, () => keyIds[7]));
	const withEnabledTrack = unwrap(createTrack(withRectangleEnd, clipId, {
		kind: 'rectangle-enabled',
		targetId: fixtureIds.rectangle
	}, () => trackIds.enabled));

	return unwrap(addBooleanKey(withEnabledTrack, clipId, trackIds.enabled, {
		timeSeconds: 0.5,
		value: false
	}, () => keyIds[8]));
};

describe('pure pose evaluator', () => {
	test('evaluates keyed bones, active attachments, opacity, gameplay state, and draw order', () => {
		const result = evaluatePose(animatedProject(), clipId, 0.5);

		expect(result.diagnostics).toEqual([]);
		expect(result.pose?.timeSeconds).toBe(0.5);
		expect(result.pose?.drawOrder).toEqual([fixtureIds.slot]);

		const child = result.pose?.bones.find((bone) => bone.id === fixtureIds.child);
		const image = result.pose?.attachments.find((attachment) => attachment.id === fixtureIds.image);
		const point = result.pose?.attachments.find((attachment) => attachment.id === fixtureIds.point);
		const rectangle = result.pose?.attachments.find((attachment) => attachment.id === fixtureIds.rectangle);

		expect(child?.localTransform.x).toBe(20);
		expect(image?.kind).toBe('image');
		if (image?.kind === 'image') {
			expect(image.active).toBe(false);
			expect(image.opacity).toBeCloseTo(0.5, 8);
		}
		expect(point?.kind).toBe('point');
		if (point?.kind === 'point') {
			expect(point.enabled).toBe(false);
		}
		expect(rectangle?.kind).toBe('rectangle');
		if (rectangle?.kind === 'rectangle') {
			expect(rectangle.width).toBeCloseTo(30, 8);
			expect(rectangle.enabled).toBe(false);
		}
	});

	test('uses looped clip time and reports missing clips', () => {
		const project = animatedProject();
		const looped = evaluatePose(project, clipId, 1.5);
		const missing = evaluatePose(project, '123e4567-e89b-42d3-a456-426614174099', 0);

		expect(looped.pose?.timeSeconds).toBeCloseTo(0.5, 8);
		expect(missing.pose).toBeUndefined();
		expect(missing.diagnostics[0]?.code).toBe('missing-clip');
	});

	test('applies editor-only numeric overrides without changing setup data', () => {
		const project = animatedProject();
		const overridden = evaluatePose(project, clipId, 0.5, [{ targetId: fixtureIds.child, property: 'rotation', value: 0.75 }]);
		const child = overridden.pose?.bones.find((bone) => bone.id === fixtureIds.child);
		const setupChild = project.bones.find((bone) => bone.id === fixtureIds.child);

		expect(child?.localTransform.rotation).toBe(0.75);
		expect(setupChild?.transform.rotation).toBe(0.6);
		expect(evaluatePose(project, clipId, 0.5).pose?.bones.find((bone) => bone.id === fixtureIds.child)?.localTransform.rotation).toBe(0.6);
	});

	test('projects gameplay attachments into world-space frame data', () => {
		const project = animatedProject();
		const poseResult = evaluatePose(project, clipId, 0.5);
		const frameResult = evaluateGameplayFrame(project, clipId, 0.5);
		const pose = poseResult.pose;
		const frame = frameResult.frame;

		if (!pose || !frame) {
			throw new Error('The animated fixture should produce a pose and gameplay frame.');
		}

		const posePoint = pose.attachments.find((attachment) => attachment.id === fixtureIds.point);
		const poseRectangle = pose.attachments.find((attachment) => attachment.id === fixtureIds.rectangle);
		const point = frame.points.find((attachment) => attachment.id === fixtureIds.point);
		const rectangle = frame.rectangles.find((attachment) => attachment.id === fixtureIds.rectangle);

		if (posePoint?.kind !== 'point' || poseRectangle?.kind !== 'rectangle' || !point || !rectangle) {
			throw new Error('The animated fixture should produce both gameplay attachments.');
		}

		expect(frameResult.diagnostics).toEqual([]);
		expect(frame).toMatchObject({ clipId, timeSeconds: 0.5 });
		expect(point).toEqual({
			id: fixtureIds.point,
			position: posePoint.position,
			enabled: false
		});
		expect(rectangle).toEqual({
			id: fixtureIds.rectangle,
			corners: poseRectangle.corners,
			width: 30,
			height: 30,
			rotation: poseRectangle.rotation,
			enabled: false
		});
		expect(rectangle.corners).toHaveLength(4);
	});

	test('preserves pose diagnostics when gameplay frame evaluation cannot sample', () => {
		const result = evaluateGameplayFrame(animatedProject(), clipId, Number.NaN);

		expect(result.frame).toBeUndefined();
		expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid-time' }));
	});
});
