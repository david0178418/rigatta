import { describe, expect, test } from 'bun:test';
import { shortcutActionFor, shortcutLabelFor, shortcutReference, type ShortcutKeyState } from '../../src/app/shortcuts.ts';

const key = function key(value: string, overrides: Partial<ShortcutKeyState> = {}): ShortcutKeyState {
	return {
		key: value,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		altKey: false,
		...overrides
	};
};

describe('editor keyboard shortcuts', () => {
	test('maps history and playback keys', () => {
		expect(shortcutActionFor(key('z', { ctrlKey: true }))).toBe('undo');
		expect(shortcutActionFor(key('z', { metaKey: true, shiftKey: true }))).toBe('redo');
		expect(shortcutActionFor(key('y', { ctrlKey: true }))).toBe('redo');
		expect(shortcutActionFor(key(' '))).toBe('toggle-playback');
		expect(shortcutActionFor(key('ArrowLeft'))).toBe('step-backward');
		expect(shortcutActionFor(key('ArrowRight'))).toBe('step-forward');
		expect(shortcutActionFor(key('?'))).toBe('open-reference');
	});

	test('does not claim modified or alternate navigation keys', () => {
		expect(shortcutActionFor(key('ArrowRight', { shiftKey: true }))).toBeUndefined();
		expect(shortcutActionFor(key(' ', { ctrlKey: true }))).toBeUndefined();
		expect(shortcutActionFor(key('z', { altKey: true, ctrlKey: true }))).toBeUndefined();
	});

	test('maps only shifted platform C/V shortcuts to pose actions', () => {
		const copyCases = [
			key('c', { ctrlKey: true, shiftKey: true }),
			key('c', { metaKey: true, shiftKey: true })
		] as const;
		const pasteCases = [
			key('v', { ctrlKey: true, shiftKey: true }),
			key('v', { metaKey: true, shiftKey: true })
		] as const;

		copyCases.forEach((event) => expect(shortcutActionFor(event)).toBe('copy-pose'));
		pasteCases.forEach((event) => expect(shortcutActionFor(event)).toBe('paste-pose'));
	});

	test('does not map unshifted or Alt-modified C/V shortcuts to pose actions', () => {
		const events = [
			key('c', { ctrlKey: true }),
			key('c', { metaKey: true }),
			key('v', { ctrlKey: true }),
			key('v', { metaKey: true }),
			key('c', { ctrlKey: true, shiftKey: true, altKey: true }),
			key('c', { metaKey: true, shiftKey: true, altKey: true }),
			key('v', { ctrlKey: true, shiftKey: true, altKey: true }),
			key('v', { metaKey: true, shiftKey: true, altKey: true }),
			key('c', { ctrlKey: true, altKey: true }),
			key('v', { metaKey: true, altKey: true })
		] as const;

		events.forEach((event) => expect(shortcutActionFor(event)).toBeUndefined());
	});

	test('maps the documented W/E/R/T tools and editing actions', () => {
		expect(shortcutActionFor(key('w'))).toBe('tool-translate');
		expect(shortcutActionFor(key('e'))).toBe('tool-rotate');
		expect(shortcutActionFor(key('r'))).toBe('tool-scale');
		expect(shortcutActionFor(key('t'))).toBe('tool-shear');
		expect(shortcutActionFor(key('F2'))).toBe('rename-selection');
		expect(shortcutActionFor(key('Delete'))).toBe('delete-selection');
		expect(shortcutActionFor(key('Backspace'))).toBe('delete-selection');
		expect(shortcutActionFor(key('K'))).toBe('key-selection');
		expect(shortcutActionFor(key('Escape'))).toBe('cancel');
		expect(shortcutActionFor(key('PageUp'))).toBe('select-previous');
		expect(shortcutActionFor(key('PageDown'))).toBe('select-next');
	});

	test('does not retain the competing legacy transform mapping', () => {
		expect(shortcutActionFor(key('v'))).toBeUndefined();
		expect(shortcutActionFor(key('c'))).toBeUndefined();
		expect(shortcutActionFor(key('x'))).toBeUndefined();
		expect(shortcutActionFor(key('z'))).toBeUndefined();
	});

	test('publishes one reference entry for every global action and the W/E/R/T labels', () => {
		const globalActions = new Set(shortcutReference.filter((entry) => entry.scope === 'global').map((entry) => entry.id));

		expect(globalActions).toEqual(new Set([
			'undo',
			'redo',
			'toggle-playback',
			'step-backward',
			'step-forward',
			'open-reference',
			'tool-translate',
			'tool-rotate',
			'tool-scale',
			'tool-shear',
			'rename-selection',
			'delete-selection',
			'key-selection',
			'copy-pose',
			'paste-pose',
			'cancel',
			'select-previous',
			'select-next',
			'pan-canvas'
		]));
		expect(shortcutLabelFor('tool-translate')).toBe('W');
		expect(shortcutLabelFor('tool-rotate')).toBe('E');
		expect(shortcutLabelFor('tool-scale')).toBe('R');
		expect(shortcutLabelFor('tool-shear')).toBe('T');
	});
});
