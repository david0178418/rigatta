import { useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { isEventPayload } from '../domain/events.ts';
import type { EventKeyUpdate, NumberKeyInterpolationInput } from '../domain/animation.ts';
import { frameCountForClip } from '../domain/playback.ts';
import type { EntityId as Id } from '../domain/ids.ts';
import type {
	Clip,
	CubicBezier,
	EventKey,
	NumberKey,
	Project,
	Track
} from '../domain/model.ts';
import { DEFAULT_BEZIER_CURVE } from '../domain/animation.ts';
import type { EvaluatedPose } from '../domain/pose.ts';
import { drawOrderViewForFrame, reorderDrawOrder } from './draw-order-model.ts';
import { frameIndexForTime } from './timeline.ts';
import type { InspectorContext } from './inspector-context.ts';
import type { TimelineKeyReference } from './timeline-model.ts';
import type { SelectableEntity } from './selection.ts';
import { Tooltip } from './ui-primitives.tsx';

type EditorMode = 'setup' | 'animate';

export type ClipPlaybackSettings = Readonly<Partial<{
	durationSeconds: number;
	fps: number;
	loop: boolean;
}>>;

export type NumberKeyChange = Readonly<{
	trackId: Id;
	keyId: Id;
	value?: number;
	timeSeconds?: number;
}>;

export type KeyTimeChange = Readonly<{
	trackId: Id;
	keyId: Id;
	timeSeconds: number;
}>;

export type SharedInspectorProps = Readonly<{
	project: Project;
	context: InspectorContext;
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onRenameClip: (clipId: Id, name: string) => void;
	onUpdateClipPlayback: (clipId: Id, settings: ClipPlaybackSettings) => void;
	onSaveClip?: (clipId: Id, name: string, settings: ClipPlaybackSettings) => void;
	onDuplicateClip?: (clipId: Id) => void;
	onDeleteClip?: (clipId: Id) => void;
	onDeleteTrack: (clipId: Id, trackId: Id) => void;
	onUpdateNumberKeys: (clipId: Id, changes: readonly NumberKeyChange[]) => void;
	onUpdateKeys?: (clipId: Id, changes: readonly NumberKeyChange[]) => void;
	onUpdateInterpolation: (clipId: Id, changes: readonly NumberKeyChange[], input: NumberKeyInterpolationInput) => void;
	onMoveKeys?: (clipId: Id, changes: readonly KeyTimeChange[]) => void;
	onUpdateEvent: (clipId: Id, eventId: Id, input: EventKeyUpdate) => void;
	onMoveEvent: (clipId: Id, eventId: Id, timeSeconds: number) => void;
	onDeleteEvent: (clipId: Id, eventId: Id) => void;
	onUpdateAttachmentKey: (clipId: Id, trackId: Id, keyId: Id, value: Id | null) => void;
	onKeyCurrentAttachment?: (clipId: Id, trackId: Id, slotId: Id, value: Id | null) => void;
	onUpdateDrawOrderKey: (clipId: Id, trackId: Id, keyId: Id, value: readonly Id[]) => void;
	onKeyCurrentDrawOrder?: (clipId: Id, value: readonly Id[]) => void;
	activeClip?: Clip;
	activeFrameIndex?: number;
	activePose?: EvaluatedPose;
	mode?: EditorMode;
	onNavigateEntity?: (entity: SelectableEntity) => void;
	onUpdateEnabled?: (attachmentId: Id, enabled: boolean) => string | undefined;
	onKeyEnabled?: (attachmentId: Id, enabled: boolean) => void;
}>;

type NumberTrack = Extract<Track, {
	kind: 'bone-transform' | 'attachment-transform' | 'attachment-opacity' | 'rectangle-size';
}>;

type KeyEntry = Readonly<{
	reference: TimelineKeyReference;
	track: Track;
	key: Track['keys'][number];
}>;

type NumericKeyEntry = KeyEntry & Readonly<{
	track: NumberTrack;
	key: NumberKey;
}>;

type BezierHandle = keyof CubicBezier;

const numberTrack = function numberTrack(track: Track): track is NumberTrack {
	return track.kind === 'bone-transform'
		|| track.kind === 'attachment-transform'
		|| track.kind === 'attachment-opacity'
		|| track.kind === 'rectangle-size';
};

const clipFor = function clipFor(project: Project, clipId: Id): Clip | undefined {
	return project.clips.find((clip) => clip.id === clipId);
};

const trackFor = function trackFor(clip: Clip, trackId: Id): Track | undefined {
	return clip.tracks.find((track) => track.id === trackId);
};

const keyEntriesFor = function keyEntriesFor(
	clip: Clip,
	keys: readonly TimelineKeyReference[]
): readonly KeyEntry[] {
	return keys.flatMap((reference) => {
		const track = trackFor(clip, reference.trackId);
		const key = track?.keys.find((candidate) => candidate.id === reference.keyId);

		return track && key ? [{ reference, track, key }] : [];
	});
};

const numericKeyEntry = function numericKeyEntry(entry: KeyEntry): entry is NumericKeyEntry {
	return numberTrack(entry.track) && 'value' in entry.key && 'interpolation' in entry.key;
};

const sameValue = function sameValue<TValue>(values: readonly TValue[]): TValue | undefined {
	const first = values[0];

	return values.length > 0 && values.every((value) => Object.is(value, first)) ? first : undefined;
};

const frameForKey = function frameForKey(clip: Clip, timeSeconds: number): number {
	return frameIndexForTime(clip, timeSeconds);
};

const timeForFrame = function timeForFrame(clip: Clip, frame: number): number {
	return frame / clip.fps;
};

const validFrame = function validFrame(clip: Clip, frame: number): boolean {
	return Number.isInteger(frame) && frame >= 1 && frame <= frameCountForClip(clip);
};

const eventPayloadText = function eventPayloadText(event: EventKey): string {
	return JSON.stringify(event.payload, null, 2);
};

export const parseInspectorEventPayload = function parseInspectorEventPayload(
	text: string
): Readonly<{ ok: true; value: EventKey['payload'] }> | Readonly<{ ok: false; error: string }> {
	try {
		const value: unknown = JSON.parse(text);

		return isEventPayload(value)
			? { ok: true, value }
			: { ok: false, error: 'Payload must be a bounded JSON object.' };
	} catch {
		return { ok: false, error: 'Payload must be valid JSON.' };
	}
};

const valueLabel = function valueLabel(
	project: Project,
	attachmentId: Id | null | undefined
): string {
	if (!attachmentId) {
		return 'None';
	}

	return project.attachments.find((attachment) => attachment.id === attachmentId)?.name ?? 'Missing attachment';
};

const attachmentEntity = function attachmentEntity(
	project: Project,
	attachmentId: Id | null | undefined
): SelectableEntity | undefined {
	return attachmentId && project.attachments.some((attachment) => attachment.id === attachmentId)
		? { kind: 'attachment', id: attachmentId }
		: undefined;
};

const slotEntity = function slotEntity(project: Project, slotId: Id): SelectableEntity | undefined {
	return project.slots.some((slot) => slot.id === slotId) ? { kind: 'slot', id: slotId } : undefined;
};

export type CollapsibleInspectorSectionProps = Readonly<{
	id: string;
	eyebrow: string;
	label: string;
	detail: string;
	ariaLabel: string;
	collapsed: boolean;
	onToggle: () => void;
	children: ReactNode;
}>;

export const CollapsibleInspectorSection = function CollapsibleInspectorSection({
	id,
	eyebrow,
	label,
	detail,
	ariaLabel,
	collapsed,
	onToggle,
	children
}: CollapsibleInspectorSectionProps): ReactElement {
	const contentId = `inspector-section-content-${id}`;
	const toggleLabel = collapsed ? `Expand ${label}` : `Collapse ${label}`;

	return (
		<section className={collapsed ? 'shared-inspector-context is-collapsed' : 'shared-inspector-context'} aria-label={ariaLabel}>
			<div className="shared-inspector-heading">
				<div>
					<p className="eyebrow">{eyebrow}</p>
					<h3>{label}</h3>
				</div>
				<div className="shared-inspector-heading-actions">
					<span className="context-badge">{detail}</span>
					<button
						aria-controls={contentId}
						aria-expanded={!collapsed}
						aria-label={toggleLabel}
						className="quiet-button"
						type="button"
						onClick={onToggle}
					>
						{collapsed ? 'Show' : 'Hide'}
					</button>
				</div>
			</div>
			<div className="shared-inspector-body" id={contentId} hidden={collapsed}>
				{children}
			</div>
		</section>
	);
};

const ClipInspector = function ClipInspector({
	clip,
	collapsedSections,
	onToggleSection,
	onRenameClip,
	onUpdateClipPlayback,
	onSaveClip,
	onDuplicateClip,
	onDeleteClip
}: Readonly<{
	clip: Clip;
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onRenameClip: (name: string) => void;
	onUpdateClipPlayback: (settings: ClipPlaybackSettings) => void;
	onSaveClip?: (name: string, settings: ClipPlaybackSettings) => void;
	onDuplicateClip?: () => void;
	onDeleteClip?: () => void;
}>): ReactElement {
	const [error, setError] = useState<string | undefined>(undefined);
	const submit = function submit(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const nameValue = data.get('clipName');
		const durationValue = Number(data.get('clipDuration'));
		const fpsValue = Number(data.get('clipFps'));

		if (typeof nameValue !== 'string' || nameValue.trim().length === 0) {
			setError('Clip name is required.');
			return;
		}
		if (!Number.isFinite(durationValue) || durationValue <= 0 || !Number.isFinite(fpsValue) || fpsValue <= 0) {
			setError('Duration and FPS must be positive finite numbers.');
			return;
		}

		const name = nameValue.trim();
		const settings = { durationSeconds: durationValue, fps: fpsValue, loop: data.get('clipLoop') === 'on' } as const;

		if (onSaveClip) {
			onSaveClip(name, settings);
		} else {
			if (name !== clip.name) {
				onRenameClip(name);
			}
			onUpdateClipPlayback(settings);
		}
		setError(undefined);
	};

	return (
		<CollapsibleInspectorSection
			ariaLabel="Clip properties"
			collapsed={collapsedSections.has('clip')}
			detail={clip.name}
			eyebrow="Context"
			id="clip"
			label="Clip"
			onToggle={() => onToggleSection('clip')}
		>
			<form className="shared-inspector-form" key={`${clip.id}:${clip.name}:${clip.durationSeconds}:${clip.fps}:${clip.loop}`} onSubmit={submit}>
				<label><span className="field-label">Clip name</span><input aria-describedby={error?.startsWith('Clip name') ? 'clip-editor-error' : undefined} aria-invalid={error?.startsWith('Clip name') ? 'true' : undefined} name="clipName" defaultValue={clip.name} aria-label="Clip name" /></label>
				<div className="shared-inspector-grid">
					<label><span className="field-label">Duration (s)</span><input aria-describedby={error?.startsWith('Duration') ? 'clip-editor-error' : undefined} aria-invalid={error?.startsWith('Duration') ? 'true' : undefined} name="clipDuration" type="number" min="0.001" step="0.001" defaultValue={clip.durationSeconds} aria-label="Duration (sec)" /></label>
					<label><span className="field-label">FPS</span><input aria-describedby={error?.startsWith('Duration') ? 'clip-editor-error' : undefined} aria-invalid={error?.startsWith('Duration') ? 'true' : undefined} name="clipFps" type="number" min="0.001" step="0.001" defaultValue={clip.fps} aria-label="FPS" /></label>
				</div>
				<label className="shared-checkbox"><input name="clipLoop" type="checkbox" aria-label="Loop" defaultChecked={clip.loop} /> <span>Loop playback</span></label>
				{error && <small className="field-error" id="clip-editor-error" role="alert">{error}</small>}
				<div className="inspector-actions">
					<button className="secondary-button" type="submit">Save clip</button>
					{onDuplicateClip && <button className="secondary-button" type="button" onClick={onDuplicateClip}>Duplicate clip</button>}
					{onDeleteClip && <button className="danger-button" type="button" onClick={onDeleteClip}>Delete clip</button>}
				</div>
			</form>
			<dl className="context-details">
				<div><dt>Tracks</dt><dd>{clip.tracks.length}</dd></div>
				<div><dt>Events</dt><dd>{clip.events.length}</dd></div>
			</dl>
		</CollapsibleInspectorSection>
	);
};

const TrackInspector = function TrackInspector({
	clip,
	track,
	collapsedSections,
	onToggleSection,
	onDelete
}: Readonly<{
	clip: Clip;
	track: Track;
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onDelete: () => void;
}>): ReactElement {
	const target = 'targetId' in track ? track.targetId : undefined;

	return (
		<CollapsibleInspectorSection
			ariaLabel="Track properties"
			collapsed={collapsedSections.has('track')}
			detail={track.kind}
			eyebrow="Context"
			id="track"
			label="Track"
			onToggle={() => onToggleSection('track')}
		>
			<dl className="context-details">
				<div><dt>Keys</dt><dd>{track.keys.length}</dd></div>
				<div><dt>Target</dt><dd>{target ?? 'All slots'}</dd></div>
				<div><dt>Clip</dt><dd>{clip.name}</dd></div>
			</dl>
			<button className="danger-button" type="button" onClick={onDelete}>Delete selected track</button>
		</CollapsibleInspectorSection>
	);
};

const clampedBezierValue = function clampedBezierValue(value: number, handle: BezierHandle): number {
	if (handle === 'x1' || handle === 'x2') {
		return Math.max(0, Math.min(1, value));
	}

	return Math.max(-0.5, Math.min(1.5, value));
};

const updateBezierHandle = function updateBezierHandle(
	curve: CubicBezier,
	handle: BezierHandle,
	value: number
): CubicBezier {
	const nextValue = clampedBezierValue(value, handle);

	return { ...curve, [handle]: nextValue };
};

const SharedBezierEditor = function SharedBezierEditor({
	curve,
	curvesMixed,
	onChange
}: Readonly<{
	curve: CubicBezier;
	curvesMixed?: boolean;
	onChange: (curve: CubicBezier) => void;
}>): ReactElement {
	const [draftCurve, setDraftCurve] = useState<CubicBezier>(() => curve);
	const handles: readonly BezierHandle[] = ['x1', 'y1', 'x2', 'y2'];
	const updateHandle = function updateHandle(handle: BezierHandle, value: string): void {
		const number = Number(value);

		if (Number.isFinite(number)) {
			setDraftCurve((current) => updateBezierHandle(current, handle, number));
		}
	};

	return (
		<fieldset className="shared-bezier-editor">
			<legend>Bezier curve editor {curvesMixed && <small className="mixed-field-label">Mixed curves</small>}</legend>
			<svg className="bezier-preview" viewBox="0 0 100 100" role="img" aria-label="Bezier curve preview">
				<path className="bezier-grid-line" d="M 0 100 L 100 0" />
				<path className="shared-bezier-curve" d={'M 0 100 C ' + draftCurve.x1 * 100 + ' ' + (100 - draftCurve.y1 * 100) + ', ' + draftCurve.x2 * 100 + ' ' + (100 - draftCurve.y2 * 100) + ', 100 0'} />
				<circle className="bezier-handle" cx={draftCurve.x1 * 100} cy={100 - draftCurve.y1 * 100} r="3" />
				<circle className="bezier-handle" cx={draftCurve.x2 * 100} cy={100 - draftCurve.y2 * 100} r="3" />
			</svg>
			<div className="shared-inspector-grid">
				{handles.map((handle) => (
					<label key={handle}>
						<span className="field-label">{handle.toUpperCase()}</span>
						<input
							aria-label={'Bezier ' + handle}
							max={handle === 'x1' || handle === 'x2' ? 1 : 1.5}
							min={handle === 'x1' || handle === 'x2' ? 0 : -0.5}
							step="0.01"
							type="number"
							value={draftCurve[handle]}
							onChange={(event) => updateHandle(handle, event.currentTarget.value)}
						/>
					</label>
				))}
			</div>
			<button className="quiet-button" type="button" onClick={() => onChange(draftCurve)}>Apply curve</button>
		</fieldset>
	);
};

const curveForEntries = function curveForEntries(entries: readonly NumericKeyEntry[]): CubicBezier | undefined {
	if (entries.length === 0 || entries.some((entry) => entry.key.interpolation !== 'bezier')) {
		return undefined;
	}

	return entries.map((entry) => entry.key.curve).find((curve): curve is CubicBezier => curve !== null) ?? DEFAULT_BEZIER_CURVE;
};

const curvesMixedForEntries = function curvesMixedForEntries(entries: readonly NumericKeyEntry[]): boolean {
	const curves = entries
		.map((entry) => entry.key.curve)
		.filter((curve): curve is CubicBezier => curve !== null);
	const first = curves[0];

	return curves.length > 1
		&& first !== undefined
		&& curves.some((curve) => curve.x1 !== first.x1 || curve.y1 !== first.y1 || curve.x2 !== first.x2 || curve.y2 !== first.y2);
};

const KeyInspector = function KeyInspector({
	clip,
	entries,
	collapsedSections,
	onToggleSection,
	onUpdateNumberKeys,
	onUpdateKeys,
	onUpdateInterpolation,
	onMoveKeys
}: Readonly<{
	clip: Clip;
	entries: readonly KeyEntry[];
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onUpdateNumberKeys: (changes: readonly NumberKeyChange[]) => void;
	onUpdateKeys?: (changes: readonly NumberKeyChange[]) => void;
	onUpdateInterpolation: (changes: readonly NumberKeyChange[], input: NumberKeyInterpolationInput) => void;
	onMoveKeys?: (changes: readonly KeyTimeChange[]) => void;
}>): ReactElement {
	const numericEntries = entries.filter(numericKeyEntry);
	const [error, setError] = useState<string | undefined>(undefined);
	const interpolation = sameValue(numericEntries.map((entry) => entry.key.interpolation));
	const sharedValue = sameValue(numericEntries.map((entry) => entry.key.value));
	const sharedFrame = sameValue(entries.map((entry) => frameForKey(clip, entry.key.timeSeconds)));
	const curve = curveForEntries(numericEntries);
	const curvesMixed = curvesMixedForEntries(numericEntries);
	const frameCount = frameCountForClip(clip);
	const submitKey = function submitKey(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const frameText = data.get('keyFrame');
		const valueText = data.get('keyValue');
		const frame = typeof frameText === 'string' && frameText.trim().length > 0 ? Number(frameText) : undefined;

		if (frame !== undefined && !validFrame(clip, frame)) {
			setError(`Key frame must be an integer between 1 and ${frameCount}.`);
			return;
		}
		const timeSeconds = frame === undefined ? undefined : timeForFrame(clip, frame - 1);
		const frameChanges: readonly KeyTimeChange[] = entries.map((entry) => ({ trackId: entry.reference.trackId, keyId: entry.reference.keyId, timeSeconds: timeSeconds ?? entry.key.timeSeconds }));
		const numericValue = typeof valueText === 'string' && valueText.trim().length > 0 ? Number(valueText) : undefined;
		const mixedKeyTypes = numericEntries.length > 0 && numericEntries.length < entries.length;

		if (timeSeconds !== undefined && mixedKeyTypes && !onUpdateKeys) {
			setError('Frame edits across numeric and discrete keys require atomic shared-key support.');
			return;
		}

		if (numericEntries.length > 0 && numericValue !== undefined && !Number.isFinite(numericValue)) {
			setError('Numeric key values must be finite.');
			return;
		}
		if (numericEntries.length > 0) {
			const changes: readonly NumberKeyChange[] = entries.map((entry) => ({
				trackId: entry.reference.trackId,
				keyId: entry.reference.keyId,
				...(timeSeconds === undefined ? {} : { timeSeconds }),
				...(numericValue !== undefined && numericEntries.some((numericEntry) => numericEntry.reference.trackId === entry.reference.trackId && numericEntry.reference.keyId === entry.reference.keyId) ? { value: numericValue } : {})
			}));
			const numericChanges = numericEntries.map((entry) => ({
				trackId: entry.reference.trackId,
				keyId: entry.reference.keyId,
				...(timeSeconds === undefined ? {} : { timeSeconds }),
				...(numericValue === undefined ? {} : { value: numericValue })
			}));

			if (onUpdateKeys && changes.some((change) => change.timeSeconds !== undefined || change.value !== undefined)) {
				onUpdateKeys(changes);
			} else if (numericChanges.some((change) => change.timeSeconds !== undefined || change.value !== undefined)) {
				onUpdateNumberKeys(numericChanges);
			}
			setError(undefined);
			return;
		}
		if (timeSeconds !== undefined) {
			onMoveKeys?.(frameChanges);
		}
		setError(undefined);
	};
	const updateInterpolation = function updateInterpolation(value: string): void {
		if (value !== 'stepped' && value !== 'linear' && value !== 'bezier') {
			return;
		}

		onUpdateInterpolation(numericEntries.map((entry) => ({ trackId: entry.reference.trackId, keyId: entry.reference.keyId })), value === 'bezier'
			? { interpolation: value, curve: curve ?? DEFAULT_BEZIER_CURVE }
			: { interpolation: value, curve: null });
	};
	const keySignature = entries.map((entry) => `${entry.reference.trackId}:${entry.reference.keyId}:${entry.key.timeSeconds}:${'value' in entry.key ? entry.key.value : ''}`).join('|');

	return (
		<CollapsibleInspectorSection
			ariaLabel="Key properties"
			collapsed={collapsedSections.has('key')}
			detail={`${entries.length} selected`}
			eyebrow="Context"
			id="key"
			label="Key"
			onToggle={() => onToggleSection('key')}
		>
			<form className="shared-inspector-form" key={keySignature} onSubmit={submitKey}>
				<div className="shared-inspector-grid">
					<label>
						<span className="field-label">Frame {sharedFrame === undefined && <small className="mixed-field-label">Mixed</small>}</span>
						<input aria-describedby={error ? 'key-editor-error' : undefined} aria-invalid={error ? 'true' : undefined} aria-label="Key frame" defaultValue={sharedFrame === undefined ? '' : sharedFrame + 1} max={frameCount} min="1" name="keyFrame" placeholder={sharedFrame === undefined ? 'Mixed frames' : undefined} step="1" type="number" />
					</label>
					{numericEntries.length > 0 && <label>
						<span className="field-label">Value {sharedValue === undefined && <small className="mixed-field-label">Mixed</small>}</span>
						<input aria-describedby={error ? 'key-editor-error' : undefined} aria-invalid={error ? 'true' : undefined} aria-label="Inspector value" defaultValue={sharedValue} name="keyValue" placeholder={sharedValue === undefined ? 'Mixed values' : undefined} step="any" type="number" />
					</label>}
				</div>
				{numericEntries.length > 0 && <label>
					<span className="field-label">Interpolation {interpolation === undefined && <small className="mixed-field-label">Mixed</small>}</span>
					<select aria-label="Inspector easing mode" value={interpolation ?? 'mixed'} onChange={(event) => updateInterpolation(event.currentTarget.value)}>
						<option value="mixed">Mixed</option>
						<option value="stepped">Stepped</option>
						<option value="linear">Linear</option>
						<option value="bezier">Bezier</option>
					</select>
				</label>}
				{interpolation === 'bezier' && curve && <SharedBezierEditor key={`${keySignature}:bezier:${curve.x1}:${curve.y1}:${curve.x2}:${curve.y2}`} curve={curve} curvesMixed={curvesMixed} onChange={(nextCurve) => onUpdateInterpolation(numericEntries.map((entry) => ({ trackId: entry.reference.trackId, keyId: entry.reference.keyId })), { interpolation: 'bezier', curve: nextCurve })} />}
				{numericEntries.length === 0 && <p className="muted-copy">This selection contains discrete keys. Frame can be changed together; value editing is available for the specific key context.</p>}
				{entries.length > 1 && <p className="muted-copy" data-testid="mixed-key-state">{entries.length} keys selected. Blank mixed fields are unchanged until a common value is entered.</p>}
				{error && <small className="field-error" id="key-editor-error" role="alert">{error}</small>}
				<button className="secondary-button" type="submit">Apply key values</button>
			</form>
		</CollapsibleInspectorSection>
	);
};

const EventInspector = function EventInspector({
	clip,
	event,
	collapsedSections,
	onToggleSection,
	onUpdate,
	onMove,
	onDelete
}: Readonly<{
	clip: Clip;
	event: EventKey;
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onUpdate: (input: EventKeyUpdate) => void;
	onMove: (timeSeconds: number) => void;
	onDelete: () => void;
}>): ReactElement {
	const [name, setName] = useState(event.name);
	const [frame, setFrame] = useState(String(frameForKey(clip, event.timeSeconds) + 1));
	const [payload, setPayload] = useState(eventPayloadText(event));
	const [error, setError] = useState<string | undefined>(undefined);
	const submit = function submit(eventSubmit: FormEvent<HTMLFormElement>): void {
		eventSubmit.preventDefault();
		const frameValue = Number(frame);
		const parsed = parseInspectorEventPayload(payload);
		const submitter = eventSubmit.nativeEvent instanceof SubmitEvent
			? eventSubmit.nativeEvent.submitter
			: null;
		const action = submitter instanceof HTMLButtonElement ? submitter.value : 'apply';
		const moveOnly = action === 'move';

		if (!moveOnly && name.trim().length === 0) {
			setError('Event name is required.');
			return;
		}
		if (!validFrame(clip, frameValue)) {
			setError(`Event frame must be an integer between 1 and ${frameCountForClip(clip)}.`);
			return;
		}
		if (!moveOnly && !parsed.ok) {
			setError(parsed.error);
			return;
		}

		const update: EventKeyUpdate = !moveOnly && parsed.ok
			? {
				...(name.trim() !== event.name ? { name: name.trim() } : {}),
				...(eventPayloadText(event) !== payload ? { payload: parsed.value } : {})
			}
			: {};
		if (!moveOnly && Object.keys(update).length > 0) {
			onUpdate(update);
		}
		if (moveOnly && frameValue - 1 !== frameForKey(clip, event.timeSeconds)) {
			onMove(timeForFrame(clip, frameValue - 1));
		}
		setError(undefined);
	};

	return (
		<CollapsibleInspectorSection
			ariaLabel="Event properties"
			collapsed={collapsedSections.has('event')}
			detail={event.name}
			eyebrow="Context"
			id="event"
			label="Event"
			onToggle={() => onToggleSection('event')}
		>
			<form className="shared-inspector-form" key={`${event.id}:${event.name}:${event.timeSeconds}:${eventPayloadText(event)}`} onSubmit={submit}>
				<label><span className="field-label">Name</span><input aria-describedby={error?.startsWith('Event name') ? 'event-editor-error' : undefined} aria-invalid={error?.startsWith('Event name') ? 'true' : undefined} aria-label="Event name" value={name} onChange={(inputEvent) => setName(inputEvent.currentTarget.value)} /></label>
				<label><span className="field-label">Frame</span><input aria-describedby={error?.startsWith('Event frame') ? 'event-editor-error' : undefined} aria-invalid={error?.startsWith('Event frame') ? 'true' : undefined} aria-label="Event frame" max={frameCountForClip(clip)} min="1" step="1" type="number" value={frame} onChange={(inputEvent) => setFrame(inputEvent.currentTarget.value)} /></label>
				<label>
					<span className="field-label">Payload JSON</span>
					<textarea aria-describedby={error?.includes('Payload') ? 'event-editor-error' : undefined} aria-label="Payload JSON" aria-invalid={error?.includes('Payload') === true} rows={5} value={payload} onChange={(inputEvent) => {
						setPayload(inputEvent.currentTarget.value);
						setError(undefined);
					}} />
				</label>
				<p className="muted-copy">JSON object · strings, numbers, booleans, null, arrays, and nested objects.</p>
				{error && <small className="field-error" id="event-editor-error" role="alert">{error}</small>}
				<div className="inspector-actions"><button className="secondary-button" name="eventAction" type="submit" value="apply">Apply event</button><button className="secondary-button" name="eventAction" type="submit" value="move">Move event</button><button className="danger-button" type="button" onClick={onDelete}>Delete event</button></div>
			</form>
		</CollapsibleInspectorSection>
	);
};

const moveOrderSlot = function moveOrderSlot(
	order: readonly Id[],
	slotId: Id,
	direction: -1 | 1
): readonly Id[] {
	const index = order.indexOf(slotId);
	const targetIndex = index + direction;

	return index < 0 || targetIndex < 0 || targetIndex >= order.length
		? order
		: reorderDrawOrder(order, slotId, targetIndex);
};

const DrawOrderList = function DrawOrderList({
	project,
	order,
	label,
	editable,
	onChange,
	onNavigate
}: Readonly<{
	project: Project;
	order: readonly Id[];
	label: string;
	editable: boolean;
	onChange?: (order: readonly Id[]) => void;
	onNavigate?: (slotId: Id) => void;
}>): ReactElement {
	return (
		<div className="inspector-order-group">
			<div className="field-label">{label}</div>
			<ol className="context-order-list" aria-label={label}>
				{order.map((slotId, index) => {
					const slot = project.slots.find((candidate) => candidate.id === slotId);
					const slotName = slot?.name ?? slotId;

					return (
						<li data-slot-id={slotId} key={slotId}>
							<button className="inspector-link-button" type="button" onClick={() => onNavigate?.(slotId)}>{index + 1}. {slotName}</button>
							{editable && onChange && <span className="inspector-actions">
								<Tooltip label={`Move ${slotName} earlier`}>
									<button className="quiet-button" type="button" aria-label={`Move ${slotName} earlier`} disabled={index === 0} onClick={() => onChange(moveOrderSlot(order, slotId, -1))}>↑</button>
								</Tooltip>
								<Tooltip label={`Move ${slotName} later`}>
									<button className="quiet-button" type="button" aria-label={`Move ${slotName} later`} disabled={index === order.length - 1} onClick={() => onChange(moveOrderSlot(order, slotId, 1))}>↓</button>
								</Tooltip>
							</span>}
						</li>
					);
				})}
			</ol>
		</div>
	);
};

const DrawOrderInspector = function DrawOrderInspector({
	project,
	clip,
	context,
	collapsedSections,
	onToggleSection,
	onUpdate,
	onKeyCurrent,
	activeFrameIndex,
	mode,
	onNavigate
}: Readonly<{
	project: Project;
	clip: Clip;
	context: Extract<InspectorContext, { kind: 'draw-order' }>;
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onUpdate: (value: readonly Id[]) => void;
	onKeyCurrent?: (value: readonly Id[]) => void;
	activeFrameIndex: number;
	mode: EditorMode;
	onNavigate?: (entity: SelectableEntity) => void;
}>): ReactElement {
	const animateContext = mode === 'animate';
	const frameIndex = animateContext ? activeFrameIndex : 0;
	const setupView = drawOrderViewForFrame(project, undefined, 0);
	const view = drawOrderViewForFrame(project, animateContext ? clip : undefined, frameIndex);
	const track = trackFor(clip, context.trackId);
	const selectedKey = track?.kind === 'slot-draw-order' ? track.keys.find((candidate) => candidate.id === context.keyId) : undefined;
	const keyedOrder = selectedKey?.value;
	const currentSource = view.source === 'keyed'
		? `Keyed override from frame ${(view.keyFrameIndex ?? frameIndex) + 1}`
		: 'Setup fallback';
	const changeCurrent = function changeCurrent(order: readonly Id[]): void {
		if (onKeyCurrent) {
			onKeyCurrent(order);
			return;
		}

		onUpdate(order);
	};

	return (
		<CollapsibleInspectorSection
			ariaLabel="Draw order properties"
			collapsed={collapsedSections.has('draw-order')}
			detail={currentSource}
			eyebrow="Context"
			id="draw-order"
			label="Draw Order"
			onToggle={() => onToggleSection('draw-order')}
		>
			<p className="muted-copy">Back to front · frame {frameIndex + 1}</p>
			<DrawOrderList project={project} order={setupView.order} label="Setup value · back to front" editable={false} onNavigate={(slotId) => {
				const entity = slotEntity(project, slotId);

				if (entity) {
					onNavigate?.(entity);
				}
			}} />
			{animateContext && <DrawOrderList project={project} order={view.order} label={`Current evaluated order · ${currentSource}`} editable={onKeyCurrent !== undefined} onChange={changeCurrent} onNavigate={(slotId) => {
				const entity = slotEntity(project, slotId);

				if (entity) {
					onNavigate?.(entity);
				}
			}} />}
			{keyedOrder && <DrawOrderList project={project} order={keyedOrder} label={`Keyed value · frame ${frameForKey(clip, selectedKey?.timeSeconds ?? 0) + 1}`} editable onChange={onUpdate} onNavigate={(slotId) => {
				const entity = slotEntity(project, slotId);

				if (entity) {
					onNavigate?.(entity);
				}
			}} />}
			{keyedOrder === undefined && <p className="muted-copy">This context does not have a keyed order value.</p>}
		</CollapsibleInspectorSection>
	);
};

const AttachmentSwapInspector = function AttachmentSwapInspector({
	project,	clip,	context,	collapsedSections,	onToggleSection,	onUpdate,	onKeyCurrent,	activeFrameIndex,	activePose,	mode,	onNavigate
}: Readonly<{
	project: Project;
	clip: Clip;
	context: Extract<InspectorContext, { kind: 'attachment-swap' }>;
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onUpdate: (value: Id | null) => void;
	onKeyCurrent?: (value: Id | null) => void;
	activeFrameIndex: number;
	activePose?: EvaluatedPose;
	mode: EditorMode;
	onNavigate?: (entity: SelectableEntity) => void;
}>): ReactElement {
	const slot = project.slots.find((candidate) => candidate.id === context.slotId);
	const track = trackFor(clip, context.trackId);
	const selectedKey = track?.kind === 'slot-attachment' ? track.keys.find((candidate) => candidate.id === context.keyId) : undefined;
	const animateContext = mode === 'animate';
	const currentFrameIndex = animateContext ? activeFrameIndex : 0;
	const currentSlot = activePose?.slots.find((candidate) => candidate.id === context.slotId);
	const setupValue = slot?.setupAttachmentId ?? null;
	const currentKey = animateContext && track?.kind === 'slot-attachment'
		? track.keys
			.filter((key) => frameForKey(clip, key.timeSeconds) <= currentFrameIndex)
			.toSorted((left, right) => frameForKey(clip, left.timeSeconds) - frameForKey(clip, right.timeSeconds))
			.at(-1)
		: undefined;
	const currentValue = animateContext
		? currentKey?.value ?? currentSlot?.activeAttachmentId ?? setupValue
		: setupValue;
	const currentSource = currentKey
		? `Keyed at frame ${frameForKey(clip, currentKey.timeSeconds) + 1}`
		: 'Setup fallback';
	const attachments = project.attachments.filter((attachment) => attachment.kind === 'image' && attachment.slotId === context.slotId);
	const keyedValue = selectedKey?.value;
	const attachmentOptions = (label: string, value: Id | null, disabled: boolean, onChange?: (value: Id | null) => void): ReactElement => (
		<label className="shared-inspector-form">
			<span className="field-label">{label}</span>
			<select aria-label={label} disabled={disabled} value={value ?? ''} onChange={(event) => onChange?.(event.currentTarget.value || null)}>
				<option value="">None</option>
				{attachments.map((attachment) => <option key={attachment.id} value={attachment.id}>{attachment.name}</option>)}
			</select>
		</label>
	);
	const navigateAttachment = function navigateAttachment(attachmentId: Id | null): void {
		const entity = attachmentEntity(project, attachmentId);

		if (entity) {
			onNavigate?.(entity);
		}
	};

	return (
		<CollapsibleInspectorSection
			ariaLabel="Attachment swap properties"
			collapsed={collapsedSections.has('attachment-swap')}
			detail={slot?.name ?? context.slotId}
			eyebrow="Context"
			id="attachment-swap"
			label="Attachment swap"
			onToggle={() => onToggleSection('attachment-swap')}
		>
			<div className="inspector-context-links">
				<span>Slot: {slot?.name ?? context.slotId}</span>
				{slot && <button className="inspector-link-button" type="button" onClick={() => {
					const entity = slotEntity(project, slot.id);

					if (entity) {
						onNavigate?.(entity);
					}
				}}>Select slot</button>}
			</div>
			<div className="inspector-value-state"><span className="field-label">Setup value</span><button className="inspector-link-button" type="button" onClick={() => navigateAttachment(setupValue)}>{valueLabel(project, setupValue)}</button></div>
			{animateContext && attachmentOptions(`Current value · frame ${currentFrameIndex + 1}`, currentValue, onKeyCurrent === undefined, (value) => onKeyCurrent?.(value))}
			{animateContext && <div className="inspector-value-state"><span className="field-label">Current source</span><span>{currentSource}</span></div>}
			{animateContext && <button className="inspector-link-button" type="button" onClick={() => navigateAttachment(currentValue)}>{`Select current ${valueLabel(project, currentValue)}`}</button>}
			{keyedValue !== undefined && attachmentOptions(`Keyed value · frame ${frameForKey(clip, selectedKey?.timeSeconds ?? 0) + 1}`, keyedValue, false, onUpdate)}
			{keyedValue !== undefined && <button className="inspector-link-button" type="button" onClick={() => navigateAttachment(keyedValue)}>{`Select ${valueLabel(project, keyedValue)}`}</button>}
			{keyedValue === undefined && <p className="muted-copy">No keyed value is available for this context.</p>}
			<p className="muted-copy">Current edits create or update the attachment key at the active frame. Setup assignment remains independent.</p>
		</CollapsibleInspectorSection>
	);
};

export const SharedInspector = function SharedInspector({
	project,
	context,
	collapsedSections,
	onToggleSection,
	onRenameClip,
	onUpdateClipPlayback,
	onSaveClip,
	onDuplicateClip,
	onDeleteClip,
	onDeleteTrack,
	onUpdateNumberKeys,
	onUpdateKeys,
	onUpdateInterpolation,
	onMoveKeys,
	onUpdateEvent,
	onMoveEvent,
	onDeleteEvent,
	onUpdateAttachmentKey,
	onKeyCurrentAttachment,
	onUpdateDrawOrderKey,
	onKeyCurrentDrawOrder,
	activeClip,
	activeFrameIndex = 0,
	activePose,
	mode,
	onNavigateEntity
}: SharedInspectorProps): ReactElement | null {
	if (context.kind === 'none' || context.kind === 'entity') {
		return null;
	}

	const clip = clipFor(project, context.clipId);

	if (!clip) {
		return <section className="shared-inspector-context" aria-label="Animation context"><p className="muted-copy">The selected animation context is no longer available.</p></section>;
	}
	if (context.kind === 'clip') {
		return <ClipInspector clip={clip} collapsedSections={collapsedSections} onDeleteClip={onDeleteClip ? (): void => onDeleteClip(clip.id) : undefined} onDuplicateClip={onDuplicateClip ? (): void => onDuplicateClip(clip.id) : undefined} onToggleSection={onToggleSection} onRenameClip={(name: string): void => onRenameClip(clip.id, name)} onSaveClip={onSaveClip ? (name: string, settings: ClipPlaybackSettings): void => onSaveClip(clip.id, name, settings) : undefined} onUpdateClipPlayback={(settings: ClipPlaybackSettings): void => onUpdateClipPlayback(clip.id, settings)} />;
	}
	if (context.kind === 'track') {
		const track = trackFor(clip, context.trackId);

		return track ? <TrackInspector clip={clip} collapsedSections={collapsedSections} onToggleSection={onToggleSection} track={track} onDelete={() => onDeleteTrack(clip.id, track.id)} /> : null;
	}
	if (context.kind === 'event') {
		const event = clip.events.find((candidate) => candidate.id === context.eventId);

		return event ? <EventInspector clip={clip} collapsedSections={collapsedSections} onToggleSection={onToggleSection} event={event} onUpdate={(input) => onUpdateEvent(clip.id, event.id, input)} onMove={(timeSeconds) => onMoveEvent(clip.id, event.id, timeSeconds)} onDelete={() => onDeleteEvent(clip.id, event.id)} /> : null;
	}
	if (context.kind === 'draw-order') {
		return <DrawOrderInspector activeFrameIndex={activeClip?.id === clip.id && mode === 'animate' ? activeFrameIndex : 0} clip={clip} collapsedSections={collapsedSections} context={context} mode={mode ?? 'setup'} onKeyCurrent={activeClip?.id === clip.id && mode === 'animate' ? (value: readonly Id[]): void => { onKeyCurrentDrawOrder?.(clip.id, value); } : undefined} onNavigate={onNavigateEntity} onToggleSection={onToggleSection} onUpdate={(value) => onUpdateDrawOrderKey(clip.id, context.trackId, context.keyId, value)} project={project} />;
	}
	if (context.kind === 'attachment-swap') {
		return <AttachmentSwapInspector activeFrameIndex={activeClip?.id === clip.id && mode === 'animate' ? activeFrameIndex : 0} activePose={activeClip?.id === clip.id && mode === 'animate' ? activePose : undefined} clip={clip} collapsedSections={collapsedSections} context={context} mode={mode ?? 'setup'} onKeyCurrent={activeClip?.id === clip.id && mode === 'animate' ? (value: Id | null): void => { onKeyCurrentAttachment?.(clip.id, context.trackId, context.slotId, value); } : undefined} onNavigate={onNavigateEntity} onToggleSection={onToggleSection} onUpdate={(value) => onUpdateAttachmentKey(clip.id, context.trackId, context.keyId, value)} project={project} />;
	}

	const entries = keyEntriesFor(clip, context.keys);

	return entries.length > 0
		? <KeyInspector clip={clip} collapsedSections={collapsedSections} entries={entries} onMoveKeys={(changes) => onMoveKeys?.(clip.id, changes)} onToggleSection={onToggleSection} onUpdateInterpolation={(changes, input) => onUpdateInterpolation(clip.id, changes, input)} onUpdateKeys={onUpdateKeys ? (changes): void => onUpdateKeys(clip.id, changes) : undefined} onUpdateNumberKeys={(changes) => onUpdateNumberKeys(clip.id, changes)} />
		: null;
};
