import { describe, expect, test } from 'bun:test';
import {
	isEventPayload,
	MAX_EVENT_PAYLOAD_DEPTH,
	normalizeEventName
} from '../../src/domain/events.ts';

describe('event metadata validation', () => {
	test('normalizes bounded non-empty event names', () => {
		expect(normalizeEventName('  impact  ')).toBe('impact');
		expect(normalizeEventName('')).toBeUndefined();
		expect(normalizeEventName('x'.repeat(65))).toBeUndefined();
		expect(normalizeEventName(42)).toBeUndefined();
	});

	test('accepts bounded JSON payloads and rejects non-JSON values', () => {
		expect(isEventPayload({ damage: 4, tags: ['hit', { heavy: true }] })).toBe(true);
		expect(isEventPayload({ invalid: Number.NaN })).toBe(false);
		expect(isEventPayload({ '': true })).toBe(false);
		expect(isEventPayload({ nested: { value: { deeper: { still: { too: { deep: { value: 1 } } } } } } })).toBe(false);
		expect(MAX_EVENT_PAYLOAD_DEPTH).toBe(6);
	});
});
