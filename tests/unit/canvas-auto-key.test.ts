import { describe, expect, test } from 'bun:test';
import { addNumberKey, createClip, createTrack } from '../../src/domain/animation.ts';
import { localTransformToMatrix, multiplyAffine, transformPoint, type LocalTransform } from '../../src/domain/coordinates.ts';
import { reduceProject, type ProjectCommand } from '../../src/domain/commands.ts';
import { beginTransaction, cancelTransaction, commitTransaction, createHistory, currentProject, dispatchCommand, redo, undo, type HistoryState } from '../../src/domain/history.ts';
import { evaluatePose, type EvaluatedPose } from '../../src/domain/pose.ts';
import { evaluateBoneWorldMatrices } from '../../src/domain/transforms.ts';
import type { Clip, Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { entitiesInBounds, hitTestProject } from '../../src/app/hit-testing.ts';
import {
	createTransformGesture,
	transformGestureCommand,
	transformGestureCommands,
	transformGesturePropertyChangesFor,
	type CanvasGesturePropertyChange
} from '../../src/app/transform-gesture.ts';
import {
	mergePendingAnimationEdits,
	mergePendingAnimationValues,
	pendingEditsForChanges,
	planCanvasAnimation,
	removePendingAnimationEdits,
	removePendingAnimationValues
} from '../../src/app/canvas-animation.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174011';
const xTrackId = '123e4567-e89b-42d3-a456-426614174012';
const xKeyId = '123e4567-e89b-42d3-a456-426614174013';
const yTrackId = '123e4567-e89b-42d3-a456-426614174014';
const yKeyId = '123e4567-e89b-42d3-a456-426614174015';
const freshTrackId = '123e4567-e89b-42d3-a456-426614174016';
const freshKeyId = '123e4567-e89b-42d3-a456-426614174017';
const freshSeedKeyId = '123e4567-e89b-42d3-a456-426614174018';
const freshYKeyId = '123e4567-e89b-42d3-a456-426614174019';

const idFactoryFor = function idFactoryFor(ids: readonly string[]): () => string {
	const iterator = ids[Symbol.iterator]();

	return function nextId(): string {
		const next = iterator.next();

		if (next.done) {
			throw new Error('The deterministic ID factory was exhausted.');
		}

		return next.value;
	};
};

const projectWithClip = function projectWithClip(): Readonly<{ project: Project; clip: Clip }> {
	const result = createClip(createRigProject(), { name: 'walk', durationSeconds: 2, fps: 10 }, idFactoryFor([clipId]));

	if (!result.ok) {
		throw new Error(result.error.message);
	}

	const clip = result.value.clips.find((candidate) => candidate.id === clipId);

	if (!clip) {
		throw new Error('The animation clip is unavailable.');
	}

	return { project: result.value, clip };
};

const projectWithKeyedPose = function projectWithKeyedPose(): Readonly<{ project: Project; clip: Clip; pose: EvaluatedPose }> {
	const base = projectWithClip();
	const trackResult = createTrack(base.project, clipId, { kind: 'bone-transform', targetId: fixtureIds.root, property: 'x' }, idFactoryFor([xTrackId]));

	if (!trackResult.ok) {
		throw new Error(trackResult.error.message);
	}

	const keyResult = addNumberKey(trackResult.value, clipId, xTrackId, {
		timeSeconds: 0.5,
		value: 180
	}, idFactoryFor([xKeyId]));

	if (!keyResult.ok) {
		throw new Error(keyResult.error.message);
	}

	const clip = keyResult.value.clips.find((candidate) => candidate.id === clipId);
	const pose = evaluatePose(keyResult.value, clipId, 0.5).pose;

	if (!clip || !pose) {
		throw new Error('The keyed pose is unavailable.');
	}

	return { project: keyResult.value, clip, pose };
};

const reduceCommands = function reduceCommands(
	project: Project,
	commands: readonly ProjectCommand[]
): Project {
	return commands.reduce((current, command) => {
		const result = reduceProject(current, command);

		if (!result.ok) {
			throw new Error(result.error.message);
		}

		return result.value;
	}, project);
};

const applyToHistory = function applyToHistory(
	history: HistoryState,
	commands: readonly ProjectCommand[]
): HistoryState {
	const result = commands.reduce<OperationResult<HistoryState>>(
		(current, command) => current.ok ? dispatchCommand(current.value, command) : current,
		{ ok: true, value: history }
	);

	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const transformForRoot = function transformForRoot(project: Project, update: Partial<LocalTransform>): LocalTransform {
	const root = project.bones.find((bone) => bone.id === fixtureIds.root);

	if (!root) {
		throw new Error('The root fixture is unavailable.');
	}

	return { ...root.transform, ...update };
};

const rootChange = function rootChange(
	property: 'x' | 'y',
	initialValue: number,
	value: number
): CanvasGesturePropertyChange {
	return {
		kind: 'transform',
		entityKind: 'bone',
		targetId: fixtureIds.root,
		property,
		initialValue,
		value,
		delta: value - initialValue
	};
};

describe('canvas transform property mapping', () => {
	test('returns only changed transform axes and typed rectangle dimensions', () => {
		const project = createRigProject();
		const translate = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 100, y: 50 }, 'translate', { shiftKey: true });
		const rectangle = project.attachments.find((attachment) => attachment.id === fixtureIds.rectangle);

		if (!translate || !rectangle || rectangle.kind !== 'rectangle') {
			throw new Error('The transform fixtures are unavailable.');
		}

		const translateCommands = transformGestureCommands(translate, { x: 120, y: 65 });

		if (!translateCommands) {
			throw new Error('The constrained translation command is unavailable.');
		}

		expect(transformGesturePropertyChangesFor(translate, translateCommands)).toEqual([rootChange('x', 100, 120)]);

			const boneMatrix = evaluateBoneWorldMatrices(project).matrices.get(rectangle.boneId);

			if (!boneMatrix) {
				throw new Error('The rectangle bone matrix is unavailable.');
			}

			const matrix = multiplyAffine(boneMatrix, localTransformToMatrix(rectangle.transform));
			const startPoint = transformPoint(matrix, { x: rectangle.width / 2, y: 0 });
		const resize = createTransformGesture(project, { kind: 'attachment', id: fixtureIds.rectangle }, startPoint, 'scale');

		if (!resize) {
			throw new Error('The rectangle resize fixture is unavailable.');
		}

		const resizeCommand = transformGestureCommand(resize, transformPoint(matrix, { x: rectangle.width / 2 + 5, y: 0 }));

		if (!resizeCommand) {
			throw new Error('The rectangle resize command is unavailable.');
		}

		expect(transformGesturePropertyChangesFor(resize, [resizeCommand])).toEqual([
				{ kind: 'rectangle-size', targetId: fixtureIds.rectangle, property: 'width', initialValue: rectangle.width, value: rectangle.width + 10, delta: 10 }
			]);

			const clampedResizeCommand = transformGestureCommand(resize, transformPoint(matrix, { x: -100, y: 0 }));

			if (!clampedResizeCommand) {
				throw new Error('The clamped rectangle resize command is unavailable.');
			}

		expect(transformGesturePropertyChangesFor(resize, [clampedResizeCommand])).toEqual([
				{ kind: 'rectangle-size', targetId: fixtureIds.rectangle, property: 'width', initialValue: rectangle.width, value: 1, delta: 1 - rectangle.width }
			]);
	});

	test('maps attachment transform deltas to attachment properties', () => {
		const project = createRigProject();
		const point = project.attachments.find((attachment) => attachment.id === fixtureIds.point);

		if (!point || point.kind !== 'point') {
			throw new Error('The point attachment fixture is unavailable.');
		}

		const boneMatrix = evaluateBoneWorldMatrices(project).matrices.get(point.boneId);

		if (!boneMatrix) {
			throw new Error('The point attachment bone matrix is unavailable.');
		}

		const pointMatrix = multiplyAffine(boneMatrix, localTransformToMatrix(point.transform));
		const startPoint = transformPoint(pointMatrix, { x: 0, y: 0 });
		const gesture = createTransformGesture(project, { kind: 'attachment', id: point.id }, startPoint, 'translate');

		if (!gesture) {
			throw new Error('The attachment gesture is unavailable.');
		}

		const command = transformGestureCommand(gesture, transformPoint(boneMatrix, { x: point.transform.x + 10, y: point.transform.y }));

		if (!command) {
			throw new Error('The attachment command is unavailable.');
		}

		const changes = transformGesturePropertyChangesFor(gesture, [command]);
		const change = changes[0];

		if (!change || change.kind !== 'transform') {
			throw new Error('The attachment property change is unavailable.');
		}

		expect(changes.every((candidate) => candidate.kind === 'transform' && candidate.entityKind === 'attachment' && candidate.targetId === fixtureIds.point)).toBe(true);
		expect(change).toMatchObject({ entityKind: 'attachment', targetId: fixtureIds.point, property: 'x', initialValue: point.transform.x });
		expect(change.value).not.toBe(point.transform.x);
	});

	test('maps every changed property independently across a multi-selection', () => {
		const project = createRigProject();
		const gesture = createTransformGesture(project, [
			{ kind: 'bone', id: fixtureIds.root },
			{ kind: 'bone', id: fixtureIds.parentA }
		], { x: 100, y: 50 }, 'translate');

		if (!gesture) {
			throw new Error('The multi-selection gesture is unavailable.');
		}

		const commands = transformGestureCommands(gesture, { x: 120, y: 65 });

		if (!commands) {
			throw new Error('The multi-selection commands are unavailable.');
		}

		expect(transformGesturePropertyChangesFor(gesture, commands)).toEqual([
			rootChange('x', 100, 120),
			rootChange('y', 50, 65),
			{ kind: 'transform', entityKind: 'bone', targetId: fixtureIds.parentA, property: 'x', initialValue: 20, value: 40, delta: 20 },
			{ kind: 'transform', entityKind: 'bone', targetId: fixtureIds.parentA, property: 'y', initialValue: 0, value: 15, delta: 15 }
		]);
	});

	test('does not report a zero-distance or clamped-axis change', () => {
		const project = createRigProject();
		const gesture = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 100, y: 50 }, 'scale');

		if (!gesture) {
			throw new Error('The scale gesture is unavailable.');
		}

		const command = transformGestureCommand(gesture, { x: 0, y: 50 });

		if (!command) {
			throw new Error('The scale command is unavailable.');
		}

		const changes = transformGesturePropertyChangesFor(gesture, [command]);

			expect(changes).toEqual([
				{ kind: 'transform', entityKind: 'bone', targetId: fixtureIds.root, property: 'scaleX', initialValue: 1, value: 0.01, delta: -0.99 }
			]);
		const zeroCommand = transformGestureCommand(gesture, { x: 100, y: 50 });

		if (!zeroCommand) {
			throw new Error('The zero-distance command is unavailable.');
		}

		expect(transformGesturePropertyChangesFor(gesture, [zeroCommand])).toEqual([]);
	});
});

