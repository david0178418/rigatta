import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_VIEWPORT_PRESET,
	VIEWPORT_PRESET_DEFINITIONS,
	VIEWPORT_PRESET_VALUES,
	shouldCancelTransformGestureForPresetChange,
	transformGestureEnabledFor,
	viewportPresentationFor,
	viewportRenderFlagsFor,
	type ViewportMode,
	type ViewportPreset
} from '../../src/app/viewport-presentation.ts';

const expectedFlags: Readonly<Record<ViewportPreset, Readonly<{
	showBones: boolean;
	showGameplay: boolean;
	showSelectionGuides: boolean;
	showTransformHandles: boolean;
	transformEnabled: boolean;
	showGrid: boolean;
}>>> = {
	authoring: {
		showBones: true,
		showGameplay: true,
		showSelectionGuides: true,
		showTransformHandles: true,
		transformEnabled: true,
		showGrid: true
	},
	'visual-preview': {
		showBones: false,
		showGameplay: false,
		showSelectionGuides: false,
		showTransformHandles: false,
		transformEnabled: false,
		showGrid: false
	},
	'gameplay-preview': {
		showBones: false,
		showGameplay: true,
		showSelectionGuides: false,
		showTransformHandles: false,
		transformEnabled: false,
		showGrid: false
	}
};

describe('viewport presentation presets', () => {
	test('defines the three labelled presets with a safe Authoring default', () => {
		expect(VIEWPORT_PRESET_VALUES).toEqual(['authoring', 'visual-preview', 'gameplay-preview']);
		expect(DEFAULT_VIEWPORT_PRESET).toBe('authoring');
		expect(Object.values(VIEWPORT_PRESET_DEFINITIONS).map(({ label }) => label)).toEqual([
			'Authoring',
			'Visual preview',
			'Gameplay preview'
		]);
	});

	test('cancels only an active transform when the preset changes', () => {
		expect(shouldCancelTransformGestureForPresetChange(true, 'authoring', 'visual-preview')).toBe(true);
		expect(shouldCancelTransformGestureForPresetChange(true, 'gameplay-preview', 'authoring')).toBe(true);
		expect(shouldCancelTransformGestureForPresetChange(true, 'authoring', 'authoring')).toBe(false);
		expect(shouldCancelTransformGestureForPresetChange(false, 'authoring', 'visual-preview')).toBe(false);
	});

	(['setup', 'animate'] as const satisfies readonly ViewportMode[]).forEach((mode) => {
		VIEWPORT_PRESET_VALUES.forEach((preset) => {
			test(`${mode} derives renderer and editing flags for ${preset}`, () => {
				const presentation = viewportPresentationFor(preset, mode);

				expect(presentation).toMatchObject({ mode, preset, label: VIEWPORT_PRESET_DEFINITIONS[preset].label, ...expectedFlags[preset] });
				expect(viewportRenderFlagsFor(presentation)).toEqual({
					showBones: expectedFlags[preset].showBones,
					showGameplay: expectedFlags[preset].showGameplay,
					showSelectionGuides: expectedFlags[preset].showSelectionGuides,
					showTransformHandles: expectedFlags[preset].showTransformHandles
				});
				expect(transformGestureEnabledFor(presentation)).toBe(expectedFlags[preset].transformEnabled);
			});
		});
	});
});
