import { describe, expect, test } from 'bun:test';
import { shortcutActionFor, type ShortcutKeyState } from '../../src/app/shortcuts.ts';

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
});
