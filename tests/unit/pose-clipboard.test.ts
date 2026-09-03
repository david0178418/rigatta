import { describe, expect, test } from 'bun:test';
import {
	addNumberKey,
	createClip,
	createTrack,
	setNumberKeyInterpolation
} from '../../src/domain/animation.ts';
import { reduceProject, type ProjectCommand } from '../../src/domain/commands.ts';
import { evaluatePose, type EvaluatedPose } from '../../src/domain/pose.ts';
import { createEmptyProject, type Clip, type Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import {
	createPoseClipboard,
	isPoseClipboard,
	planPastePoseClipboard,
	poseTransformProperties,
	type PoseClipboard,
	type PoseClipboardResult
} from '../../src/app/pose-clipboard.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const generatedId = function generatedId(index: number): string {
	return `123e4567-e89b-42d3-a456-${index.toString(16).padStart(12, '0')}`;
};

const ids = {
	sourceClip: generatedId(0x60),
	targetClip: generatedId(0x61),
	sourceXTrack: generatedId(0x100),
	sourceXStartKey: generatedId(0x101),
	sourceXEndKey: generatedId(0x102),
	sourceImageTrack: generatedId(0x103),
	sourceImageStartKey: generatedId(0x104),
	sourceImageEndKey: generatedId(0x105),
	targetRootXTrack: generatedId(0x110),
	targetRootXKey: generatedId(0x111),
	targetRootYTrack: generatedId(0x112),
	targetRootRotationTrack: generatedId(0x113),
	targetRootRotationKey: generatedId(0x114),
	targetImageXTrack: generatedId(0x115),
	targetImageXKey: generatedId(0x116)
} as const;

