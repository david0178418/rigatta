import { createEntityId, type EntityId } from '../domain/ids.ts';
import type { ProjectCommand } from '../domain/commands.ts';
import type { BoneTransformProperty, Clip, Project, Track } from '../domain/model.ts';
import type { TrackDefinition } from '../domain/animation.ts';

export type KeyableProperty = BoneTransformProperty | 'opacity' | 'width' | 'height';
export type PropertyKeyState = 'unkeyed' | 'pending' | 'keyed';

export type KeyingContext = Readonly<{
	project: Project;
	clip?: Clip;
	targetId: EntityId;
	property: KeyableProperty;
	frameIndex: number;
	autoKey: boolean;
	pendingEdits?: readonly Readonly<{ targetId: EntityId; property: KeyableProperty }>[];
}>;

export type KeyingPlan = Readonly<{
	state: PropertyKeyState;
	commands: readonly ProjectCommand[];
	reason?: string;
}>;

const isTransformProperty = function isTransformProperty(
	property: KeyableProperty
): property is BoneTransformProperty {
	return property === 'x'
		|| property === 'y'
		|| property === 'rotation'
		|| property === 'scaleX'
		|| property === 'scaleY'
		|| property === 'shearX'
		|| property === 'shearY';
};

const trackMatchesDefinition = function trackMatchesDefinition(
	track: Track,
	definition: TrackDefinition
): boolean {
	if (track.kind !== definition.kind) {
		return false;
	}

	return (!('targetId' in definition) || ('targetId' in track && track.targetId === definition.targetId))
		&& (!('property' in definition) || ('property' in track && track.property === definition.property));
};

export const trackDefinitionForProperty = function trackDefinitionForProperty(
	project: Project,
	targetId: EntityId,
	property: KeyableProperty
): TrackDefinition | undefined {
	if (project.bones.some((bone) => bone.id === targetId) && isTransformProperty(property)) {
		return { kind: 'bone-transform', targetId, property };
	}

	const attachment = project.attachments.find((candidate) => candidate.id === targetId);

	if (!attachment) {
		return undefined;
	}
	if (isTransformProperty(property)) {
		return { kind: 'attachment-transform', targetId, property };
	}
	if (property === 'opacity' && attachment.kind === 'image') {
		return { kind: 'attachment-opacity', targetId };
	}
	if ((property === 'width' || property === 'height') && attachment.kind === 'rectangle') {
		return { kind: 'rectangle-size', targetId, property };
	}

	return undefined;
};

const valueForProperty = function valueForProperty(
	project: Project,
	targetId: EntityId,
	property: KeyableProperty
): number | undefined {
	const bone = project.bones.find((candidate) => candidate.id === targetId);

	if (bone && isTransformProperty(property)) {
		return bone.transform[property];
	}

	const attachment = project.attachments.find((candidate) => candidate.id === targetId);

	if (!attachment) {
		return undefined;
	}
	if (isTransformProperty(property)) {
		return attachment.transform[property];
	}
	if (property === 'opacity' && attachment.kind === 'image') {
		return attachment.opacity;
	}
	if (property === 'width' && attachment.kind === 'rectangle') {
		return attachment.width;
	}
	if (property === 'height' && attachment.kind === 'rectangle') {
		return attachment.height;
	}

	return undefined;
};

const keyAtFrame = function keyAtFrame(
	clip: Clip,
	track: Track,
	frameIndex: number
): Readonly<{ id: EntityId }> | undefined {
	return track.keys.find((key) => Math.round(key.timeSeconds * clip.fps) === frameIndex);
};

export const propertyKeyState = function propertyKeyState(context: KeyingContext): PropertyKeyState {
	const pending = context.pendingEdits?.some((edit) => edit.targetId === context.targetId && edit.property === context.property);

	if (pending) {
		return 'pending';
	}

	const definition = trackDefinitionForProperty(context.project, context.targetId, context.property);
	const track = context.clip?.tracks.find((candidate) => definition && trackMatchesDefinition(candidate, definition));

	return context.clip && track && keyAtFrame(context.clip, track, context.frameIndex)
		? 'keyed'
		: 'unkeyed';
};

const commandsForKey = function commandsForKey(
	context: KeyingContext,
	definition: TrackDefinition,
	track: Track | undefined,
	value: number,
	idFactory: () => EntityId
): readonly ProjectCommand[] {
	const clip = context.clip;

	if (!clip) {
		return [];
	}

	const trackId = track?.id ?? idFactory();

	return [
		...(track ? [] : [{ kind: 'create-track' as const, id: trackId, clipId: clip.id, definition }]),
		{
			kind: 'set-number-key' as const,
			id: idFactory(),
			clipId: clip.id,
			trackId,
			input: {
				timeSeconds: Math.max(0, context.frameIndex) / clip.fps,
				value,
				interpolation: 'linear' as const,
				curve: null
			}
		}
	];
};

export const planPropertyKeyToggle = function planPropertyKeyToggle(
	context: KeyingContext,
	idFactory: () => EntityId = createEntityId
): KeyingPlan {
	const state = propertyKeyState(context);
	const definition = trackDefinitionForProperty(context.project, context.targetId, context.property);

	if (!context.clip) {
		return { state, commands: [], reason: 'Create or select an animation clip before keying a property.' };
	}
	if (!definition) {
		return { state, commands: [], reason: 'This property is not animatable for the selected entity.' };
	}

	const track = context.clip.tracks.find((candidate) => trackMatchesDefinition(candidate, definition));
	const key = track ? keyAtFrame(context.clip, track, context.frameIndex) : undefined;

	if (key && track) {
		return {
			state,
			commands: [{ kind: 'delete-key', clipId: context.clip.id, trackId: track.id, keyId: key.id }]
		};
	}

	const value = valueForProperty(context.project, context.targetId, context.property);

	return value === undefined
		? { state, commands: [], reason: 'The selected property value is unavailable.' }
		: {
			state,
			commands: commandsForKey(context, definition, track, value, idFactory)
		};
};

export const propertyValueForKeying = valueForProperty;

export const autoKeyCommandsForProperty = function autoKeyCommandsForProperty(
	project: Project,
	clip: Clip,
	targetId: EntityId,
	property: KeyableProperty,
	frameIndex: number,
	idFactory: () => EntityId = createEntityId,
	valueOverride?: number
): readonly ProjectCommand[] {
	const context: KeyingContext = {
		project,
		clip,
		targetId,
		property,
		frameIndex,
		autoKey: true
	};
	const definition = trackDefinitionForProperty(project, targetId, property);
	const value = valueOverride ?? valueForProperty(project, targetId, property);

	return definition && value !== undefined
		? commandsForKey(context, definition, clip.tracks.find((track) => trackMatchesDefinition(track, definition)), value, idFactory)
		: [];
};
