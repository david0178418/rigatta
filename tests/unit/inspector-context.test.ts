import { describe, expect, test } from 'bun:test';
import {
	attachmentSwapInspectorContext,
	clipInspectorContext,
	drawOrderInspectorContext,
	entityInspectorContext,
	eventInspectorContext,
	inspectorContextKind,
	keyInspectorContext,
	noInspectorContext,
	trackInspectorContext
} from '../../src/app/inspector-context.ts';
import type { TimelineKeyReference } from '../../src/app/timeline-model.ts';
import type { SelectableEntity } from '../../src/app/selection.ts';

const ids = {
	clip: '123e4567-e89b-42d3-a456-426614174001',
	track: '123e4567-e89b-42d3-a456-426614174002',
	key: '123e4567-e89b-42d3-a456-426614174003',
	event: '123e4567-e89b-42d3-a456-426614174004',
	slot: '123e4567-e89b-42d3-a456-426614174005'
} as const;

describe('typed inspector contexts', () => {
	test('keeps each editing context independent from entity selection', () => {
		const selection: SelectableEntity[] = [{ kind: 'bone', id: ids.track }];
		const keys: readonly TimelineKeyReference[] = [{ trackId: ids.track, keyId: ids.key }];
		const contexts = [
			noInspectorContext(),
			entityInspectorContext(selection),
			clipInspectorContext(ids.clip),
			trackInspectorContext(ids.clip, ids.track),
			keyInspectorContext(ids.clip, keys),
			eventInspectorContext(ids.clip, ids.event),
			drawOrderInspectorContext(ids.clip, ids.track, ids.key),
			attachmentSwapInspectorContext(ids.clip, ids.track, ids.key, ids.slot)
		];

		expect(contexts.map(inspectorContextKind)).toEqual([
			'none',
			'entity',
			'clip',
			'track',
			'key',
			'event',
			'draw-order',
			'attachment-swap'
		]);
	});

	test('copies mutable selection and key input arrays at the context boundary', () => {
		const selection: SelectableEntity[] = [{ kind: 'bone', id: ids.track }];
		const keys: TimelineKeyReference[] = [{ trackId: ids.track, keyId: ids.key }];
		const entityContext = entityInspectorContext(selection);
		const keyContext = keyInspectorContext(ids.clip, keys);

		selection.push({ kind: 'slot', id: ids.slot });
		keys.push({ trackId: ids.track, keyId: ids.event });

		expect(entityContext.selection).toHaveLength(1);
		expect(keyContext.keys).toHaveLength(1);
	});
});
