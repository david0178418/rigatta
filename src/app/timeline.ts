import type { BoneTransformProperty, Clip, Project, Track } from '../domain/model.ts';
import type { EntityId } from '../domain/ids.ts';
import type { TrackDefinition } from '../domain/animation.ts';

export type TimelineViewport = Readonly<{
	startFrame: number;
	pixelsPerFrame: number;
}>;

export type TimelineTrackRow = Readonly<{
	track: Track;
	label: string;
	keys: readonly Readonly<{ id: EntityId; frameIndex: number }>[];
}>;

export type TrackDefinitionOption = Readonly<{
	value: string;
	label: string;
	definition: TrackDefinition;
}>;

export const DEFAULT_TIMELINE_WIDTH = 640;
export const DEFAULT_TIMELINE_PIXELS_PER_FRAME = 32;

const MIN_TIMELINE_PIXELS_PER_FRAME = 8;
const MAX_TIMELINE_PIXELS_PER_FRAME = 128;

const clamp = function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
};

const validFrameCount = function validFrameCount(frameCount: number): number {
	return Math.max(1, Math.floor(frameCount));
};

export const createTimelineViewport = function createTimelineViewport(): TimelineViewport {
	return { startFrame: 0, pixelsPerFrame: DEFAULT_TIMELINE_PIXELS_PER_FRAME };
};

export const visibleFrameCount = function visibleFrameCount(
	viewport: TimelineViewport,
	frameCount: number,
	width: number = DEFAULT_TIMELINE_WIDTH
): number {
	const safeFrameCount = validFrameCount(frameCount);
	const safeWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_TIMELINE_WIDTH;

	return Math.max(1, Math.min(safeFrameCount, Math.floor(safeWidth / viewport.pixelsPerFrame)));
};

export const timelineFrameRange = function timelineFrameRange(
	viewport: TimelineViewport,
	frameCount: number,
	width: number = DEFAULT_TIMELINE_WIDTH
): Readonly<{ startFrame: number; endFrame: number }> {
	const safeFrameCount = validFrameCount(frameCount);
	const count = visibleFrameCount(viewport, safeFrameCount, width);
	const startFrame = clamp(Math.floor(viewport.startFrame), 0, Math.max(0, safeFrameCount - count));

	return { startFrame, endFrame: Math.min(safeFrameCount - 1, startFrame + count - 1) };
};

export const panTimeline = function panTimeline(
	viewport: TimelineViewport,
	deltaPixels: number,
	frameCount: number,
	width: number = DEFAULT_TIMELINE_WIDTH
): TimelineViewport {
	const range = timelineFrameRange(viewport, frameCount, width);
	const count = range.endFrame - range.startFrame + 1;
	const safeDelta = Number.isFinite(deltaPixels) ? deltaPixels : 0;
	const maximumStart = Math.max(0, validFrameCount(frameCount) - count);
	const startFrame = clamp(
		Math.round(range.startFrame - safeDelta / viewport.pixelsPerFrame),
		0,
		maximumStart
	);

	return { ...viewport, startFrame };
};

export const zoomTimeline = function zoomTimeline(
	viewport: TimelineViewport,
	direction: -1 | 1,
	anchorFrame: number,
	frameCount: number,
	width: number = DEFAULT_TIMELINE_WIDTH
): TimelineViewport {
	const scale = direction > 0 ? 1.25 : 0.8;
	const pixelsPerFrame = clamp(
		viewport.pixelsPerFrame * scale,
		MIN_TIMELINE_PIXELS_PER_FRAME,
		MAX_TIMELINE_PIXELS_PER_FRAME
	);
	const safeAnchor = Number.isFinite(anchorFrame) ? anchorFrame : 0;
	const anchorOffset = safeAnchor - viewport.startFrame;
	const nextStart = Math.round(safeAnchor - anchorOffset * viewport.pixelsPerFrame / pixelsPerFrame);
	const nextViewport = { startFrame: nextStart, pixelsPerFrame };
	const range = timelineFrameRange(nextViewport, frameCount, width);

	return { ...nextViewport, startFrame: range.startFrame };
};

export const resetTimelineViewport = function resetTimelineViewport(): TimelineViewport {
	return createTimelineViewport();
};

const targetName = function targetName(project: Project, targetId: string): string {
	return project.bones.find((bone) => bone.id === targetId)?.name
		?? project.slots.find((slot) => slot.id === targetId)?.name
		?? project.attachments.find((attachment) => attachment.id === targetId)?.name
		?? targetId;
};

