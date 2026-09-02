import { degreesToRadians, radiansToDegrees } from '../domain/coordinates.ts';

export type PropertyDisplayUnit = 'px' | 'deg' | '%' | 'number';

export type NumericProperty =
	| 'x'
	| 'y'
	| 'rotation'
	| 'scaleX'
	| 'scaleY'
	| 'shearX'
	| 'shearY'
	| 'opacity'
	| 'pivotX'
	| 'pivotY'
	| 'width'
	| 'height';

export type NumericPropertySpec = Readonly<{
	property: NumericProperty;
	label: string;
	unit: PropertyDisplayUnit;
	minimum?: number;
	maximum?: number;
	step: number | 'any';
	display: (value: number) => number;
	parse: (value: number) => number;
	}>;

export type PropertyDraft = Readonly<{
	property: NumericProperty;
	committedValue: number;
	draftText: string;
	error?: string;
	}>;

export type NumericDraftResult =
	| Readonly<{ ok: true; value: number; text: string }>
	| Readonly<{ ok: false; error: string }>;

const identity = function identity(value: number): number {
	return value;
};

const rotationSpec = function rotationSpec(
	property: 'rotation' | 'shearX' | 'shearY',
	label: string
): NumericPropertySpec {
	return {
		property,
		label,
		unit: 'deg',
		step: 1,
		display: radiansToDegrees,
		parse: degreesToRadians
	};
};

export const numericPropertySpecs: Readonly<Record<NumericProperty, NumericPropertySpec>> = {
	x: { property: 'x', label: 'X', unit: 'px', step: 'any', display: identity, parse: identity },
	y: { property: 'y', label: 'Y', unit: 'px', step: 'any', display: identity, parse: identity },
	rotation: rotationSpec('rotation', 'Rotation'),
	scaleX: { property: 'scaleX', label: 'Scale X', unit: 'number', step: 0.01, display: identity, parse: identity },
	scaleY: { property: 'scaleY', label: 'Scale Y', unit: 'number', step: 0.01, display: identity, parse: identity },
	shearX: rotationSpec('shearX', 'Shear X'),
	shearY: rotationSpec('shearY', 'Shear Y'),
	opacity: { property: 'opacity', label: 'Opacity', unit: '%', minimum: 0, maximum: 1, step: 0.01, display: identity, parse: identity },
	pivotX: { property: 'pivotX', label: 'Pivot X', unit: '%', minimum: 0, maximum: 1, step: 0.01, display: identity, parse: identity },
	pivotY: { property: 'pivotY', label: 'Pivot Y', unit: '%', minimum: 0, maximum: 1, step: 0.01, display: identity, parse: identity },
	width: { property: 'width', label: 'Width', unit: 'px', minimum: 1, step: 'any', display: identity, parse: identity },
	height: { property: 'height', label: 'Height', unit: 'px', minimum: 1, step: 'any', display: identity, parse: identity }
};

const formatDraftValue = function formatDraftValue(value: number): string {
	return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
};

export const draftForProperty = function draftForProperty(
	property: NumericProperty,
	committedValue: number
): PropertyDraft {
	const spec = numericPropertySpecs[property];
	const displayValue = spec.display(committedValue);

	return {
		property,
		committedValue,
		draftText: formatDraftValue(displayValue)
	};
};

export const parseNumericDraft = function parseNumericDraft(
	text: string,
	spec: NumericPropertySpec
): NumericDraftResult {
	if (text.trim().length === 0) {
		return { ok: false, error: `${spec.label} is required.` };
	}

	const displayValue = Number(text);

	if (!Number.isFinite(displayValue)) {
		return { ok: false, error: `${spec.label} must be a finite number.` };
	}
	if (spec.minimum !== undefined && displayValue < spec.display(spec.minimum)) {
		return { ok: false, error: `${spec.label} must be at least ${spec.display(spec.minimum)}.` };
	}
	if (spec.maximum !== undefined && displayValue > spec.display(spec.maximum)) {
		return { ok: false, error: `${spec.label} must be at most ${spec.display(spec.maximum)}.` };
	}

	const value = spec.parse(displayValue);

	return Number.isFinite(value)
		? { ok: true, value, text: formatDraftValue(displayValue) }
		: { ok: false, error: `${spec.label} must be a finite number.` };
};

export const commitNumericDraft = function commitNumericDraft(
	draft: PropertyDraft,
	spec: NumericPropertySpec = numericPropertySpecs[draft.property]
): NumericDraftResult | Readonly<{ ok: true; unchanged: true; value: number; text: string }> {
	const parsed = parseNumericDraft(draft.draftText, spec);

	if (!parsed.ok) {
		return parsed;
	}

	return Object.is(parsed.value, draft.committedValue)
		? { ok: true, unchanged: true, value: draft.committedValue, text: parsed.text }
		: parsed;
};

export const updatePropertyDraft = function updatePropertyDraft(
	draft: PropertyDraft,
	draftText: string
): PropertyDraft {
	return { ...draft, draftText, error: undefined };
};

export const propertyDraftWithError = function propertyDraftWithError(
	draft: PropertyDraft,
	error: string
): PropertyDraft {
	return { ...draft, error };
};
