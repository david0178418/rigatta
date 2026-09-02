export type ShortcutAction =
	| 'undo'
	| 'redo'
	| 'toggle-playback'
	| 'step-backward'
	| 'step-forward'
	| 'open-reference'
	| 'rename-selection'
	| 'delete-selection'
	| 'key-selection'
	| 'cancel'
	| 'select-previous'
	| 'select-next'
	| 'tool-translate'
	| 'tool-rotate'
	| 'tool-scale'
	| 'tool-shear';

export type ShortcutKeyState = Readonly<{
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
}>;

export const shortcutActionFor = function shortcutActionFor(
	event: ShortcutKeyState
): ShortcutAction | undefined {
	if (event.altKey) {
		return undefined;
	}

	const key = event.key.toLowerCase();
	const modifier = event.ctrlKey || event.metaKey;

	if (modifier && key === 'z') {
		return event.shiftKey ? 'redo' : 'undo';
	}
	if (modifier && key === 'y') {
		return 'redo';
	}
	if (!modifier && !event.shiftKey && key === ' ') {
		return 'toggle-playback';
	}
	if (!modifier && !event.shiftKey && key === 'arrowleft') {
		return 'step-backward';
	}
	if (!modifier && !event.shiftKey && key === 'arrowright') {
		return 'step-forward';
	}
	if (!modifier && key === '?') {
		return 'open-reference';
	}
	if (!modifier && !event.shiftKey && key === 'f2') {
		return 'rename-selection';
	}
	if (!modifier && !event.shiftKey && (key === 'delete' || key === 'backspace')) {
		return 'delete-selection';
	}
	if (!modifier && !event.shiftKey && key === 'k') {
		return 'key-selection';
	}
	if (!modifier && key === 'escape') {
		return 'cancel';
	}
	if (!modifier && !event.shiftKey && key === 'pageup') {
		return 'select-previous';
	}
	if (!modifier && !event.shiftKey && key === 'pagedown') {
		return 'select-next';
	}
	if (!modifier && !event.shiftKey && key === 'w') {
		return 'tool-translate';
	}
	if (!modifier && !event.shiftKey && key === 'e') {
		return 'tool-rotate';
	}
	if (!modifier && !event.shiftKey && key === 'r') {
		return 'tool-scale';
	}
	if (!modifier && !event.shiftKey && key === 't') {
		return 'tool-shear';
	}

	return undefined;
};
