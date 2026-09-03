import { createEntityId, type EntityId } from '../domain/ids.ts';
import { reduceProject, type ProjectCommand } from '../domain/commands.ts';
import type { Clip, NumberKey, Project, Track } from '../domain/model.ts';
import type { OperationResult } from '../domain/operations.ts';
import {
	autoKeyCommandsForProperty,
	trackDefinitionForProperty,
	type KeyableProperty
} from './keying.ts';
import type { CanvasGesturePropertyChange } from './transform-gesture.ts';

export type CanvasPendingAnimationEdit = Readonly<{
	targetId: EntityId;
	property: KeyableProperty;
}>;

export type CanvasAnimationIdAllocation = Readonly<{
	targetId: EntityId;
	property: KeyableProperty;
	trackId?: EntityId;
	keyId?: EntityId;
}>;

export type CanvasAnimationPlanInput = Readonly<{
	project: Project;
	baseProject?: Project;
	clipId?: EntityId;
	frameIndex: number;
	autoKey: boolean;
	setupCommands: readonly ProjectCommand[];
	changes: readonly CanvasGesturePropertyChange[];
	previousChanges?: readonly CanvasGesturePropertyChange[];
	allocatedIds?: readonly CanvasAnimationIdAllocation[];
}>;

export type CanvasAnimationPlan = Readonly<{
	cleanupCommands: readonly ProjectCommand[];
	setupCommands: readonly ProjectCommand[];
	animationCommands: readonly ProjectCommand[];
	commands: readonly ProjectCommand[];
	changedProperties: readonly CanvasGesturePropertyChange[];
	keyedProperties: readonly CanvasGesturePropertyChange[];
	pendingEdits: readonly CanvasPendingAnimationEdit[];
	allocatedIds: readonly CanvasAnimationIdAllocation[];
}>;

const sameProperty = function sameProperty(
	left: Readonly<{ targetId: EntityId; property: KeyableProperty }>,
	right: Readonly<{ targetId: EntityId; property: KeyableProperty }>
): boolean {
	return left.targetId === right.targetId && left.property === right.property;
};

const uniqueChanges = function uniqueChanges(
	changes: readonly CanvasGesturePropertyChange[]
): readonly CanvasGesturePropertyChange[] {
	return changes.reduce<readonly CanvasGesturePropertyChange[]>((unique, change) => (
		unique.some((candidate) => sameProperty(candidate, change))
			? unique
			: [...unique, change]
	), []);
};

const uniquePendingEdits = function uniquePendingEdits(
	edits: readonly CanvasPendingAnimationEdit[]
): readonly CanvasPendingAnimationEdit[] {
	return edits.reduce<readonly CanvasPendingAnimationEdit[]>((unique, edit) => (
		unique.some((candidate) => sameProperty(candidate, edit))
			? unique
			: [...unique, edit]
	), []);
};

const idFactoryForIds = function idFactoryForIds(ids: readonly EntityId[]): () => EntityId {
	const iterator = ids[Symbol.iterator]();

	return function nextId(): EntityId {
		const next = iterator.next();

		if (next.done) {
			throw new Error('The canvas animation ID allocation was exhausted.');
		}

		return next.value;
	};
};

export const pendingEditsForChanges = function pendingEditsForChanges(
	changes: readonly CanvasGesturePropertyChange[]
): readonly CanvasPendingAnimationEdit[] {
	return uniquePendingEdits(changes.map(({ targetId, property }) => ({ targetId, property })));
};

export const mergePendingAnimationEdits = function mergePendingAnimationEdits(
	current: readonly CanvasPendingAnimationEdit[],
	additions: readonly CanvasPendingAnimationEdit[]
): readonly CanvasPendingAnimationEdit[] {
	return uniquePendingEdits([...current, ...additions]);
};

export const removePendingAnimationEdits = function removePendingAnimationEdits(
	current: readonly CanvasPendingAnimationEdit[],
	removed: readonly CanvasPendingAnimationEdit[]
): readonly CanvasPendingAnimationEdit[] {
	return current.filter((candidate) => !removed.some((edit) => sameProperty(candidate, edit)));
};

