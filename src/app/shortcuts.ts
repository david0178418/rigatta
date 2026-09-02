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

export type ShortcutReferenceAction =
	| ShortcutAction
	| 'pan-canvas'
	| 'copy-timeline-keys'
	| 'paste-timeline-keys'
	| 'nudge-timeline-keys'
	| 'resize-timeline';

export type ShortcutReferenceEntry = Readonly<{
	id: ShortcutReferenceAction;
	keys: string;
	action: string;
	description: string;
	scope: 'global' | 'timeline' | 'timeline-splitter';
}>;

type ShortcutBinding = Readonly<{
	keys: readonly string[];
	modifier: 'none' | 'platform';
	shift: 'none' | 'required' | 'any';
	action: ShortcutAction;
}>;

const globalShortcutBindings: readonly ShortcutBinding[] = [
	{ keys: ['z'], modifier: 'platform', shift: 'required', action: 'redo' },
	{ keys: ['z'], modifier: 'platform', shift: 'none', action: 'undo' },
	{ keys: ['y'], modifier: 'platform', shift: 'any', action: 'redo' },
	{ keys: [' '], modifier: 'none', shift: 'none', action: 'toggle-playback' },
	{ keys: ['arrowleft'], modifier: 'none', shift: 'none', action: 'step-backward' },
	{ keys: ['arrowright'], modifier: 'none', shift: 'none', action: 'step-forward' },
	{ keys: ['?'], modifier: 'none', shift: 'any', action: 'open-reference' },
	{ keys: ['f2'], modifier: 'none', shift: 'none', action: 'rename-selection' },
	{ keys: ['delete', 'backspace'], modifier: 'none', shift: 'none', action: 'delete-selection' },
	{ keys: ['k'], modifier: 'none', shift: 'none', action: 'key-selection' },
	{ keys: ['escape'], modifier: 'none', shift: 'any', action: 'cancel' },
	{ keys: ['pageup'], modifier: 'none', shift: 'none', action: 'select-previous' },
	{ keys: ['pagedown'], modifier: 'none', shift: 'none', action: 'select-next' },
	{ keys: ['w'], modifier: 'none', shift: 'none', action: 'tool-translate' },
	{ keys: ['e'], modifier: 'none', shift: 'none', action: 'tool-rotate' },
	{ keys: ['r'], modifier: 'none', shift: 'none', action: 'tool-scale' },
	{ keys: ['t'], modifier: 'none', shift: 'none', action: 'tool-shear' }
];

