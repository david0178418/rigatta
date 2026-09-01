import type { Project, Track } from '../domain/model.ts';

export type TimelineViewport = Readonly<{
	startFrame: number;
	pixelsPerFrame: number;
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
