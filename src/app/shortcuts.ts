export type ShortcutAction =
	| 'undo'
	| 'redo'
	| 'toggle-playback'
	| 'step-backward'
	| 'step-forward'
	| 'open-reference';

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

	return undefined;
};
