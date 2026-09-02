import { useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { isEventPayload } from '../domain/events.ts';
import type { EntityId } from '../domain/ids.ts';
import type { EventKeyUpdate, NumberKeyInterpolationInput } from '../domain/animation.ts';
import type { Clip, CubicBezier, DiscreteKey, EventKey, NumberKey, Project, Track } from '../domain/model.ts';
import { frameIndexForTime } from './timeline.ts';
import type { InspectorContext } from './inspector-context.ts';
import type { TimelineKeyReference } from './timeline-model.ts';

type ClipPlaybackSettings = Readonly<Partial<{
	durationSeconds: number;
	fps: number;
	loop: boolean;
}>>;

export type NumberKeyChange = Readonly<{
	trackId: EntityId;
	keyId: EntityId;
	value?: number;
	timeSeconds?: number;
	}>;

export type SharedInspectorProps = Readonly<{
	project: Project;
	context: InspectorContext;
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onRenameClip: (clipId: EntityId, name: string) => void;
	onUpdateClipPlayback: (clipId: EntityId, settings: ClipPlaybackSettings) => void;
	onDeleteTrack: (clipId: EntityId, trackId: EntityId) => void;
	onUpdateNumberKeys: (clipId: EntityId, changes: readonly NumberKeyChange[]) => void;
	onUpdateInterpolation: (clipId: EntityId, changes: readonly NumberKeyChange[], input: NumberKeyInterpolationInput) => void;
	onUpdateEvent: (clipId: EntityId, eventId: EntityId, input: EventKeyUpdate) => void;
	onMoveEvent: (clipId: EntityId, eventId: EntityId, timeSeconds: number) => void;
	onDeleteEvent: (clipId: EntityId, eventId: EntityId) => void;
	onUpdateAttachmentKey: (clipId: EntityId, trackId: EntityId, keyId: EntityId, value: EntityId | null) => void;
	onUpdateDrawOrderKey: (clipId: EntityId, trackId: EntityId, keyId: EntityId, value: readonly EntityId[]) => void;
}>;

type NumberTrack = Extract<Track, {
	kind: 'bone-transform' | 'attachment-transform' | 'attachment-opacity' | 'rectangle-size';
}>;

type KeyEntry = Readonly<{
	reference: TimelineKeyReference;
	track: Track;
	key: Track['keys'][number];
}>;

const numberTrack = function numberTrack(track: Track): track is NumberTrack {
	return track.kind === 'bone-transform'
		|| track.kind === 'attachment-transform'
		|| track.kind === 'attachment-opacity'
		|| track.kind === 'rectangle-size';
};

const clipFor = function clipFor(project: Project, clipId: EntityId): Clip | undefined {
	return project.clips.find((clip) => clip.id === clipId);
};

const trackFor = function trackFor(clip: Clip, trackId: EntityId): Track | undefined {
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

const eventPayloadText = function eventPayloadText(event: EventKey): string {
	return JSON.stringify(event.payload, null, 2);
};

const parsedPayload = function parsedPayload(
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
	onUpdateClipPlayback
}: Readonly<{
	clip: Clip;
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onRenameClip: (name: string) => void;
	onUpdateClipPlayback: (settings: ClipPlaybackSettings) => void;
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

		if (nameValue.trim() !== clip.name) {
			onRenameClip(nameValue);
		}
		onUpdateClipPlayback({ durationSeconds: durationValue, fps: fpsValue, loop: data.get('clipLoop') === 'on' });
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
				<label><span className="field-label">Clip name</span><input name="clipName" defaultValue={clip.name} aria-label="Inspector clip field" /></label>
				<div className="shared-inspector-grid">
					<label><span className="field-label">Duration (s)</span><input name="clipDuration" type="number" min="0.001" step="0.001" defaultValue={clip.durationSeconds} aria-label="Clip duration" /></label>
					<label><span className="field-label">FPS</span><input name="clipFps" type="number" min="0.001" step="0.001" defaultValue={clip.fps} aria-label="Inspector frame rate" /></label>
				</div>
				<label className="shared-checkbox"><input name="clipLoop" type="checkbox" aria-label="Inspector playback flag" defaultChecked={clip.loop} /> <span>Loop playback</span></label>
				{error && <small className="field-error" role="alert">{error}</small>}
				<button className="secondary-button" type="submit">Save clip</button>
			</form>
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

const curveForEntries = function curveForEntries(entries: readonly KeyEntry[]): CubicBezier | undefined {
	const curves = entries.flatMap((entry) => {
		if (!numberTrack(entry.track) || !('interpolation' in entry.key) || entry.key.interpolation !== 'bezier' || !entry.key.curve) {
			return [];
		}

		return [entry.key.curve];
	});

	return curves[0];
};

type BezierHandle = keyof CubicBezier;

const clampedBezierValue = function clampedBezierValue(value: number): number {
	return Math.max(0, Math.min(1, value));
};

const updateBezierHandle = function updateBezierHandle(
	curve: CubicBezier,
	handle: BezierHandle,
	value: number
): CubicBezier {
	const nextValue = clampedBezierValue(value);

	if (handle === 'x1') {
		return { ...curve, x1: nextValue };
	}
	if (handle === 'y1') {
		return { ...curve, y1: nextValue };
	}
	if (handle === 'x2') {
		return { ...curve, x2: nextValue };
	}

	return { ...curve, y2: nextValue };
};

const SharedBezierEditor = function SharedBezierEditor({
	curve,
	onChange
}: Readonly<{
	curve: CubicBezier;
	onChange: (curve: CubicBezier) => void;
}>): ReactElement {
	const handles: readonly BezierHandle[] = ['x1', 'y1', 'x2', 'y2'];

	return (
		<fieldset className="shared-bezier-editor">
			<legend>Bezier curve editor</legend>
			<svg className="bezier-preview" viewBox="0 0 100 100" role="img" aria-label="Bezier curve preview">
				<path className="bezier-grid-line" d="M 0 100 L 100 0" />
				<path className="shared-bezier-curve" d={'M 0 100 C ' + curve.x1 * 100 + ' ' + (100 - curve.y1 * 100) + ', ' + curve.x2 * 100 + ' ' + (100 - curve.y2 * 100) + ', 100 0'} />
				<circle className="bezier-handle" cx={curve.x1 * 100} cy={100 - curve.y1 * 100} r="3" />
				<circle className="bezier-handle" cx={curve.x2 * 100} cy={100 - curve.y2 * 100} r="3" />
			</svg>
			<div className="shared-inspector-grid">
				{handles.map((handle) => (
					<label key={handle}>
						<span className="field-label">{handle.toUpperCase()}</span>
						<input
							aria-label={'Bezier ' + handle}
							type="number"
							min="0"
							max="1"
							step="0.01"
							value={curve[handle]}
							onChange={(event) => {
								const value = Number(event.currentTarget.value);

								if (Number.isFinite(value)) {
									onChange(updateBezierHandle(curve, handle, value));
								}
							}}
						/>
					</label>
				))}
			</div>
		</fieldset>
	);
};

const KeyInspector = function KeyInspector({
	clip,
	entries,
	collapsedSections,
	onToggleSection,
	onUpdateNumberKeys,
	onUpdateInterpolation
}: Readonly<{
	clip: Clip;
	entries: readonly KeyEntry[];
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onUpdateNumberKeys: (changes: readonly NumberKeyChange[]) => void;
	onUpdateInterpolation: (changes: readonly NumberKeyChange[], input: NumberKeyInterpolationInput) => void;
}>): ReactElement {
	const numericEntries = entries.filter((entry): entry is KeyEntry & Readonly<{ key: NumberKey; track: NumberTrack }> => numberTrack(entry.track) && 'value' in entry.key && 'interpolation' in entry.key);
	const interpolationValues = numericEntries.map((entry) => entry.key.interpolation);
	const interpolation = interpolationValues.length > 0 && interpolationValues.every((value) => value === interpolationValues[0]) ? interpolationValues[0] : 'mixed';
	const values = numericEntries.map((entry) => entry.key.value);
	const sharedValue = values.length > 0 && values.every((value) => value === values[0]) ? values[0] : undefined;
	const firstNumber = numericEntries[0]?.key;
	const firstFrame = entries[0] ? frameIndexForTime(clip, entries[0].key.timeSeconds) + 1 : 1;
	const [error, setError] = useState<string | undefined>(undefined);
	const curve = curveForEntries(numericEntries);
	const submitNumberChanges = function submitNumberChanges(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const frame = Number(data.get('keyFrame'));
		const value = Number(data.get('keyValue'));

		if (!Number.isInteger(frame) || frame < 1 || frame > Math.round(clip.durationSeconds * clip.fps) + 1) {
			setError('Frame must be an integer inside the clip.');
			return;
		}
		if (!Number.isFinite(value)) {
			setError('Key value must be finite.');
			return;
		}

		if (numericEntries.length > 0) {
			onUpdateNumberKeys(numericEntries.map((entry) => ({ trackId: entry.reference.trackId, keyId: entry.reference.keyId, value, timeSeconds: (frame - 1) / clip.fps })));
		}
		setError(undefined);
	};
	const updateInterpolation = function updateInterpolation(value: string): void {
		if (value !== 'stepped' && value !== 'linear' && value !== 'bezier') {
			return;
		}

		const input: NumberKeyInterpolationInput = value === 'bezier'
			? { interpolation: value, curve: curve ?? { x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 } }
			: { interpolation: value, curve: null };

		onUpdateInterpolation(numericEntries.map((entry) => ({ trackId: entry.reference.trackId, keyId: entry.reference.keyId })), input);
	};

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
			<p className="muted-copy">Frame {firstFrame}{entries.length > 1 ? ' · mixed selection' : ''}</p>
			{numericEntries.length > 0 && (
				<form className="shared-inspector-form" key={`${entries.map((entry) => entry.reference.keyId).join('|')}:${firstNumber?.value}:${firstNumber?.timeSeconds}`} onSubmit={submitNumberChanges}>
					<div className="shared-inspector-grid">
						<label><span className="field-label">Frame</span><input name="keyFrame" type="number" min="1" step="1" defaultValue={firstFrame} aria-label="Key frame" /></label>
					<label><span className="field-label">Value</span><input name="keyValue" type="number" step="any" defaultValue={sharedValue} placeholder={sharedValue === undefined ? 'Mixed values' : undefined} aria-label="Inspector value" /></label>
				</div>
				<label><span className="field-label">Interpolation</span><select aria-label="Inspector easing mode" value={interpolation} onChange={(event) => updateInterpolation(event.currentTarget.value)}><option value="mixed">Mixed</option><option value="stepped">Stepped</option><option value="linear">Linear</option><option value="bezier">Bezier</option></select></label>
					{sharedValue === undefined && <small className="muted-copy">Selected keys have mixed values.</small>}
					{interpolation === 'bezier' && curve && <SharedBezierEditor curve={curve} onChange={(nextCurve) => onUpdateInterpolation(numericEntries.map((entry) => ({ trackId: entry.reference.trackId, keyId: entry.reference.keyId })), { interpolation: 'bezier', curve: nextCurve })} />}
					{error && <small className="field-error" role="alert">{error}</small>}
					<button className="secondary-button" type="submit">Apply key values</button>
				</form>
			)}
			{numericEntries.length === 0 && <p className="muted-copy">This is a discrete key. Edit its value from the control below.</p>}
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
	const [frame, setFrame] = useState(String(frameIndexForTime(clip, event.timeSeconds) + 1));
	const [payload, setPayload] = useState(eventPayloadText(event));
	const [error, setError] = useState<string | undefined>(undefined);
	const submit = function submit(eventSubmit: FormEvent<HTMLFormElement>): void {
		eventSubmit.preventDefault();
		const frameValue = Number(frame);
		const parsed = parsedPayload(payload);

		if (name.trim().length === 0) {
			setError('Event name is required.');
			return;
		}
		if (!Number.isInteger(frameValue) || frameValue < 1 || frameValue > Math.round(clip.durationSeconds * clip.fps) + 1) {
			setError('Event frame must be an integer inside the clip.');
			return;
		}
		if (!parsed.ok) {
			setError(parsed.error);
			return;
		}

		onUpdate({ name, payload: parsed.value });
		onMove((frameValue - 1) / clip.fps);
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
				<label><span className="field-label">Name</span><input aria-label="Inspector event field" value={name} onChange={(inputEvent) => setName(inputEvent.currentTarget.value)} /></label>
				<label><span className="field-label">Frame</span><input aria-label="Inspector event position" type="number" min="1" step="1" value={frame} onChange={(inputEvent) => setFrame(inputEvent.currentTarget.value)} /></label>
				<label><span className="field-label">Payload JSON</span><textarea aria-label="Inspector payload field" rows={5} value={payload} onChange={(inputEvent) => setPayload(inputEvent.currentTarget.value)} /></label>
				{error && <small className="field-error" role="alert">{error}</small>}
				<div className="inspector-actions"><button className="secondary-button" type="submit">Save event</button><button className="danger-button" type="button" onClick={onDelete}>Delete selected event</button></div>
			</form>
		</CollapsibleInspectorSection>
	);
};

const moveOrderSlot = function moveOrderSlot(
	order: readonly EntityId[],
	slotId: EntityId,
	direction: -1 | 1
): readonly EntityId[] {
	const index = order.indexOf(slotId);
	const target = index + direction;

	return index < 0 || target < 0 || target >= order.length
		? order
		: order.map((id, currentIndex) => currentIndex === index
			? order[target]
			: currentIndex === target ? order[index] : id);
};

const DrawOrderInspector = function DrawOrderInspector({
	project,
	track,
	drawKey,
	clip,
	collapsedSections,
	onToggleSection,
	onUpdate
}: Readonly<{
	project: Project;
	track: Extract<Track, { kind: 'slot-draw-order' }>;
	drawKey: DiscreteKey<readonly EntityId[]>;
	clip: Clip;
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onUpdate: (value: readonly EntityId[]) => void;
}>): ReactElement {
	const slots = new Map(project.slots.map((slot) => [slot.id, slot] as const));

	return (
		<CollapsibleInspectorSection
			ariaLabel="Draw order key properties"
			collapsed={collapsedSections.has('draw-order')}
			detail="Current keyed order"
			eyebrow="Context"
			id="draw-order"
			label="Draw Order"
			onToggle={() => onToggleSection('draw-order')}
		>
			<ol className="context-order-list">
				{drawKey.value.map((slotId, index) => <li key={slotId}><span>{index + 1}. {slots.get(slotId)?.name ?? slotId}</span><span className="inspector-actions"><button className="quiet-button" type="button" aria-label={`Move ${slots.get(slotId)?.name ?? slotId} up`} disabled={index === 0} onClick={() => onUpdate(moveOrderSlot(drawKey.value, slotId, -1))}>↑</button><button className="quiet-button" type="button" aria-label={`Move ${slots.get(slotId)?.name ?? slotId} down`} disabled={index === drawKey.value.length - 1} onClick={() => onUpdate(moveOrderSlot(drawKey.value, slotId, 1))}>↓</button></span></li>)}
			</ol>
			<p className="muted-copy">Track {track.id} · frame {frameIndexForTime(clip, drawKey.timeSeconds) + 1}</p>
		</CollapsibleInspectorSection>
	);
};

const AttachmentSwapInspector = function AttachmentSwapInspector({
	project,
	track,
	attachmentKey,
	collapsedSections,
	onToggleSection,
	onUpdate
}: Readonly<{
	project: Project;
	track: Extract<Track, { kind: 'slot-attachment' }>;
	attachmentKey: DiscreteKey<EntityId | null>;
	collapsedSections: ReadonlySet<string>;
	onToggleSection: (sectionId: string) => void;
	onUpdate: (value: EntityId | null) => void;
}>): ReactElement {
	const slot = project.slots.find((candidate) => candidate.id === track.targetId);
	const attachments = project.attachments.filter((attachment) => attachment.kind === 'image' && attachment.slotId === track.targetId);

	return (
		<CollapsibleInspectorSection
			ariaLabel="Attachment swap properties"
			collapsed={collapsedSections.has('attachment-swap')}
			detail={slot?.name ?? track.targetId}
			eyebrow="Context"
			id="attachment-swap"
			label="Attachment swap"
			onToggle={() => onToggleSection('attachment-swap')}
		>
			<label className="shared-inspector-form"><span className="field-label">Keyed attachment</span><select aria-label="Keyed attachment" value={attachmentKey.value ?? ''} onChange={(event) => onUpdate(event.currentTarget.value || null)}><option value="">None</option>{attachments.map((attachment) => <option key={attachment.id} value={attachment.id}>{attachment.name}</option>)}</select></label>
			<p className="muted-copy">The slot keeps its setup attachment when no keyed value is selected.</p>
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
	onDeleteTrack,
	onUpdateNumberKeys,
	onUpdateInterpolation,
	onUpdateEvent,
	onMoveEvent,
	onDeleteEvent,
	onUpdateAttachmentKey,
	onUpdateDrawOrderKey
}: SharedInspectorProps): ReactElement | null {
	if (context.kind === 'none' || context.kind === 'entity') {
		return null;
	}

	const clip = clipFor(project, context.clipId);

	if (!clip) {
		return <section className="shared-inspector-context" aria-label="Animation context"><p className="muted-copy">The selected animation context is no longer available.</p></section>;
	}
	if (context.kind === 'clip') {
		return <ClipInspector clip={clip} collapsedSections={collapsedSections} onToggleSection={onToggleSection} onRenameClip={(name) => onRenameClip(clip.id, name)} onUpdateClipPlayback={(settings) => onUpdateClipPlayback(clip.id, settings)} />;
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
		const track = trackFor(clip, context.trackId);
		const key = track?.kind === 'slot-draw-order' ? track.keys.find((candidate) => candidate.id === context.keyId) : undefined;

		return track?.kind === 'slot-draw-order' && key
			? <DrawOrderInspector clip={clip} collapsedSections={collapsedSections} onToggleSection={onToggleSection} project={project} track={track} drawKey={key} onUpdate={(value) => onUpdateDrawOrderKey(clip.id, track.id, key.id, value)} />
			: null;
	}
	if (context.kind === 'attachment-swap') {
		const track = trackFor(clip, context.trackId);
		const key = track?.kind === 'slot-attachment' ? track.keys.find((candidate) => candidate.id === context.keyId) : undefined;

		return track?.kind === 'slot-attachment' && key
			? <AttachmentSwapInspector collapsedSections={collapsedSections} onToggleSection={onToggleSection} project={project} track={track} attachmentKey={key} onUpdate={(value) => onUpdateAttachmentKey(clip.id, track.id, key.id, value)} />
			: null;
	}

	const entries = keyEntriesFor(clip, context.keys);

	return entries.length > 0
		? <KeyInspector clip={clip} collapsedSections={collapsedSections} onToggleSection={onToggleSection} entries={entries} onUpdateNumberKeys={(changes) => onUpdateNumberKeys(clip.id, changes)} onUpdateInterpolation={(changes, input) => onUpdateInterpolation(clip.id, changes, input)} />
		: null;
};