describe('pose-aware canvas geometry', () => {
	test('initializes from the evaluated local transform without a first-move jump', () => {
		const { project, pose } = projectWithKeyedPose();
		const gesture = createTransformGesture(project, { kind: 'bone', id: fixtureIds.root }, { x: 180, y: 50 }, 'translate', {}, pose);

		if (!gesture) {
			throw new Error('The pose-aware gesture is unavailable.');
		}

		const command = transformGestureCommand(gesture, { x: 180, y: 50 });

		expect(command).toMatchObject({ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: { x: 180, y: 50 } });
		expect(hitTestProject(project, { x: 220, y: 50 }, new Set([fixtureIds.image, fixtureIds.parentA, fixtureIds.parentB, fixtureIds.child]), pose)).toEqual({ kind: 'bone', id: fixtureIds.root });
	});

	test('uses the evaluated parent matrix when converting a child drag back to local space', () => {
		const base = projectWithClip();
		const parentTrack = createTrack(base.project, clipId, { kind: 'bone-transform', targetId: fixtureIds.parentA, property: 'rotation' }, idFactoryFor([xTrackId]));

		if (!parentTrack.ok) {
			throw new Error(parentTrack.error.message);
		}

		const parentKey = addNumberKey(parentTrack.value, clipId, xTrackId, { timeSeconds: 0.5, value: 1.1 }, idFactoryFor([xKeyId]));

		if (!parentKey.ok) {
			throw new Error(parentKey.error.message);
		}

		const pose = evaluatePose(parentKey.value, clipId, 0.5).pose;

		if (!pose) {
			throw new Error('The evaluated parent pose is unavailable.');
		}

		const childPose = pose.bones.find((bone) => bone.id === fixtureIds.child);

		if (!childPose) {
			throw new Error('The evaluated child pose is unavailable.');
		}

		const gesture = createTransformGesture(parentKey.value, { kind: 'bone', id: fixtureIds.child }, transformPoint(childPose.worldMatrix, { x: 0, y: 0 }), 'translate', {}, pose);

		if (!gesture || !gesture.entities[0]) {
			throw new Error('The child gesture is unavailable.');
		}

		const target = gesture.entities[0];
		const startLocal = { x: 10, y: 5 };
		const movedPoint = transformPoint(target.parentMatrix, { x: startLocal.x + 10, y: startLocal.y });
		const command = transformGestureCommand(gesture, movedPoint);

		if (command?.kind !== 'update-bone-transform') {
			throw new Error('The child transform command is unavailable.');
		}

		expect(command.transform.x).toBeCloseTo(20);
		expect(command.transform.y).toBeCloseTo(5);
	});

	test('uses evaluated rectangle dimensions for pose hit testing and marquee bounds', () => {
		const base = projectWithClip();
		const widthTrack = createTrack(base.project, clipId, { kind: 'rectangle-size', targetId: fixtureIds.rectangle, property: 'width' }, idFactoryFor([xTrackId]));

		if (!widthTrack.ok) {
			throw new Error(widthTrack.error.message);
		}

		const widthKey = addNumberKey(widthTrack.value, clipId, xTrackId, { timeSeconds: 0.5, value: 100 }, idFactoryFor([xKeyId]));

		if (!widthKey.ok) {
			throw new Error(widthKey.error.message);
		}

		const pose = evaluatePose(widthKey.value, clipId, 0.5).pose;

		if (!pose) {
			throw new Error('The evaluated rectangle pose is unavailable.');
		}

		const evaluatedRectangle = pose.attachments.find((attachment) => attachment.id === fixtureIds.rectangle);

		if (!evaluatedRectangle || evaluatedRectangle.kind !== 'rectangle') {
			throw new Error('The evaluated rectangle is unavailable.');
		}

		const hitPoint = transformPoint(evaluatedRectangle.worldMatrix, { x: 45, y: 0 });

		expect(hitTestProject(widthKey.value, hitPoint, new Set(), pose)).toEqual({ kind: 'attachment', id: fixtureIds.rectangle });
		expect(entitiesInBounds(widthKey.value, { x: hitPoint.x - 1, y: hitPoint.y - 1, w: 2, h: 2 }, new Set(), pose)).toContainEqual({ kind: 'attachment', id: fixtureIds.rectangle });
});
});