export const trackLabel = function trackLabel(project: Project, track: Track): string {
	const labels: Readonly<Record<Track['kind'], string>> = {
		'bone-transform': 'Bone transform',
		'attachment-transform': 'Image transform',
		'attachment-opacity': 'Image opacity',
		'slot-attachment': 'Slot attachment',
		'slot-draw-order': 'Draw order',
		'point-enabled': 'Point enabled',
		'rectangle-size': 'Rectangle size',
		'rectangle-enabled': 'Rectangle enabled'
	};
	const property = 'property' in track ? ` · ${track.property}` : '';
	const target = 'targetId' in track ? ` · ${targetName(project, track.targetId)}` : '';

	return `${labels[track.kind]}${property}${target}`;
};

const frameIndexForTime = function frameIndexForTime(clip: Clip, timeSeconds: number): number {
	return clamp(Math.round(timeSeconds * clip.fps), 0, Math.max(0, Math.ceil(clip.durationSeconds * clip.fps) - 1));
};

export const buildTimelineTrackRows = function buildTimelineTrackRows(
	project: Project,
	clip: Clip,
	filter: string = ''
): readonly TimelineTrackRow[] {
	const query = filter.trim().toLowerCase();

	return clip.tracks
		.filter((track) => trackLabel(project, track).toLowerCase().includes(query))
		.map((track) => ({
			track,
			label: trackLabel(project, track),
			keys: track.keys.map((key) => ({ id: key.id, frameIndex: frameIndexForTime(clip, key.timeSeconds) }))
		}));
};

const transformProperties: readonly BoneTransformProperty[] = [
	'x',
	'y',
	'rotation',
	'scaleX',
	'scaleY',
	'shearX',
	'shearY'
];

const definitionMatchesTrack = function definitionMatchesTrack(
	track: Track,
	definition: TrackDefinition
): boolean {
	if (track.kind !== definition.kind) {
		return false;
	}

	const targetMatches = !('targetId' in definition)
		|| ('targetId' in track && track.targetId === definition.targetId);
	const propertyMatches = !('property' in definition)
		|| ('property' in track && track.property === definition.property);

	return targetMatches && propertyMatches;
};

const option = function option(
	value: string,
	label: string,
	definition: TrackDefinition
): TrackDefinitionOption {
	return { value, label, definition };
};

export const availableTrackDefinitions = function availableTrackDefinitions(
	project: Project,
	clip: Clip
): readonly TrackDefinitionOption[] {
	const boneOptions = project.bones.flatMap((bone) => transformProperties.map((property) => option(
		`bone:${bone.id}:${property}`,
		`${bone.name} · Bone · ${property}`,
		{ kind: 'bone-transform', targetId: bone.id, property }
	)));
	const imageOptions = project.attachments
		.filter((attachment) => attachment.kind === 'image')
		.flatMap((attachment) => [
			...transformProperties.map((property) => option(
				`attachment:${attachment.id}:${property}`,
				`${attachment.name} · Image · ${property}`,
				{ kind: 'attachment-transform', targetId: attachment.id, property }
			)),
			option(
				`opacity:${attachment.id}`,
				`${attachment.name} · Image · opacity`,
				{ kind: 'attachment-opacity', targetId: attachment.id }
			)
		]);
	const slotOptions = project.slots.flatMap((slot) => [option(
		`slot:${slot.id}`,
		`${slot.name} · Attachment`,
		{ kind: 'slot-attachment', targetId: slot.id }
	)]);
	const pointOptions = project.attachments
		.filter((attachment) => attachment.kind === 'point')
		.map((attachment) => option(
			`point:${attachment.id}`,
			`${attachment.name} · Point · enabled`,
			{ kind: 'point-enabled', targetId: attachment.id }
		));
	const rectangleOptions = project.attachments
		.filter((attachment) => attachment.kind === 'rectangle')
		.flatMap((attachment) => [
			option(
				`rectangle-width:${attachment.id}`,
				`${attachment.name} · Rectangle · width`,
				{ kind: 'rectangle-size', targetId: attachment.id, property: 'width' }
			),
			option(
				`rectangle-height:${attachment.id}`,
				`${attachment.name} · Rectangle · height`,
				{ kind: 'rectangle-size', targetId: attachment.id, property: 'height' }
			),
			option(
				`rectangle-enabled:${attachment.id}`,
				`${attachment.name} · Rectangle · enabled`,
				{ kind: 'rectangle-enabled', targetId: attachment.id }
			)
		]);
	const drawOrderOptions = project.slots.length > 0
		? [option('draw-order', 'Setup · Draw order', { kind: 'slot-draw-order' })]
		: [];
	const options = [...boneOptions, ...imageOptions, ...slotOptions, ...drawOrderOptions, ...pointOptions, ...rectangleOptions];

	return options.filter((candidate) => !clip.tracks.some((track) => definitionMatchesTrack(track, candidate.definition)));
};
