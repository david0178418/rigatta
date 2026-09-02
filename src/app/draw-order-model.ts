import type { EntityId } from '../domain/ids.ts';
import type { Clip, Project, SlotDrawOrderTrack } from '../domain/model.ts';
import { frameIndexForTime } from './timeline.ts';

export type DrawOrderSource = 'setup' | 'keyed';

export type DrawOrderView = Readonly<{
	order: readonly EntityId[];
	source: DrawOrderSource;
	keyId?: EntityId;
	keyFrameIndex?: number;
}>;

const safeFrameIndex = function safeFrameIndex(frameIndex: number): number {
	return Number.isFinite(frameIndex) ? Math.max(0, Math.floor(frameIndex)) : 0;
};

const drawOrderTrackFor = function drawOrderTrackFor(clip: Clip | undefined): SlotDrawOrderTrack | undefined {
	const track = clip?.tracks.find((candidate) => candidate.kind === 'slot-draw-order');

	return track?.kind === 'slot-draw-order' ? track : undefined;
};

const precedingDrawOrderKeyFor = function precedingDrawOrderKeyFor(
	clip: Clip | undefined,
	frameIndex: number
): SlotDrawOrderTrack['keys'][number] | undefined {
	const track = drawOrderTrackFor(clip);

	if (!clip || !track || !Number.isFinite(clip.fps) || clip.fps <= 0) {
		return undefined;
	}

	const timeSeconds = safeFrameIndex(frameIndex) / clip.fps;

	return [...track.keys]
		.sort((left, right) => left.timeSeconds - right.timeSeconds)
		.findLast((key) => key.timeSeconds <= timeSeconds);
};

const projectSlotIds = function projectSlotIds(project: Project): readonly EntityId[] {
	return project.slots.map((slot) => slot.id);
};

const uniqueKnownSlotIds = function uniqueKnownSlotIds(
	project: Project,
	order: readonly EntityId[]
): readonly EntityId[] {
	const slotIds = projectSlotIds(project);

	return order.filter((slotId, index) => slotIds.includes(slotId) && order.indexOf(slotId) === index);
};

/**
 * Returns a complete, stable slot order for presentation. Valid project data
 * already contains every slot exactly once; the fallback keeps the panel
 * useful while validation reports an incomplete imported order.
 */
export const completeDrawOrder = function completeDrawOrder(
	project: Project,
	order: readonly EntityId[]
): readonly EntityId[] {
	const knownOrder = uniqueKnownSlotIds(project, order);
	const fallbackOrder = uniqueKnownSlotIds(project, [...project.setupDrawOrder, ...projectSlotIds(project)]);

	return [...knownOrder, ...fallbackOrder.filter((slotId) => !knownOrder.includes(slotId))];
};

export const drawOrderViewForFrame = function drawOrderViewForFrame(
	project: Project,
	clip: Clip | undefined,
	frameIndex: number
): DrawOrderView {
	const key = precedingDrawOrderKeyFor(clip, frameIndex);
	const order = completeDrawOrder(project, key?.value ?? project.setupDrawOrder);

	if (!key || !clip) {
		return { order, source: 'setup' };
	}

	return {
		order,
		source: 'keyed',
		keyId: key.id,
		keyFrameIndex: frameIndexForTime(clip, key.timeSeconds)
	};
};

export const reorderDrawOrder = function reorderDrawOrder(
	order: readonly EntityId[],
	slotId: EntityId,
	targetIndex: number
): readonly EntityId[] {
	if (!order.includes(slotId)) {
		return order;
	}

	const withoutSlot = order.filter((candidate) => candidate !== slotId);
	const safeTargetIndex = Number.isFinite(targetIndex) ? Math.floor(targetIndex) : 0;
	const boundedIndex = Math.max(0, Math.min(withoutSlot.length, safeTargetIndex));

	return [...withoutSlot.slice(0, boundedIndex), slotId, ...withoutSlot.slice(boundedIndex)];
};
