import { describe, expect, test } from 'bun:test';
import { keyDiamondLabelFor, keyDiamondPresentationFor } from '../../src/app/inspector-fields.tsx';
import type { PropertyKeyState } from '../../src/app/keying.ts';

const states: readonly PropertyKeyState[] = ['unkeyed', 'pending', 'keyed'];

describe('UX P1 key diamond presentation', () => {
	test('uses distinct hollow, pending, and filled glyphs', () => {
		expect(states.map((state) => keyDiamondPresentationFor(state))).toEqual([
			{ action: 'Add', glyph: '◇', stateLabel: 'Unkeyed' },
			{ action: 'Add', glyph: '◈', stateLabel: 'Pending' },
			{ action: 'Remove', glyph: '◆', stateLabel: 'Keyed' }
		]);
	});

	test('includes the property, one-based frame, and action in accessible labels', () => {
		expect(states.map((state) => keyDiamondLabelFor('Rotation', 6, state))).toEqual([
			'Add Rotation key at frame 7',
			'Add Rotation key at frame 7',
			'Remove Rotation key at frame 7'
		]);
	});
});
