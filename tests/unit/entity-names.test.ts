import { describe, expect, test } from 'bun:test';
import { nextAvailableName } from '../../src/app/entity-names.ts';

describe('editor entity names', () => {
	test('keeps the first generated name readable and adds a suffix for collisions', () => {
		expect(nextAvailableName('bone', [])).toBe('bone');
		expect(nextAvailableName('bone', ['bone'])).toBe('bone 2');
		expect(nextAvailableName('bone', ['bone', 'bone 2'])).toBe('bone 3');
	});

	test('compares trimmed existing labels', () => {
		expect(nextAvailableName('slot', [' slot '])).toBe('slot 2');
	});
});
