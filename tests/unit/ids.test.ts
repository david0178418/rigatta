import { describe, expect, test } from 'bun:test';
import { createEntityId, isEntityId, parseEntityId } from '../../src/domain/ids.ts';

describe('opaque entity IDs', () => {
	test('accepts lower-case UUID v4 IDs', () => {
		const id = '123e4567-e89b-42d3-a456-426614174000';

		expect(isEntityId(id)).toBe(true);
		expect(parseEntityId(id)).toBe(id);
	});

	test('rejects non-UUID IDs and semantic-looking values', () => {
		expect(isEntityId('root-bone')).toBe(false);
		expect(isEntityId('123e4567-e89b-12d3-a456-426614174000')).toBe(false);
		expect(parseEntityId(null)).toBeUndefined();
	});

	test('normalizes generated UUIDs without changing their identity', () => {
		const id = createEntityId(() => '123E4567-E89B-42D3-A456-426614174000');

		expect(id).toBe('123e4567-e89b-42d3-a456-426614174000');
	});

	test('rejects an invalid injected ID generator', () => {
		expect(() => createEntityId(() => 'bone-root')).toThrow(RangeError);
	});
});
