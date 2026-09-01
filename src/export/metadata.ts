import { EXPORT_METADATA_SCHEMA_VERSION } from '../domain/schema.ts';
import type { EntityId } from '../domain/ids.ts';
import type { Point } from '../domain/coordinates.ts';
import type { EventPayload, Clip, Project } from '../domain/model.ts';
import type { SampledClipFrame } from './sampling.ts';
import { validateProject } from '../domain/validation.ts';

export type MetadataEvent = Readonly<{
	id: EntityId;
	name: string;
	payload: EventPayload;
}>;

export type MetadataPoint = Readonly<{
	x: number;
	y: number;
	enabled: boolean;
}>;

export type MetadataRectangle = Readonly<{
	corners: readonly [Point, Point, Point, Point];
	width: number;
	height: number;
	rotation: number;
	enabled: boolean;
}>;

export type CompanionMetadataFrame = Readonly<{
	index: number;
	timeSeconds: number;
	frameKey: string;
	atlasPage: number;
	events: readonly MetadataEvent[];
	points: Readonly<Record<EntityId, MetadataPoint>>;
	rectangles: Readonly<Record<EntityId, MetadataRectangle>>;
}>;

export type CompanionMetadataClip = Readonly<{
	fps: number;
	durationSeconds: number;
	loop: boolean;
	frames: readonly CompanionMetadataFrame[];
}>;

export type CompanionMetadata = Readonly<{
	schemaVersion: typeof EXPORT_METADATA_SCHEMA_VERSION;
	logicalCanvas: Readonly<{ width: number; height: number }>;
	clips: Readonly<Record<string, CompanionMetadataClip>>;
}>;

export type MetadataClipInput = Readonly<{
	clip: Clip;
	frames: readonly SampledClipFrame[];
	frameKeys: readonly string[];
	atlasPages: readonly number[];
}>;

export type MetadataResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

const success = function success<TValue>(value: TValue): MetadataResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(error: string): MetadataResult<never> {
	return { ok: false, error };
};

const compareIds = function compareIds(left: string, right: string): number {
	return left === right ? 0 : left < right ? -1 : 1;
};

const eventFrameIndex = function eventFrameIndex(
	clip: Clip,
	eventTimeSeconds: number,
	frameCount: number
): number {
	const rawIndex = Math.floor(eventTimeSeconds * clip.fps + Number.EPSILON);

	return Math.max(0, Math.min(frameCount - 1, rawIndex));
};

const eventsForFrame = function eventsForFrame(
	clip: Clip,
	frameIndex: number,
	frameCount: number
): readonly MetadataEvent[] {
	return [...clip.events]
		.sort((left, right) => left.timeSeconds - right.timeSeconds || compareIds(left.id, right.id))
		.filter((event) => eventFrameIndex(clip, event.timeSeconds, frameCount) === frameIndex)
		.map((event) => ({ id: event.id, name: event.name, payload: event.payload }));
};

const pointMetadata = function pointMetadata(frame: SampledClipFrame): Readonly<Record<EntityId, MetadataPoint>> {
	return Object.fromEntries(frame.gameplay.points.map((point) => [point.id, {
		x: point.position.x,
		y: point.position.y,
		enabled: point.enabled
	}]));
};

const rectangleMetadata = function rectangleMetadata(
	frame: SampledClipFrame
): Readonly<Record<EntityId, MetadataRectangle>> {
	return Object.fromEntries(frame.gameplay.rectangles.map((rectangle) => [rectangle.id, {
		corners: rectangle.corners,
		width: rectangle.width,
		height: rectangle.height,
		rotation: rectangle.rotation,
		enabled: rectangle.enabled
	}]));
};

const clipInputError = function clipInputError(
	project: Project,
	inputs: readonly MetadataClipInput[]
): string | undefined {
	const projectDiagnostics = validateProject(project);
	const inputClipIds = inputs.map((input) => input.clip.id);

	if (projectDiagnostics.length > 0) {
		return projectDiagnostics[0]?.message ?? 'Project validation failed.';
	}
	if (new Set(inputClipIds).size !== inputClipIds.length) {
		return 'Metadata clip inputs must be unique.';
	}
	if (inputs.some((input) => !project.clips.some((clip) => clip.id === input.clip.id))) {
		return 'Metadata clip inputs must belong to the project.';
	}
	if (inputs.some((input) => input.clip.name.trim().length === 0)) {
		return 'Metadata clip names must be non-empty.';
	}
	if (new Set(inputs.map((input) => input.clip.name)).size !== inputs.length) {
		return 'Metadata clip names must be unique.';
	}

	return inputs.some((input) => input.frames.length === 0
		|| input.frameKeys.length !== input.frames.length
		|| input.atlasPages.length !== input.frames.length)
		? 'Metadata frame, key, and page arrays must have matching non-empty lengths.'
		: undefined;
};

const frameInputError = function frameInputError(
	input: MetadataClipInput,
	allFrameKeys: readonly string[]
): string | undefined {
	if (input.frameKeys.some((key) => key.trim().length === 0)) {
		return 'Metadata frame keys must be non-empty.';
	}
	if (input.atlasPages.some((page) => !Number.isInteger(page) || page < 0)) {
		return 'Metadata atlas page indexes must be nonnegative integers.';
	}
	if (new Set(allFrameKeys).size !== allFrameKeys.length) {
		return 'Metadata frame keys must be unique across clips.';
	}

	return input.frames.some((frame, index) => frame.index !== index
		|| frame.clipId !== input.clip.id
		|| frame.gameplay.clipId !== input.clip.id
		|| !Number.isFinite(frame.timeSeconds))
		? 'Metadata samples must be ordered, finite frames from their owning clip.'
		: undefined;
};

export const createCompanionMetadata = function createCompanionMetadata(
	project: Project,
	inputs: readonly MetadataClipInput[]
): MetadataResult<CompanionMetadata> {
	const inputError = clipInputError(project, inputs);

	if (inputError) {
		return failure(inputError);
	}

	const allFrameKeys = inputs.flatMap((input) => input.frameKeys);
	const frameError = inputs.map((input) => frameInputError(input, allFrameKeys)).find((error) => error !== undefined);

	if (frameError) {
		return failure(frameError);
	}

	const inputsByClipId = new Map(inputs.map((input) => [input.clip.id, input] as const));
	const clips = Object.fromEntries(project.clips.flatMap((clip) => {
		const input = inputsByClipId.get(clip.id);

		if (!input) {
			return [];
		}

		return [[clip.name, {
			fps: clip.fps,
			durationSeconds: clip.durationSeconds,
			loop: clip.loop,
			frames: input.frames.map((frame, index) => ({
				index: frame.index,
				timeSeconds: frame.timeSeconds,
				frameKey: input.frameKeys[index] ?? '',
				atlasPage: input.atlasPages[index] ?? 0,
				events: eventsForFrame(clip, frame.index, input.frames.length),
				points: pointMetadata(frame),
				rectangles: rectangleMetadata(frame)
			}))
		}] as const];
	}));

	return success({
		schemaVersion: EXPORT_METADATA_SCHEMA_VERSION,
		logicalCanvas: project.logicalCanvas,
		clips
	});
};
