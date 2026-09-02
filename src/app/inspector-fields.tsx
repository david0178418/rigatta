import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type Ref } from 'react';
import {
	commitNumericDraft,
	draftForProperty,
	propertyDraftWithError,
	updatePropertyDraft,
	numericPropertySpecs,
	type NumericProperty,
	type PropertyDraft
} from './property-drafts.ts';
import type { PropertyKeyState } from './keying.ts';

export type KeyDiamondPresentation = Readonly<{
	action: 'Add' | 'Remove';
	glyph: '◇' | '◆' | '◈';
	stateLabel: 'Unkeyed' | 'Pending' | 'Keyed';
}>;

const keyDiamondPresentations: Readonly<Record<PropertyKeyState, KeyDiamondPresentation>> = {
	unkeyed: { action: 'Add', glyph: '◇', stateLabel: 'Unkeyed' },
	pending: { action: 'Add', glyph: '◈', stateLabel: 'Pending' },
	keyed: { action: 'Remove', glyph: '◆', stateLabel: 'Keyed' }
};

export const keyDiamondPresentationFor = function keyDiamondPresentationFor(
	state: PropertyKeyState
): KeyDiamondPresentation {
	return keyDiamondPresentations[state];
};

export const keyDiamondLabelFor = function keyDiamondLabelFor(
	property: string,
	frameIndex: number,
	state: PropertyKeyState
): string {
	return `${keyDiamondPresentationFor(state).action} ${property} key at frame ${frameIndex + 1}`;
};

export const KeyDiamond = function KeyDiamond({
	property,
	frameIndex,
	state,
	onToggle
}: Readonly<{
	property: string;
	frameIndex: number;
	state: PropertyKeyState;
	onToggle: () => void;
}>): ReactElement {
	const presentation = keyDiamondPresentationFor(state);
	const label = keyDiamondLabelFor(property, frameIndex, state);

	return (
		<button
			aria-label={label}
			aria-pressed={state === 'keyed'}
			data-key-state={state}
			className={`key-diamond key-diamond-${state}`}
			title={`${label} · ${presentation.stateLabel}`}
			type="button"
			onClick={onToggle}
		>
			<span aria-hidden="true">{presentation.glyph}</span>
		</button>
	);
};

export const DirectNumericField = function DirectNumericField({
	property,
	value,
	name,
	ariaLabel,
	keyState,
	frameIndex,
	mixed = false,
	onCommit,
	onToggleKey
}: Readonly<{
	property: NumericProperty;
	value: number;
	name?: string;
	ariaLabel?: string;
	keyState?: PropertyKeyState;
	frameIndex?: number;
	mixed?: boolean;
	onCommit: (property: NumericProperty, value: number) => string | undefined;
	onToggleKey?: () => void;
}>): ReactElement {
	const spec = numericPropertySpecs[property];
	const initialDraft = draftForProperty(property, value);
	const [draft, setDraft] = useState<PropertyDraft>(initialDraft);
	const committedTextRef = useRef(initialDraft.draftText);
	const commit = function commit(): void {
		if (committedTextRef.current === draft.draftText && draft.error === undefined && !mixed) {
			return;
		}

		const result = commitNumericDraft(draft, spec);

		if (!result.ok) {
			setDraft(propertyDraftWithError(draft, result.error));
			return;
		}

		const unchanged = 'unchanged' in result && result.unchanged;
		const error = unchanged && !mixed ? undefined : onCommit(property, result.value);

		if (error) {
			setDraft(propertyDraftWithError(draft, error));
			return;
		}

		committedTextRef.current = result.text;
		setDraft({ ...draftForProperty(property, result.value), draftText: result.text });
	};
	const onKeyDown = function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit();
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			committedTextRef.current = initialDraft.draftText;
			setDraft(initialDraft);
		}
	};

	return (
		<label className="direct-property-field">
			<span className={mixed ? 'field-label mixed-field-label' : 'field-label'}>
				<span>{spec.label}{spec.unit === 'deg' ? ' (deg)' : ''}</span>
				{mixed && <small>Mixed</small>}
			</span>
			<span className="direct-property-control">
				<input
					aria-label={ariaLabel ?? spec.label}
					name={name ?? property}
					step={spec.step}
					type="number"
					value={draft.draftText}
					onBlur={commit}
					onChange={(event) => setDraft(updatePropertyDraft(draft, event.currentTarget.value))}
					onKeyDown={onKeyDown}
				/>
				{keyState && frameIndex !== undefined && onToggleKey && <KeyDiamond frameIndex={frameIndex} property={spec.label} state={keyState} onToggle={onToggleKey} />}
			</span>
			{draft.error && <small className="field-error" role="alert">{draft.error}</small>}
		</label>
	);
};

export const DirectNameField = function DirectNameField({
	value,
	name = 'Selected name',
	inputRef,
	onCommit
}: Readonly<{
	value: string;
	name?: string;
	inputRef?: Ref<HTMLInputElement>;
	onCommit: (value: string) => string | undefined;
}>): ReactElement {
	const [draft, setDraft] = useState(value);
	const committedRef = useRef(value);
	const [error, setError] = useState<string | undefined>(undefined);
	const commit = function commit(): void {
		if (draft === committedRef.current && !error) {
			return;
		}

		const nextError = onCommit(draft);

		if (nextError) {
			setError(nextError);
			return;
		}

		committedRef.current = draft;
		setError(undefined);
	};
	const onKeyDown = function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit();
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			setDraft(committedRef.current);
			setError(undefined);
		}
	};

	return (
		<label className="direct-name-field">
			<span className="field-label">Name</span>
			<input ref={inputRef} aria-label={name} value={draft} onBlur={commit} onChange={(event) => {
				setDraft(event.currentTarget.value);
				setError(undefined);
			}} onKeyDown={onKeyDown} />
			{error && <small className="field-error" role="alert">{error}</small>}
		</label>
	);
};
