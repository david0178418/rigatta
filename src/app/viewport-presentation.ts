export type ViewportMode = 'setup' | 'animate';

export const VIEWPORT_PRESET_VALUES = [
	'authoring',
	'visual-preview',
	'gameplay-preview'
] as const;

export type ViewportPreset = typeof VIEWPORT_PRESET_VALUES[number];

export type ViewportPresentationFlags = Readonly<{
	showBones: boolean;
	showGameplay: boolean;
	showSelectionGuides: boolean;
	showTransformHandles: boolean;
	transformEnabled: boolean;
	showGrid: boolean;
}>;

export type ViewportPresentation = Readonly<ViewportPresentationFlags & {
	mode: ViewportMode;
	preset: ViewportPreset;
	label: string;
}>;

type ViewportPresetDefinition = Readonly<ViewportPresentationFlags & {
	label: string;
}>;

export const DEFAULT_VIEWPORT_PRESET: ViewportPreset = 'authoring';

export const VIEWPORT_PRESET_DEFINITIONS = {
	authoring: {
		label: 'Authoring',
		showBones: true,
		showGameplay: true,
		showSelectionGuides: true,
		showTransformHandles: true,
		transformEnabled: true,
		showGrid: true
	},
	'visual-preview': {
		label: 'Visual preview',
		showBones: false,
		showGameplay: false,
		showSelectionGuides: false,
		showTransformHandles: false,
		transformEnabled: false,
		showGrid: false
	},
	'gameplay-preview': {
		label: 'Gameplay preview',
		showBones: false,
		showGameplay: true,
		showSelectionGuides: false,
		showTransformHandles: false,
		transformEnabled: false,
		showGrid: false
	}
} as const satisfies Readonly<Record<ViewportPreset, ViewportPresetDefinition>>;

export const isViewportPreset = function isViewportPreset(value: unknown): value is ViewportPreset {
	return VIEWPORT_PRESET_VALUES.some((preset) => preset === value);
};

export const viewportPresentationFor = function viewportPresentationFor(
	preset: ViewportPreset,
	mode: ViewportMode
): ViewportPresentation {
	return {
		mode,
		preset,
		...VIEWPORT_PRESET_DEFINITIONS[preset]
	};
};

export const viewportRenderFlagsFor = function viewportRenderFlagsFor(
	presentation: ViewportPresentation
): Pick<ViewportPresentationFlags, 'showBones' | 'showGameplay' | 'showSelectionGuides' | 'showTransformHandles'> {
	return {
		showBones: presentation.showBones,
		showGameplay: presentation.showGameplay,
		showSelectionGuides: presentation.showSelectionGuides,
		showTransformHandles: presentation.showTransformHandles
	};
};

export const transformGestureEnabledFor = function transformGestureEnabledFor(
	presentation: ViewportPresentation
): boolean {
	return presentation.transformEnabled;
};

