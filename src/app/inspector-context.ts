import type { EntityId } from '../domain/ids.ts';
import type { Selection } from './selection.ts';
import type { TimelineKeyReference } from './timeline-model.ts';

export type InspectorContext =
	| Readonly<{ kind: 'none' }>
	| Readonly<{ kind: 'entity'; selection: Selection }>
	| Readonly<{ kind: 'clip'; clipId: EntityId }>
	| Readonly<{ kind: 'track'; clipId: EntityId; trackId: EntityId }>
	| Readonly<{ kind: 'key'; clipId: EntityId; keys: readonly TimelineKeyReference[] }>
	| Readonly<{ kind: 'event'; clipId: EntityId; eventId: EntityId }>
	| Readonly<{ kind: 'draw-order'; clipId: EntityId; trackId: EntityId; keyId: EntityId }>
	| Readonly<{ kind: 'attachment-swap'; clipId: EntityId; trackId: EntityId; keyId: EntityId; slotId: EntityId }>;

export const noInspectorContext = function noInspectorContext(): InspectorContext {
	return { kind: 'none' };
};

export const entityInspectorContext = function entityInspectorContext(selection: Selection): InspectorContext {
	return { kind: 'entity', selection };
};

export const keyInspectorContext = function keyInspectorContext(
	clipId: EntityId,
	keys: readonly TimelineKeyReference[]
): InspectorContext {
	return { kind: 'key', clipId, keys };
};