type Fixture = Readonly<{
	project: Project;
	sourceClip: Clip;
	targetClip: Clip;
}>;

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (result.ok === false) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const unwrapClipboard = function unwrapClipboard<TValue>(result: PoseClipboardResult<TValue>): TValue {
	if (result.ok === false) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const clipFor = function clipFor(project: Project, clipId: string): Clip {
	const clip = project.clips.find((candidate) => candidate.id === clipId);

	if (!clip) {
		throw new Error(`Clip ${clipId} is unavailable.`);
	}

	return clip;
};

const idFactoryFor = function idFactoryFor(idsToReturn: readonly string[]): () => string {
	const iterator = idsToReturn[Symbol.iterator]();

	return function nextId(): string {
		const next = iterator.next();

		if (next.done) {
			throw new Error('The test ID allocation was exhausted.');
		}

		return next.value;
	};
};

const allocationIds = function allocationIds(start: number, count: number): readonly string[] {
	return Array.from({ length: count }, (_, index) => generatedId(start + index));
};

const applyCommands = function applyCommands(
	project: Project,
	commands: readonly ProjectCommand[]
): OperationResult<Project> {
	return commands.reduce<OperationResult<Project>>(
		(result, command) => result.ok ? reduceProject(result.value, command) : result,
		{ ok: true, value: project }
	);
};

const sourcePoseFor = function sourcePoseFor(
	project: Project,
	clip: Clip,
	frameIndex: number
): EvaluatedPose {
	const result = evaluatePose(project, clip.id, frameIndex / clip.fps);

	if (!result.pose) {
		throw new Error('The source fixture should produce an evaluated pose.');
	}

	return result.pose;
};

const sourceAndTargetFixture = function sourceAndTargetFixture(): Fixture {
	const withSourceClip = unwrap(createClip(createRigProject(), {
		name: 'source',
		durationSeconds: 2,
		fps: 10
	}, () => ids.sourceClip));
	const withSourceXTrack = unwrap(createTrack(withSourceClip, ids.sourceClip, {
		kind: 'bone-transform',
		targetId: fixtureIds.child,
		property: 'x'
	}, () => ids.sourceXTrack));
	const withSourceXStartKey = unwrap(addNumberKey(withSourceXTrack, ids.sourceClip, ids.sourceXTrack, {
		timeSeconds: 0,
		value: 10
	}, () => ids.sourceXStartKey));
	const withSourceXKeys = unwrap(addNumberKey(withSourceXStartKey, ids.sourceClip, ids.sourceXTrack, {
		timeSeconds: 1,
		value: 30
	}, () => ids.sourceXEndKey));
	const withSourceImageTrack = unwrap(createTrack(withSourceXKeys, ids.sourceClip, {
		kind: 'attachment-transform',
		targetId: fixtureIds.image,
		property: 'x'
	}, () => ids.sourceImageTrack));
	const withSourceImageStartKey = unwrap(addNumberKey(withSourceImageTrack, ids.sourceClip, ids.sourceImageTrack, {
		timeSeconds: 0,
		value: 0
	}, () => ids.sourceImageStartKey));
	const withSourceTracks = unwrap(addNumberKey(withSourceImageStartKey, ids.sourceClip, ids.sourceImageTrack, {
		timeSeconds: 1,
		value: 50
	}, () => ids.sourceImageEndKey));
	const project = unwrap(createClip(withSourceTracks, {
		name: 'target',
		durationSeconds: 2,
		fps: 10
	}, () => ids.targetClip));

	return {
		project,
		sourceClip: clipFor(project, ids.sourceClip),
		targetClip: clipFor(project, ids.targetClip)
	};
};

const clipboardFor = function clipboardFor(fixture: Fixture, frameIndex: number = 5): PoseClipboard {
	const pose = sourcePoseFor(fixture.project, fixture.sourceClip, frameIndex);

	return unwrapClipboard(createPoseClipboard(fixture.project, fixture.sourceClip, frameIndex, pose));
};

const isCommandKind = function isCommandKind<TKind extends ProjectCommand['kind']>(
	command: ProjectCommand,
	kind: TKind
): command is Extract<ProjectCommand, { kind: TKind }> {
	return command.kind === kind;
};

const commandsOfKind = function commandsOfKind<TKind extends ProjectCommand['kind']>(
	commands: readonly ProjectCommand[],
	kind: TKind
): readonly Extract<ProjectCommand, { kind: TKind }>[] {
	return commands.filter((command) => isCommandKind(command, kind));
};

const transformValueFor = function transformValueFor(
	clipboard: PoseClipboard,
	targetId: string,
	property: typeof poseTransformProperties[number]
): number {
	const entry = clipboard.transforms.find((candidate) => candidate.targetId === targetId);

	if (!entry) {
		throw new Error(`Clipboard target ${targetId} is unavailable.`);
	}

	return entry.transform[property];
};

describe('P1 pure pose clipboard model', () => {
	test('copies evaluated interpolated local transforms for every current entity', () => {
		const fixture = sourceAndTargetFixture();
		const before = structuredClone(fixture.project);
		const pose = sourcePoseFor(fixture.project, fixture.sourceClip, 5);
		const clipboard = unwrapClipboard(createPoseClipboard(fixture.project, fixture.sourceClip, 5, pose));
		const child = clipboard.transforms.find((entry) => entry.targetId === fixtureIds.child);
		const image = clipboard.transforms.find((entry) => entry.targetId === fixtureIds.image);

		expect(clipboard.transforms).toHaveLength(7);
		expect(child?.kind).toBe('bone');
		expect(child?.transform.x).toBe(20);
		expect(image?.kind).toBe('attachment');
		expect(image?.transform.x).toBe(25);
		expect(clipboard.sourceFrameIndex).toBe(5);
		expect(isPoseClipboard(clipboard)).toBe(true);
		clipboard.transforms.forEach((entry) => {
			expect(Object.keys(entry.transform)).toEqual([...poseTransformProperties]);
			expect(poseTransformProperties.every((property) => Number.isFinite(entry.transform[property]))).toBe(true);
		});
		expect(fixture.project).toEqual(before);
		expect(child?.transform).not.toBe(pose.bones.find((bone) => bone.id === fixtureIds.child)?.localTransform);
	});

	test('does not create a usable clipboard for a project with no pose entities', () => {
		const emptyProject = unwrap(createClip(createEmptyProject({ id: generatedId(0x800) }), {
			name: 'empty',
			durationSeconds: 1,
			fps: 10
		}, () => generatedId(0x801)));
		const emptyClip = clipFor(emptyProject, generatedId(0x801));
		const pose = sourcePoseFor(emptyProject, emptyClip, 0);
		const copied = createPoseClipboard(emptyProject, emptyClip, 0, pose);
		const emptyClipboard = {
			projectId: emptyProject.id,
			sourceClipId: emptyClip.id,
			sourceFrameIndex: 0,
			transforms: []
		};

		expect(copied).toMatchObject({ ok: false, error: { code: 'invalid-pose' } });
		expect(isPoseClipboard(emptyClipboard)).toBe(false);
		expect(planPastePoseClipboard(emptyProject, emptyClip, 0, emptyClipboard)).toMatchObject({
			ok: false,
			error: { code: 'invalid-clipboard' }
		});
	});

	test('rejects an evaluated pose outside the source clip even when frame rounding would match', () => {
		const fixture = sourceAndTargetFixture();
		const pose = sourcePoseFor(fixture.project, fixture.sourceClip, 0);
		const copied = createPoseClipboard(fixture.project, fixture.sourceClip, 0, {
			...pose,
			timeSeconds: -0.01
		});

		expect(copied).toMatchObject({ ok: false, error: { code: 'invalid-pose' } });
	});

	test('plans seven properties for every bone and attachment and creates an empty destination atomically', () => {
		const fixture = sourceAndTargetFixture();
		const clipboard = clipboardFor(fixture);
		const commands = unwrapClipboard(planPastePoseClipboard(
			fixture.project,
			fixture.targetClip,
			3,
			clipboard,
			idFactoryFor(allocationIds(0x200, 98))
		));
		const createTracks = commandsOfKind(commands.commands, 'create-track');
		const addKeys = commandsOfKind(commands.commands, 'add-number-key');
		const expectedEntities = [
			...fixture.project.bones.map((bone) => ({ kind: 'bone' as const, targetId: bone.id })),
			...fixture.project.attachments.map((attachment) => ({ kind: 'attachment' as const, targetId: attachment.id }))
		];
		const expectedDefinitions = expectedEntities.flatMap((entity) => poseTransformProperties.map((property) => ({
			kind: entity.kind === 'bone' ? 'bone-transform' as const : 'attachment-transform' as const,
			targetId: entity.targetId,
			property
		})));

		expect(commands.noOp).toBe(false);
		expect(commands.summary).toEqual({
			bones: 4,
			attachments: 3,
			tracksCreated: 49,
			keysCreated: 49,
			keysUpdated: 0,
			propertiesChanged: 49
		});
		expect(createTracks).toHaveLength(49);
		expect(addKeys).toHaveLength(49);
		expect(createTracks.map((command) => command.definition)).toEqual(expectedDefinitions);
		expect(commands.commands.flatMap((command) => 'id' in command ? [command.id] : [])).toEqual([...allocationIds(0x200, 98)]);
		expect(commands.commands.flatMap((command, index) => index % 2 === 0 && command.kind === 'create-track'
		? [commands.commands[index + 1]]
		: [])).toHaveLength(49);

		const applied = unwrap(applyCommands(fixture.project, commands.commands));
		const targetClip = clipFor(applied, fixture.targetClip.id);

		expect(targetClip.tracks).toHaveLength(49);
		targetClip.tracks.forEach((track) => {
			if (track.kind !== 'bone-transform' && track.kind !== 'attachment-transform') {
				throw new Error('Pose paste should create only transform tracks.');
			}

			expect(track.keys).toHaveLength(1);
			expect(track.keys[0]?.timeSeconds).toBe(0.3);
			expect(track.keys[0]?.value).toBe(transformValueFor(clipboard, track.targetId, track.property));
		});
	});

	test('combines mixed tracks and keys while preserving existing timing and interpolation metadata', () => {
		const fixture = sourceAndTargetFixture();
		const rootRotation = transformValueFor(clipboardFor(fixture), fixtureIds.root, 'rotation');
		const withRootXTrack = unwrap(createTrack(fixture.project, fixture.targetClip.id, {
			kind: 'bone-transform',
			targetId: fixtureIds.root,
			property: 'x'
		}, () => ids.targetRootXTrack));
		const withRootXKey = unwrap(addNumberKey(withRootXTrack, fixture.targetClip.id, ids.targetRootXTrack, {
			timeSeconds: 0.49,
			value: -20
		}, () => ids.targetRootXKey));
		const withRootXMetadata = unwrap(setNumberKeyInterpolation(withRootXKey, fixture.targetClip.id, ids.targetRootXTrack, ids.targetRootXKey, {
			interpolation: 'bezier',
			curve: { x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.9 }
		}));
		const withRootYTrack = unwrap(createTrack(withRootXMetadata, fixture.targetClip.id, {
			kind: 'bone-transform',
			targetId: fixtureIds.root,
			property: 'y'
		}, () => ids.targetRootYTrack));
		const withRootRotationTrack = unwrap(createTrack(withRootYTrack, fixture.targetClip.id, {
			kind: 'bone-transform',
			targetId: fixtureIds.root,
			property: 'rotation'
		}, () => ids.targetRootRotationTrack));
		const withRootRotationKey = unwrap(addNumberKey(withRootRotationTrack, fixture.targetClip.id, ids.targetRootRotationTrack, {
			timeSeconds: 0.5,
			value: rootRotation
		}, () => ids.targetRootRotationKey));
		const withImageXTrack = unwrap(createTrack(withRootRotationKey, fixture.targetClip.id, {
			kind: 'attachment-transform',
			targetId: fixtureIds.image,
			property: 'x'
		}, () => ids.targetImageXTrack));
		const project = unwrap(addNumberKey(withImageXTrack, fixture.targetClip.id, ids.targetImageXTrack, {
			timeSeconds: 0.5,
			value: transformValueFor(clipboardFor(fixture), fixtureIds.image, 'x')
		}, () => ids.targetImageXKey));
		const targetClip = clipFor(project, fixture.targetClip.id);
		const clipboard = clipboardFor({ ...fixture, project, targetClip });
		const projectBefore = structuredClone(project);
		const clipboardBefore = structuredClone(clipboard);
		const plan = unwrapClipboard(planPastePoseClipboard(
			project,
			targetClip,
			5,
			clipboard,
			idFactoryFor(allocationIds(0x300, 91))
		));
		const setCommands = commandsOfKind(plan.commands, 'set-number-key');
		const addCommands = commandsOfKind(plan.commands, 'add-number-key');
		const createCommands = commandsOfKind(plan.commands, 'create-track');
		const rootXUpdate = setCommands.find((command) => command.trackId === ids.targetRootXTrack);

		if (!rootXUpdate) {
			throw new Error('The existing root X key should be updated.');
		}

		expect(rootXUpdate).toEqual({
			kind: 'set-number-key',
			id: ids.targetRootXKey,
			clipId: fixture.targetClip.id,
			trackId: ids.targetRootXTrack,
			input: {
				timeSeconds: 0.49,
				value: transformValueFor(clipboard, fixtureIds.root, 'x'),
				interpolation: 'bezier',
				curve: { x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.9 }
			}
		});
		expect(setCommands.some((command) => command.trackId === ids.targetRootRotationTrack)).toBe(false);
		expect(setCommands.some((command) => command.trackId === ids.targetImageXTrack)).toBe(false);
		expect(addCommands.some((command) => command.trackId === ids.targetRootYTrack)).toBe(true);
		expect(createCommands.some((command) => command.definition.kind === 'bone-transform'
		&& command.definition.targetId === fixtureIds.root
		&& command.definition.property === 'scaleX')).toBe(true);
		expect(plan.commands.filter((command) => command.kind === 'set-number-key')).toHaveLength(1);
		expect(plan.commands.filter((command) => command.kind === 'create-track')).toHaveLength(45);
		expect(plan.commands.filter((command) => command.kind === 'add-number-key')).toHaveLength(46);
		expect(new Set(plan.commands.flatMap((command) => 'id' in command ? [command.id] : [])).size).toBe(plan.commands.length);
		expect(project).toEqual(projectBefore);
		expect(clipboard).toEqual(clipboardBefore);

		const applied = unwrap(applyCommands(project, plan.commands));
		const appliedTarget = clipFor(applied, targetClip.id);
		const appliedRootX = appliedTarget.tracks.find((track) => track.id === ids.targetRootXTrack);

		if (!appliedRootX || appliedRootX.kind !== 'bone-transform') {
			throw new Error('The updated root X track should remain available.');
		}

		expect(appliedRootX.keys[0]).toEqual({
			id: ids.targetRootXKey,
			timeSeconds: 0.49,
			value: transformValueFor(clipboard, fixtureIds.root, 'x'),
			interpolation: 'bezier',
			curve: { x1: 0.1, y1: 0.2, x2: 0.8, y2: 0.9 }
		});
	});

	test('suppresses a full value-identical paste without allocating IDs', () => {
		const fixture = sourceAndTargetFixture();
		const clipboard = clipboardFor(fixture);
		const firstPlan = unwrapClipboard(planPastePoseClipboard(
			fixture.project,
			fixture.targetClip,
			5,
			clipboard,
			idFactoryFor(allocationIds(0x400, 98))
		));
		const projectWithKeys = unwrap(applyCommands(fixture.project, firstPlan.commands));
		const targetWithKeys = clipFor(projectWithKeys, fixture.targetClip.id);
		const before = structuredClone(projectWithKeys);
		const secondPlan = unwrapClipboard(planPastePoseClipboard(
			projectWithKeys,
			targetWithKeys,
			5,
			clipboard,
			() => {
				throw new Error('A no-op paste must not allocate IDs.');
			}
		));

		expect(secondPlan).toEqual({
			commands: [],
			summary: {
				bones: 4,
				attachments: 3,
				tracksCreated: 0,
				keysCreated: 0,
				keysUpdated: 0,
				propertiesChanged: 0
			},
			noOp: true
		});
		expect(projectWithKeys).toEqual(before);
	});

	test('supports a cross-clip paste within one project and leaves source objects unchanged', () => {
		const fixture = sourceAndTargetFixture();
		const clipboard = clipboardFor(fixture);
		const projectBefore = structuredClone(fixture.project);
		const clipboardBefore = structuredClone(clipboard);
		const result = planPastePoseClipboard(
			fixture.project,
			fixture.targetClip,
			7,
			clipboard,
			idFactoryFor(allocationIds(0x500, 98))
		);

		expect(result.ok).toBe(true);
		if (result.ok === false) {
			throw new Error(result.error.message);
		}
		expect(result.value.commands.every((command) => 'clipId' in command && command.clipId === fixture.targetClip.id)).toBe(true);
		const applied = unwrap(applyCommands(fixture.project, result.value.commands));
		const appliedTarget = clipFor(applied, fixture.targetClip.id);
		expect(appliedTarget.tracks).toHaveLength(49);
		expect(appliedTarget.tracks.flatMap((track) => track.keys.map((key) => key.timeSeconds))).toEqual(
		Array.from({ length: 49 }, () => 0.7)
		);
		expect(fixture.project).toEqual(projectBefore);
		expect(clipboard).toEqual(clipboardBefore);
	});

	test('plans against the current destination clip when given a stale clip snapshot', () => {
		const fixture = sourceAndTargetFixture();
		const projectWithTrack = unwrap(createTrack(fixture.project, fixture.targetClip.id, {
			kind: 'bone-transform',
			targetId: fixtureIds.root,
			property: 'x'
		}, () => ids.targetRootXTrack));
		const currentTargetClip = clipFor(projectWithTrack, fixture.targetClip.id);
		const staleTargetClip: Clip = { ...currentTargetClip, tracks: [] };
		const clipboard = clipboardFor({
			...fixture,
			project: projectWithTrack,
			targetClip: currentTargetClip
		});
		const plan = unwrapClipboard(planPastePoseClipboard(
			projectWithTrack,
			staleTargetClip,
			5,
			clipboard,
			idFactoryFor(allocationIds(0x900, 97))
		));

		expect(plan.commands.some((command) => command.kind === 'create-track'
			&& command.definition.kind === 'bone-transform'
			&& command.definition.targetId === fixtureIds.root
			&& command.definition.property === 'x')).toBe(false);
		const applied = unwrap(applyCommands(projectWithTrack, plan.commands));
		const appliedTargetClip = clipFor(applied, fixture.targetClip.id);
		const appliedRootX = appliedTargetClip.tracks.find((track) => track.id === ids.targetRootXTrack);

		if (!appliedRootX || appliedRootX.kind !== 'bone-transform') {
			throw new Error('The current root X track should be updated.');
		}

		expect(appliedRootX.keys).toHaveLength(1);
		expect(appliedRootX.keys[0]?.timeSeconds).toBe(0.5);
	});

	test('rejects malformed, stale, mismatched, nonfinite, invalid-frame, and colliding-ID pastes atomically', () => {
		const fixture = sourceAndTargetFixture();
		const clipboard = clipboardFor(fixture);
		const rootEntry = clipboard.transforms.find((entry) => entry.targetId === fixtureIds.root);

		if (!rootEntry) {
			throw new Error('The root transform should be copied.');
		}

		const projectMismatch = planPastePoseClipboard(fixture.project, fixture.targetClip, 5, {
			...clipboard,
			projectId: generatedId(0x600)
		}, idFactoryFor(allocationIds(0x601, 98)));
		const missingEntity = planPastePoseClipboard(fixture.project, fixture.targetClip, 5, {
			...clipboard,
			transforms: clipboard.transforms.map((entry) => entry.targetId === fixtureIds.root
				? { ...entry, targetId: generatedId(0x602) }
				: entry)
		}, idFactoryFor(allocationIds(0x603, 98)));
		const kindMismatch = planPastePoseClipboard(fixture.project, fixture.targetClip, 5, {
			...clipboard,
			transforms: clipboard.transforms.map((entry) => entry.targetId === fixtureIds.root
				? { ...entry, kind: 'attachment' as const }
				: entry)
		}, idFactoryFor(allocationIds(0x604, 98)));
		const duplicateEntity = planPastePoseClipboard(fixture.project, fixture.targetClip, 5, {
			...clipboard,
			transforms: clipboard.transforms.map((entry, index) => index === 1
				? { ...entry, targetId: fixtureIds.root }
				: entry)
		}, idFactoryFor(allocationIds(0x605, 98)));
		const nonfinite = planPastePoseClipboard(fixture.project, fixture.targetClip, 5, {
			...clipboard,
			transforms: clipboard.transforms.map((entry) => entry.targetId === fixtureIds.root
				? { ...entry, transform: { ...entry.transform, x: Number.NaN } }
				: entry)
		}, idFactoryFor(allocationIds(0x606, 98)));
		const malformed = planPastePoseClipboard(fixture.project, fixture.targetClip, 5, {
			projectId: fixture.project.id
		}, idFactoryFor(allocationIds(0x607, 98)));
		const empty = planPastePoseClipboard(fixture.project, fixture.targetClip, 5, {
			...clipboard,
			transforms: []
		}, idFactoryFor(allocationIds(0x608, 98)));
		const invalidDestinationFrames = [-1, 1.5, 20, Number.NaN].map((frameIndex) => planPastePoseClipboard(
			fixture.project,
			fixture.targetClip,
			frameIndex,
			clipboard,
			idFactoryFor(allocationIds(0x609 + Math.max(0, frameIndex), 98))
		));
		const invalidSourceFrame = planPastePoseClipboard(fixture.project, fixture.targetClip, 5, {
			...clipboard,
			sourceFrameIndex: 20
		}, idFactoryFor(allocationIds(0x700, 98)));
		const missingSourceClip = planPastePoseClipboard(fixture.project, fixture.targetClip, 5, {
			...clipboard,
			sourceClipId: generatedId(0x702)
		}, idFactoryFor(allocationIds(0x703, 98)));
		const extraTransformProperty = planPastePoseClipboard(fixture.project, fixture.targetClip, 5, {
			...clipboard,
			transforms: clipboard.transforms.map((entry) => entry.targetId === fixtureIds.root
				? { ...entry, transform: { ...entry.transform, extra: 1 } }
				: entry)
		}, idFactoryFor(allocationIds(0x704, 98)));
		const collidingId = planPastePoseClipboard(
			fixture.project,
			fixture.targetClip,
			5,
			clipboard,
			idFactoryFor([fixture.project.id])
		);
		const invalidId = planPastePoseClipboard(
			fixture.project,
			fixture.targetClip,
			5,
			clipboard,
			idFactoryFor(['not-an-entity-id'])
		);
		const duplicateGeneratedId = planPastePoseClipboard(
			fixture.project,
			fixture.targetClip,
			5,
			clipboard,
			idFactoryFor([generatedId(0x701), generatedId(0x701)])
		);
		const projectBeforeAllocationFailure = structuredClone(fixture.project);
		const throwingAfterAllocation = planPastePoseClipboard(
			fixture.project,
			fixture.targetClip,
			5,
			clipboard,
			idFactoryFor(allocationIds(0x705, 3))
		);
		const invalidAfterAllocation = planPastePoseClipboard(
			fixture.project,
			fixture.targetClip,
			5,
			clipboard,
			idFactoryFor([generatedId(0x706), 'invalid-generated-id'])
		);
		const malformedUnknownValues: readonly unknown[] = [null, undefined, 0, {
			projectId: fixture.project.id,
			sourceClipId: fixture.sourceClip.id,
			sourceFrameIndex: 5,
			transforms: [undefined]
		}];

		expect(projectMismatch).toMatchObject({ ok: false, error: { code: 'project-mismatch' } });
		expect(missingEntity).toMatchObject({ ok: false, error: { code: 'incompatible-entity' } });
		expect(kindMismatch).toMatchObject({ ok: false, error: { code: 'incompatible-entity' } });
		expect(duplicateEntity).toMatchObject({ ok: false, error: { code: 'invalid-clipboard' } });
		expect(nonfinite).toMatchObject({ ok: false, error: { code: 'invalid-clipboard' } });
		expect(malformed).toMatchObject({ ok: false, error: { code: 'invalid-clipboard' } });
		expect(empty).toMatchObject({ ok: false, error: { code: 'invalid-clipboard' } });
		expect(invalidDestinationFrames.every((result) => result.ok === false && result.error.code === 'invalid-frame')).toBe(true);
		expect(invalidSourceFrame).toMatchObject({ ok: false, error: { code: 'invalid-frame' } });
		expect(missingSourceClip).toMatchObject({ ok: false, error: { code: 'invalid-clip' } });
		expect(extraTransformProperty).toMatchObject({ ok: false, error: { code: 'invalid-clipboard' } });
		expect(collidingId).toMatchObject({ ok: false, error: { code: 'duplicate-id' } });
		expect(invalidId).toMatchObject({ ok: false, error: { code: 'invalid-id' } });
		expect(duplicateGeneratedId).toMatchObject({ ok: false, error: { code: 'duplicate-id' } });
		expect(throwingAfterAllocation).toMatchObject({ ok: false, error: { code: 'invalid-id' } });
		expect(invalidAfterAllocation).toMatchObject({ ok: false, error: { code: 'invalid-id' } });
		expect(malformedUnknownValues.every((value) => !isPoseClipboard(value))).toBe(true);
		expect(fixture.project).toEqual(projectBeforeAllocationFailure);
		expect(rootEntry.transform.x).toBe(100);
	});
});
