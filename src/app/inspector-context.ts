import type { EntityId } from '../domain/ids.ts';
import type { Selection } from './selection.ts';
import type { TimelineKeyReference } from './timeline-model.ts';

/**
 * Inspector context is intentionally separate from the rig selection. A
 * timeline key or event can remain the editing target while the related rig
 * entity is selected for navigation in the canvas/tree.
 */
export type InspectorContextKind =
	| 'none'
	| 'entity'
	| 'clip'
	| 'track'
	| 'key'
	| 'event'
	| 'draw-order'
	| 'attachment-swap';

export type EntityInspectorContext = Readonly<{
	kind: 'entity';
	selection: Selection;
}>;

export type ClipInspectorContext = Readonly<{
	kind: 'clip';
	clipId: EntityId;
}>;

export type TrackInspectorContext = Readonly<{
	kind: 'track';
	clipId: EntityId;
	trackId: EntityId;
}>;

export type KeyInspectorContext = Readonly<{
	kind: 'key';
	clipId: EntityId;
	keys: readonly TimelineKeyReference[];
}>;

export type EventInspectorContext = Readonly<{
	kind: 'event';
	clipId: EntityId;
	eventId: EntityId;
}>;

export type DrawOrderInspectorContext = Readonly<{
	kind: 'draw-order';
	clipId: EntityId;
	trackId: EntityId;
	keyId: EntityId;
}>;

export type AttachmentSwapInspectorContext = Readonly<{
	kind: 'attachment-swap';
	clipId: EntityId;
	trackId: EntityId;
	keyId: EntityId;
	slotId: EntityId;
}>;

export type InspectorContext =
	| Readonly<{ kind: 'none' }>
	| EntityInspectorContext
	| ClipInspectorContext
	| TrackInspectorContext
	| KeyInspectorContext
	| EventInspectorContext
	| DrawOrderInspectorContext
	| AttachmentSwapInspectorContext;

export const noInspectorContext = function noInspectorContext(): InspectorContext {
	return { kind: 'none' };
};

export const entityInspectorContext = function entityInspectorContext(selection: Selection): EntityInspectorContext {
	return { kind: 'entity', selection: [...selection] };
};

export const clipInspectorContext = function clipInspectorContext(clipId: EntityId): ClipInspectorContext {
	return { kind: 'clip', clipId };
};

export const trackInspectorContext = function trackInspectorContext(
	clipId: EntityId,
	trackId: EntityId
): TrackInspectorContext {
	return { kind: 'track', clipId, trackId };
};

export const keyInspectorContext = function keyInspectorContext(
	clipId: EntityId,
	keys: readonly TimelineKeyReference[]
): KeyInspectorContext {
	return { kind: 'key', clipId, keys: keys.map((key) => ({ ...key })) };
};

export const eventInspectorContext = function eventInspectorContext(
	clipId: EntityId,
	eventId: EntityId
): EventInspectorContext {
	return { kind: 'event', clipId, eventId };
};

export const drawOrderInspectorContext = function drawOrderInspectorContext(
	clipId: EntityId,
	trackId: EntityId,
	keyId: EntityId
): DrawOrderInspectorContext {
	return { kind: 'draw-order', clipId, trackId, keyId };
};

export const attachmentSwapInspectorContext = function attachmentSwapInspectorContext(
	clipId: EntityId,
	trackId: EntityId,
	keyId: EntityId,
	slotId: EntityId
): AttachmentSwapInspectorContext {
	return { kind: 'attachment-swap', clipId, trackId, keyId, slotId };
};

export const inspectorContextKind = function inspectorContextKind(
	context: InspectorContext
): InspectorContextKind {
	return context.kind;
};