describe('canvas animation planning and transaction behavior', () => {
		test('creates only changed-property tracks and keys, then reuses them on later updates', () => {
		const { project, clip } = projectWithClip();
		const firstChange = rootChange('x', 100, 120);
		const firstPlan = planCanvasAnimation({
			project,
			baseProject: project,
			clipId: clip.id,
			frameIndex: 5,
			autoKey: true,
			setupCommands: [{ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: transformForRoot(project, { x: 120 }) }],
			changes: [firstChange]
		}, idFactoryFor([freshTrackId, freshSeedKeyId, freshKeyId]));

		if (!firstPlan.ok) {
			throw new Error(firstPlan.error.message);
		}

		const firstDraft = reduceCommands(project, firstPlan.value.commands);
		const firstClip = firstDraft.clips.find((candidate) => candidate.id === clip.id);

		if (!firstClip) {
			throw new Error('The first animation draft is unavailable.');
		}

		expect(firstPlan.value.pendingEdits).toEqual([{ targetId: fixtureIds.root, property: 'x' }]);
		expect(firstClip.tracks).toHaveLength(1);
		expect(firstClip.tracks[0]?.id).toBe(freshTrackId);
		expect(firstClip.tracks[0]?.keys[0]?.id).toBe(freshSeedKeyId);
		expect(firstClip.tracks[0]?.keys[1]?.id).toBe(freshKeyId);
		expect(firstDraft.bones.find((bone) => bone.id === fixtureIds.root)?.transform.x).toBe(100);
		expect(evaluatePose(firstDraft, clip.id, 0.25).pose?.bones.find((bone) => bone.id === fixtureIds.root)?.localTransform.x).toBe(110);

		const secondPlan = planCanvasAnimation({
			project: firstDraft,
			baseProject: project,
			clipId: clip.id,
			frameIndex: 5,
			autoKey: true,
			setupCommands: [{ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: transformForRoot(firstDraft, { x: 130 }) }],
			changes: [rootChange('x', 100, 130)],
			previousChanges: [firstChange]
		}, idFactoryFor([]));

		if (!secondPlan.ok) {
			throw new Error(secondPlan.error.message);
		}

		expect(secondPlan.value.animationCommands).toEqual([{
			kind: 'set-number-key',
			id: freshKeyId,
			clipId: clip.id,
			trackId: freshTrackId,
			input: { timeSeconds: 0.5, value: 130, interpolation: 'linear', curve: null }
		}]);
		const secondDraft = reduceCommands(firstDraft, secondPlan.value.commands);
		const secondClip = secondDraft.clips.find((candidate) => candidate.id === clip.id);

		if (!secondClip) {
			throw new Error('The second animation draft is unavailable.');
		}

		expect(secondClip.tracks).toHaveLength(1);
		expect(secondClip.tracks[0]?.keys).toHaveLength(2);
			expect(secondClip.tracks[0]?.keys[1]).toMatchObject({ id: freshKeyId, value: 130 });
		});

		test('retains generated track and key IDs if a temporary property is reintroduced', () => {
			const { project, clip } = projectWithClip();
			const firstChange = rootChange('x', 100, 120);
			const firstPlan = planCanvasAnimation({
				project,
				baseProject: project,
				clipId: clip.id,
				frameIndex: 5,
				autoKey: true,
				setupCommands: [{ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: transformForRoot(project, { x: 120 }) }],
				changes: [firstChange]
			}, idFactoryFor([freshTrackId, freshSeedKeyId, freshKeyId]));

			if (!firstPlan.ok) {
				throw new Error(firstPlan.error.message);
			}

			const firstDraft = reduceCommands(project, firstPlan.value.commands);
			const resetPlan = planCanvasAnimation({
				project: firstDraft,
				baseProject: project,
				clipId: clip.id,
				frameIndex: 5,
				autoKey: true,
				setupCommands: [{ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: transformForRoot(firstDraft, { x: 100 }) }],
				changes: [],
				previousChanges: [firstChange],
				allocatedIds: firstPlan.value.allocatedIds
			}, idFactoryFor([]));

			if (!resetPlan.ok) {
				throw new Error(resetPlan.error.message);
			}

			const resetDraft = reduceCommands(firstDraft, resetPlan.value.commands);
			const reintroducedPlan = planCanvasAnimation({
				project: resetDraft,
				baseProject: project,
				clipId: clip.id,
				frameIndex: 5,
				autoKey: true,
				setupCommands: [{ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: transformForRoot(resetDraft, { x: 120 }) }],
				changes: [firstChange],
				allocatedIds: resetPlan.value.allocatedIds
			}, idFactoryFor([]));

			if (!reintroducedPlan.ok) {
				throw new Error(reintroducedPlan.error.message);
			}

			expect(reintroducedPlan.value.animationCommands).toEqual([
				{ kind: 'create-track', id: freshTrackId, clipId: clip.id, definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'x' } },
				{ kind: 'add-number-key', id: freshSeedKeyId, clipId: clip.id, trackId: freshTrackId, input: { timeSeconds: 0, value: 100, interpolation: 'linear', curve: null } },
				{ kind: 'add-number-key', id: freshKeyId, clipId: clip.id, trackId: freshTrackId, input: { timeSeconds: 0.5, value: 120, interpolation: 'linear', curve: null } }
			]);
		});

		test('removes both seeded keys when restoring an initially empty track', () => {
			const base = projectWithClip();
			const emptyTrack = createTrack(base.project, clipId, { kind: 'bone-transform', targetId: fixtureIds.root, property: 'x' }, idFactoryFor([xTrackId]));

			if (!emptyTrack.ok) {
				throw new Error(emptyTrack.error.message);
			}

			const firstChange = rootChange('x', 100, 120);
			const firstPlan = planCanvasAnimation({
				project: emptyTrack.value,
				baseProject: emptyTrack.value,
				clipId,
				frameIndex: 5,
				autoKey: true,
				setupCommands: [],
				changes: [firstChange]
			}, idFactoryFor([freshSeedKeyId, freshKeyId]));

			if (!firstPlan.ok) {
				throw new Error(firstPlan.error.message);
			}

			const firstDraft = reduceCommands(emptyTrack.value, firstPlan.value.commands);
			const resetPlan = planCanvasAnimation({
				project: firstDraft,
				baseProject: emptyTrack.value,
				clipId,
				frameIndex: 5,
				autoKey: true,
				setupCommands: [],
				changes: [],
				previousChanges: [firstChange],
				allocatedIds: firstPlan.value.allocatedIds
			}, idFactoryFor([]));

			if (!resetPlan.ok) {
				throw new Error(resetPlan.error.message);
			}

			expect(resetPlan.value.cleanupCommands).toEqual([
				{ kind: 'delete-key', clipId, trackId: xTrackId, keyId: freshSeedKeyId },
				{ kind: 'delete-key', clipId, trackId: xTrackId, keyId: freshKeyId }
			]);
		});

	test('preserves unrelated tracks and cleans temporary keys when an axis returns to setup', () => {
		const base = projectWithClip();
		const yTrack = createTrack(base.project, clipId, { kind: 'bone-transform', targetId: fixtureIds.root, property: 'y' }, idFactoryFor([yTrackId]));

		if (!yTrack.ok) {
			throw new Error(yTrack.error.message);
		}

		const yKey = addNumberKey(yTrack.value, clipId, yTrackId, { timeSeconds: 0.2, value: 70 }, idFactoryFor([yKeyId]));

		if (!yKey.ok) {
			throw new Error(yKey.error.message);
		}

		const xPlan = planCanvasAnimation({
			project: yKey.value,
			baseProject: yKey.value,
			clipId,
			frameIndex: 5,
			autoKey: true,
			setupCommands: [{ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: transformForRoot(yKey.value, { x: 120 }) }],
			changes: [rootChange('x', 100, 120)]
		}, idFactoryFor([freshTrackId, freshSeedKeyId, freshKeyId]));

		if (!xPlan.ok) {
			throw new Error(xPlan.error.message);
		}

		const xDraft = reduceCommands(yKey.value, xPlan.value.commands);
		const yPlan = planCanvasAnimation({
			project: xDraft,
			baseProject: yKey.value,
			clipId,
			frameIndex: 5,
			autoKey: true,
			setupCommands: [{ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: transformForRoot(xDraft, { x: 100, y: 55 }) }],
			changes: [rootChange('y', 50, 55)],
			previousChanges: [rootChange('x', 100, 120)]
		}, idFactoryFor([freshYKeyId]));

		if (!yPlan.ok) {
			throw new Error(yPlan.error.message);
		}

		expect(yPlan.value.cleanupCommands).toEqual([
			{ kind: 'delete-key', clipId, trackId: freshTrackId, keyId: freshKeyId },
			{ kind: 'delete-track', clipId, trackId: freshTrackId }
		]);
		const finalProject = reduceCommands(xDraft, yPlan.value.commands);
		const finalClip = finalProject.clips.find((candidate) => candidate.id === clipId);

		if (!finalClip) {
			throw new Error('The cleaned animation clip is unavailable.');
		}

		expect(finalClip.tracks).toHaveLength(1);
		expect(finalClip.tracks.some((track) => track.id === freshTrackId)).toBe(false);
		expect(finalClip.tracks.some((track) => track.id === yTrackId)).toBe(true);
		expect(finalClip.tracks.some((track) => track.kind === 'bone-transform' && track.property === 'y' && track.keys.some((key) => key.id === freshKeyId))).toBe(false);
	});

	test('returns deduplicated pending records and keeps explicit removal scoped', () => {
		const changes = [rootChange('x', 100, 120), rootChange('x', 100, 130), rootChange('y', 50, 60)];
		const pending = pendingEditsForChanges(changes);
		const merged = mergePendingAnimationEdits([{ targetId: fixtureIds.root, property: 'x' }], pending);

		expect(pending).toEqual([
			{ targetId: fixtureIds.root, property: 'x' },
			{ targetId: fixtureIds.root, property: 'y' }
		]);
		expect(merged).toEqual(pending);
		expect(removePendingAnimationEdits(merged, [{ targetId: fixtureIds.root, property: 'x' }])).toEqual([{ targetId: fixtureIds.root, property: 'y' }]);
		expect(mergePendingAnimationEdits([], [{ targetId: fixtureIds.image, property: 'opacity' }])).toEqual([{ targetId: fixtureIds.image, property: 'opacity' }]);

		const firstDraft = [{ targetId: fixtureIds.root, property: 'x' as const, value: 120, initialValue: 100 }];
		const replacedDraft = mergePendingAnimationValues(firstDraft, [{ targetId: fixtureIds.root, property: 'x', value: 140, initialValue: 120 }]);

		expect(replacedDraft).toEqual([{ targetId: fixtureIds.root, property: 'x', value: 140, initialValue: 100 }]);
		expect(removePendingAnimationValues(replacedDraft, [{ targetId: fixtureIds.root, property: 'x' }])).toEqual([]);

		const { project, clip } = projectWithClip();
		const plan = planCanvasAnimation({
			project,
			clipId: clip.id,
			frameIndex: 4,
			autoKey: false,
			setupCommands: [{ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: transformForRoot(project, { x: 120, y: 60 }) }],
			changes: [rootChange('x', 100, 120), rootChange('y', 50, 60)]
		}, idFactoryFor([]));

		if (!plan.ok) {
			throw new Error(plan.error.message);
		}

		expect(plan.value.animationCommands).toEqual([]);
		expect(plan.value.setupCommands).toEqual([]);
		expect(plan.value.commands).toEqual([]);
		expect(plan.value.pendingEdits).toEqual(pending);
	});
});

