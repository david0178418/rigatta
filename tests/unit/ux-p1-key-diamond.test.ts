import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, test } from 'bun:test';
import { KeyDiamond, keyDiamondLabelFor, keyDiamondPresentationFor } from '../../src/app/inspector-fields.tsx';
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

	test('shows the key action and state through the shared tooltip primitive', () => {
		const markup = renderToStaticMarkup(
			createElement(KeyDiamond, { frameIndex: 2, onToggle: () => undefined, property: 'Rotation', state: 'pending' })
		);

		expect(markup).toContain('role="tooltip"');
		expect(markup).toContain('Add Rotation key at frame 3 · Pending');
	});
});