export const shortcutReference: readonly ShortcutReferenceEntry[] = [
	{ id: 'undo', keys: 'Ctrl/Cmd + Z', action: 'Undo', description: 'Undo the most recent project change.', scope: 'global' },
	{ id: 'redo', keys: 'Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y', action: 'Redo', description: 'Redo the most recently undone project change.', scope: 'global' },
	{ id: 'toggle-playback', keys: 'Space', action: 'Play / pause', description: 'Play or pause the active animation clip.', scope: 'global' },
	{ id: 'step-backward', keys: 'Left Arrow', action: 'Step backward', description: 'Move the active clip back one frame.', scope: 'global' },
	{ id: 'step-forward', keys: 'Right Arrow', action: 'Step forward', description: 'Move the active clip forward one frame.', scope: 'global' },
	{ id: 'open-reference', keys: '?', action: 'Open shortcut reference', description: 'Open this reference panel.', scope: 'global' },
	{ id: 'tool-translate', keys: 'W', action: 'Move / translate tool', description: 'Choose the Move tool for canvas transforms.', scope: 'global' },
	{ id: 'tool-rotate', keys: 'E', action: 'Rotate tool', description: 'Choose the Rotate tool for canvas transforms.', scope: 'global' },
	{ id: 'tool-scale', keys: 'R', action: 'Scale tool', description: 'Choose the Scale tool for canvas transforms.', scope: 'global' },
	{ id: 'tool-shear', keys: 'T', action: 'Shear tool', description: 'Choose the Shear tool for canvas transforms.', scope: 'global' },
	{ id: 'rename-selection', keys: 'F2', action: 'Rename selection', description: 'Start inline rename for the selected rig item.', scope: 'global' },
	{ id: 'delete-selection', keys: 'Delete / Backspace', action: 'Delete selection', description: 'Delete the selected rig item; in the timeline, delete selected keys.', scope: 'global' },
	{ id: 'key-selection', keys: 'K', action: 'Key edited properties', description: 'In Animate mode, commit pending edited properties at the current frame.', scope: 'global' },
	{ id: 'cancel', keys: 'Escape', action: 'Cancel / clear', description: 'Cancel an active gesture or close a contextual surface; when idle, clear the selection.', scope: 'global' },
	{ id: 'select-previous', keys: 'Page Up', action: 'Previous selection', description: 'Restore the previous valid selection from selection history.', scope: 'global' },
	{ id: 'select-next', keys: 'Page Down', action: 'Next selection', description: 'Restore the next valid selection from selection history.', scope: 'global' },
	{ id: 'pan-canvas', keys: 'Space + primary drag or Middle drag', action: 'Pan canvas', description: 'Pan the viewport without changing the active transform tool.', scope: 'global' },
	{ id: 'copy-timeline-keys', keys: 'Ctrl/Cmd + C', action: 'Copy timeline keys', description: 'Copy selected timeline keys while the timeline has focus.', scope: 'timeline' },
	{ id: 'paste-timeline-keys', keys: 'Ctrl/Cmd + V', action: 'Paste timeline keys', description: 'Paste copied timeline keys at the current playhead while the timeline has focus.', scope: 'timeline' },
	{ id: 'nudge-timeline-keys', keys: 'Left / Right Arrow', action: 'Nudge timeline keys', description: 'Move selected timeline keys one frame when the timeline has focus.', scope: 'timeline' },
	{ id: 'resize-timeline', keys: 'Arrow Up / Down, Home, End', action: 'Resize timeline', description: 'Resize the focused timeline splitter by one step, or jump to its minimum/maximum height.', scope: 'timeline-splitter' }
];

const normalizedKeyFor = function normalizedKeyFor(key: string): string {
	return key.toLowerCase();
};

const modifierFor = function modifierFor(event: ShortcutKeyState): 'none' | 'platform' {
	return event.ctrlKey || event.metaKey ? 'platform' : 'none';
};

const shiftMatches = function shiftMatches(
	shift: ShortcutBinding['shift'],
	shiftKey: boolean
): boolean {
	return shift === 'any' || shift === 'required' && shiftKey || shift === 'none' && !shiftKey;
};

const bindingMatches = function bindingMatches(
	binding: ShortcutBinding,
	event: ShortcutKeyState
): boolean {
	return binding.keys.includes(normalizedKeyFor(event.key))
		&& binding.modifier === modifierFor(event)
		&& shiftMatches(binding.shift, event.shiftKey);
};

export const shortcutActionFor = function shortcutActionFor(
	event: ShortcutKeyState
): ShortcutAction | undefined {
	if (event.altKey) {
		return undefined;
	}

	return globalShortcutBindings.find((binding) => bindingMatches(binding, event))?.action;
};

export const shortcutLabelFor = function shortcutLabelFor(
	action: ShortcutAction
): string | undefined {
	return shortcutReference.find((entry) => entry.id === action)?.keys;
};

export const shortcutReferenceEntryFor = function shortcutReferenceEntryFor(
	action: ShortcutReferenceAction
): ShortcutReferenceEntry | undefined {
	return shortcutReference.find((entry) => entry.id === action);
};

export const isShortcutTypingTarget = function isShortcutTypingTarget(
	target: EventTarget | null
): boolean {
	if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
		return false;
	}

	return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
};