describe('canvas gesture history boundaries', () => {
	test('commits one undo entry, supports redo, and cancellation leaves no history', () => {
		const { project, clip } = projectWithClip();
		const initial = createHistory(project);
		const started = beginTransaction(initial);
		const plan = planCanvasAnimation({
			project: currentProject(started),
			baseProject: currentProject(started),
			clipId: clip.id,
			frameIndex: 5,
			autoKey: true,
			setupCommands: [{ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: transformForRoot(project, { x: 120 }) }],
			changes: [rootChange('x', 100, 120)]
		}, idFactoryFor([freshTrackId, freshSeedKeyId, freshKeyId]));

		if (!plan.ok) {
			throw new Error(plan.error.message);
		}

		const committed = commitTransaction(applyToHistory(started, plan.value.commands));

		expect(committed.past).toHaveLength(1);
		expect(committed.future).toHaveLength(0);
		const undone = undo(committed);

		expect(undone.present).toEqual(project);
		expect(undone.future).toHaveLength(1);
		expect(redo(undone).present).toEqual(committed.present);

		const cancelled = cancelTransaction(applyToHistory(started, plan.value.commands));

		expect(cancelled.transaction).toBeUndefined();
		expect(cancelled.present).toEqual(project);
		expect(cancelled.past).toHaveLength(0);
	});

	test('a final no-op resets the draft and produces no project, key, pending, or history change', () => {
		const { project, clip } = projectWithClip();
		const initial = createHistory(project);
		const started = beginTransaction(initial);
		const noOpPlan = planCanvasAnimation({
			project: currentProject(started),
			baseProject: project,
			clipId: clip.id,
			frameIndex: 5,
			autoKey: true,
			setupCommands: [{ kind: 'update-bone-transform', boneId: fixtureIds.root, transform: transformForRoot(project, {}) }],
			changes: []
		}, idFactoryFor([]));

		if (!noOpPlan.ok) {
			throw new Error(noOpPlan.error.message);
		}

		const reset = beginTransaction(cancelTransaction(started));
		const finished = commitTransaction(reset);

		expect(noOpPlan.value.commands).toHaveLength(0);
		expect(finished.present).toEqual(project);
		expect(finished.past).toHaveLength(0);
		expect(finished.future).toHaveLength(0);
		expect(finished.transaction).toBeUndefined();
		expect(pendingEditsForChanges(noOpPlan.value.changedProperties)).toEqual([]);
	});
});