const clipFor = function clipFor(project: Project, clipId: EntityId): Clip | undefined {
	return project.clips.find((clip) => clip.id === clipId);
};

const trackForProperty = function trackForProperty(
	clip: Clip,
	project: Project,
	change: CanvasGesturePropertyChange
): Track | undefined {
	const definition = trackDefinitionForProperty(project, change.targetId, change.property);

	return definition
		? clip.tracks.find((track) => (
			track.kind === definition.kind
			&& (!('targetId' in definition) || ('targetId' in track && track.targetId === definition.targetId))
			&& (!('property' in definition) || ('property' in track && track.property === definition.property))
		))
		: undefined;
};

const keyAtFrame = function keyAtFrame(
	clip: Clip,
	track: Track,
	frameIndex: number
): NumberKey | undefined {
	const key = track.keys.find((candidate) => Math.round(candidate.timeSeconds * clip.fps) === frameIndex);

	return key && 'value' in key && typeof key.value === 'number' ? key : undefined;
};

const restoreCommandsForChange = function restoreCommandsForChange(
	project: Project,
	baseProject: Project | undefined,
	clipId: EntityId | undefined,
	frameIndex: number,
	change: CanvasGesturePropertyChange
): readonly ProjectCommand[] {
	if (!baseProject || clipId === undefined) {
		return [];
	}

	const currentClip = clipFor(project, clipId);
	const baseClip = clipFor(baseProject, clipId);

	if (!currentClip || !baseClip) {
		return [];
	}

	const baseTrack = trackForProperty(baseClip, baseProject, change);
	const currentTrack = trackForProperty(currentClip, project, change);
	const baseKey = baseTrack ? keyAtFrame(baseClip, baseTrack, frameIndex) : undefined;
	const currentKey = currentTrack ? keyAtFrame(currentClip, currentTrack, frameIndex) : undefined;

	if (baseKey && currentTrack && currentKey) {
		return [{
			kind: 'set-number-key',
			id: currentKey.id,
			clipId,
			trackId: currentTrack.id,
			input: {
				timeSeconds: baseKey.timeSeconds,
				value: baseKey.value,
				interpolation: baseKey.interpolation,
				curve: baseKey.curve
			}
		}];
	}

	if (baseKey && currentTrack && !currentKey) {
		return [{
			kind: 'add-number-key',
			id: baseKey.id,
			clipId,
			trackId: currentTrack.id,
			input: {
				timeSeconds: baseKey.timeSeconds,
				value: baseKey.value,
				interpolation: baseKey.interpolation,
				curve: baseKey.curve
			}
		}];
	}

	if (!baseKey && currentTrack && currentKey) {
		return [
			{ kind: 'delete-key', clipId, trackId: currentTrack.id, keyId: currentKey.id },
			...(baseTrack ? [] : [{ kind: 'delete-track' as const, clipId, trackId: currentTrack.id }])
		];
	}

	return [];
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

type AnimationCommandState = Readonly<{
	project: Project;
	commands: readonly ProjectCommand[];
	keyedProperties: readonly CanvasGesturePropertyChange[];
	allocatedIds: readonly CanvasAnimationIdAllocation[];
}>;

const allocationFor = function allocationFor(
	allocations: readonly CanvasAnimationIdAllocation[],
	change: CanvasGesturePropertyChange
): CanvasAnimationIdAllocation | undefined {
	return allocations.find((allocation) => sameProperty(allocation, change));
};

const replaceAllocation = function replaceAllocation(
	allocations: readonly CanvasAnimationIdAllocation[],
	allocation: CanvasAnimationIdAllocation
): readonly CanvasAnimationIdAllocation[] {
	return [...allocations.filter((candidate) => !sameProperty(candidate, allocation)), allocation];
};

const animationCommandsFor = function animationCommandsFor(
	project: Project,
	clipId: EntityId,
	frameIndex: number,
	changes: readonly CanvasGesturePropertyChange[],
	idFactory: () => EntityId,
	initialAllocations: readonly CanvasAnimationIdAllocation[]
): OperationResult<AnimationCommandState> {
	return changes.reduce<OperationResult<AnimationCommandState>>((result, change) => {
		if (!result.ok) {
			return result;
		}

		const clip = clipFor(result.value.project, clipId);

		if (!clip) {
			return {
				ok: false,
				error: { code: 'not-found', message: 'The animation clip is no longer available.' }
			};
		}

		const definition = trackDefinitionForProperty(result.value.project, change.targetId, change.property);

		if (!definition) {
			return result;
		}

		const track = trackForProperty(clip, result.value.project, change);
		const key = track ? keyAtFrame(clip, track, frameIndex) : undefined;
		const previousAllocation = allocationFor(result.value.allocatedIds, change);
		const trackId = track?.id ?? previousAllocation?.trackId ?? idFactory();
		const keyId = key?.id ?? previousAllocation?.keyId ?? idFactory();
		const generatedIds = [
			...(track ? [] : [trackId]),
			...(key ? [] : [keyId])
		];

		const commands = autoKeyCommandsForProperty(
			result.value.project,
			clip,
			change.targetId,
			change.property,
			frameIndex,
			idFactoryForIds(generatedIds),
			change.value
		);

		if (commands.length === 0) {
			return result;
		}

		const nextProject = applyCommands(result.value.project, commands);
		const allocation: CanvasAnimationIdAllocation = {
			targetId: change.targetId,
			property: change.property,
			...(track ? previousAllocation?.trackId ? { trackId: previousAllocation.trackId } : {} : { trackId }),
			...(key ? previousAllocation?.keyId ? { keyId: previousAllocation.keyId } : {} : { keyId })
		};

		return nextProject.ok
			? {
				ok: true,
				value: {
					project: nextProject.value,
					commands: [...result.value.commands, ...commands],
					keyedProperties: [...result.value.keyedProperties, change],
					allocatedIds: replaceAllocation(result.value.allocatedIds, allocation)
				}
			}
			: nextProject;
	}, {
		ok: true,
		value: { project, commands: [], keyedProperties: [], allocatedIds: initialAllocations }
	});
};

export const planCanvasAnimation = function planCanvasAnimation(
	input: CanvasAnimationPlanInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<CanvasAnimationPlan> {
	const changes = uniqueChanges(input.changes);
	const previousChanges = uniqueChanges(input.previousChanges ?? []);
	const staleChanges = previousChanges.filter((previous) => !changes.some((change) => sameProperty(previous, change)));
	const cleanupCommands = staleChanges.flatMap((change) => restoreCommandsForChange(input.project, input.baseProject, input.clipId, input.frameIndex, change));
	const cleanupResult = applyCommands(input.project, cleanupCommands);

	if (!cleanupResult.ok) {
		return cleanupResult;
	}

	const setupResult = applyCommands(cleanupResult.value, input.setupCommands);

	if (!setupResult.ok) {
		return setupResult;
	}

	const animationResult = input.autoKey && input.clipId !== undefined
		? animationCommandsFor(setupResult.value, input.clipId, input.frameIndex, changes, idFactory, input.allocatedIds ?? [])
		: { ok: true as const, value: { project: setupResult.value, commands: [], keyedProperties: [], allocatedIds: input.allocatedIds ?? [] } };

	if (!animationResult.ok) {
		return animationResult;
	}

	return {
		ok: true,
		value: {
			cleanupCommands,
			setupCommands: input.setupCommands,
			animationCommands: animationResult.value.commands,
			commands: [...cleanupCommands, ...input.setupCommands, ...animationResult.value.commands],
			changedProperties: changes,
			keyedProperties: animationResult.value.keyedProperties,
			pendingEdits: pendingEditsForChanges(changes),
			allocatedIds: animationResult.value.allocatedIds
		}
	};
};
