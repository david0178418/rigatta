import { useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { isEventPayload } from '../domain/events.ts';
import { parseEntityId, type EntityId } from '../domain/ids.ts';
import type { AttachmentKeyInput, BooleanKeyInput, DrawOrderKeyInput, EventKeyInput, EventKeyUpdate, NumberKeyInput, NumberKeyInterpolationInput, TrackDefinition } from '../domain/animation.ts';
import { frameCountForClip, frameTimeSeconds, type PlaybackDirection, type PlaybackState } from '../domain/playback.ts';
import type { Clip, CubicBezier, Interpolation, Project, Track } from '../domain/model.ts';
import { availableTrackDefinitions, buildTimelineTrackRows, createTimelineViewport, frameIndexForTime, panTimeline, resetTimelineViewport, timelineFrameRange, visibleFrameCount, zoomTimeline, type TimelineViewport } from './timeline.ts';
import { timelineHeightBounds, timelineHeightFromKeyboard, timelineHeightFromPointer } from './timeline-layout.ts';
import { buildGroupedTimelineRows, createTimelineClipboard, planKeyDrag, planNudgeKeys, selectableEntityForTimelineRow, type TimelineClipboard, type TimelineKeyReference, type TimelineRow, type TimelineRowMode } from './timeline-model.ts';
import type { SelectableEntity, Selection } from './selection.ts';
import type { InspectorContext } from './inspector-context.ts';

const formNumber = function formNumber(data: FormData, name: string): number | undefined {
	const value = data.get(name);

	if (typeof value !== 'string' || value.trim().length === 0) {
		return undefined;
	}

	const number = Number(value);

	return Number.isFinite(number) ? number : undefined;
};

const enabledValueForTrack = function enabledValueForTrack(project: Project, track: Track): boolean {
	const attachment = 'targetId' in track
		? project.attachments.find((candidate) => candidate.id === track.targetId)
		: undefined;

	if (track.kind === 'point-enabled') {
		return attachment?.kind === 'point' ? attachment.enabled : true;
	}
	if (track.kind === 'rectangle-enabled') {
		return attachment?.kind === 'rectangle' ? attachment.enabled : true;
	}

	return true;
};

export type ClipPlaybackSettings = Readonly<Partial<{
	durationSeconds: number;
	fps: number;
	loop: boolean;
}>>;

export type AnimationKeyInput =
	| Readonly<{ kind: 'number'; input: NumberKeyInput }>
	| Readonly<{ kind: 'attachment'; input: AttachmentKeyInput }>
	| Readonly<{ kind: 'draw-order'; input: DrawOrderKeyInput }>
	| Readonly<{ kind: 'boolean'; input: BooleanKeyInput }>;

type BezierPoint = 'first' | 'second';
type BezierCoordinate = 'x' | 'y';

const graphY = function graphY(value: number): number {
	return 1 - value;
};

const clampBezierY = function clampBezierY(value: number): number {
	return Math.max(-0.5, Math.min(1.5, value));
};

const BezierGraphEditor = function BezierGraphEditor({
	curve,
	onChange
}: Readonly<{ curve: CubicBezier; onChange: (curve: CubicBezier) => void }>): ReactElement {
	const [draftCurve, setDraftCurve] = useState<CubicBezier>(() => curve);
	const [dragging, setDragging] = useState<BezierPoint | undefined>(undefined);
	const commitCurve = function commitCurve(): void {
		onChange(draftCurve);
	};
	const updateDraftCoordinate = function updateDraftCoordinate(
		point: BezierPoint,
		coordinate: BezierCoordinate,
		value: string
	): void {
		const number = Number(value);

		if (!Number.isFinite(number)) {
			return;
		}

		const property = point === 'first'
			? coordinate === 'x' ? 'x1' : 'y1'
			: coordinate === 'x' ? 'x2' : 'y2';

		setDraftCurve((current) => ({ ...current, [property]: number }));
	};
	const updateDraftFromPointer = function updateDraftFromPointer(event: ReactPointerEvent<SVGSVGElement>): void {
		if (!dragging) {
			return;
		}

		const bounds = event.currentTarget.getBoundingClientRect();
		const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
		const screenY = (event.clientY - bounds.top) / bounds.height * 2 - 0.5;
		const value = clampBezierY(1 - screenY);
		const property = dragging === 'first'
			? 'x1'
			: 'x2';
		const yProperty = dragging === 'first' ? 'y1' : 'y2';

		setDraftCurve((current) => ({ ...current, [property]: x, [yProperty]: value }));
	};
	const endPointerDrag = function endPointerDrag(): void {
		if (!dragging) {
			return;
		}

		setDragging(undefined);
		commitCurve();
	};
	const beginPointerDrag = function beginPointerDrag(point: BezierPoint, event: ReactPointerEvent<SVGCircleElement>): void {
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		setDragging(point);
	};

	return (
		<div className="bezier-editor">
			<div className="bezier-graph-wrap">
				<svg
					aria-label="Bezier curve editor"
					className="bezier-graph"
					role="img"
					viewBox="0 -0.5 1 2"
					onPointerMove={updateDraftFromPointer}
					onPointerUp={endPointerDrag}
					onPointerCancel={endPointerDrag}
				>
					<rect className="bezier-graph-background" x="0" y="-0.5" width="1" height="2" />
					<path className="bezier-graph-grid" d="M 0 1 H 1 M 0 0.5 H 1 M 0 0 H 1 M 0 1 V 0" />
					<line className="bezier-control-line" x1="0" y1="1" x2={draftCurve.x1} y2={graphY(draftCurve.y1)} />
					<line className="bezier-control-line" x1="1" y1="0" x2={draftCurve.x2} y2={graphY(draftCurve.y2)} />
					<path className="bezier-curve" d={`M 0 1 C ${draftCurve.x1} ${graphY(draftCurve.y1)}, ${draftCurve.x2} ${graphY(draftCurve.y2)}, 1 0`} />
					<circle
						className="bezier-control-point"
						cx={draftCurve.x1}
						cy={graphY(draftCurve.y1)}
						r="0.045"
						onPointerDown={(event) => beginPointerDrag('first', event)}
																	/>
					<circle
						className="bezier-control-point"
						cx={draftCurve.x2}
						cy={graphY(draftCurve.y2)}
						r="0.045"
						onPointerDown={(event) => beginPointerDrag('second', event)}
					/>
				</svg>
			</div>
			<div className="bezier-controls">
				<label><span className="field-label">P1 X</span><input aria-label="P1 X" type="number" min="0" max="1" step="0.01" value={draftCurve.x1} onChange={(event) => updateDraftCoordinate('first', 'x', event.currentTarget.value)} onBlur={commitCurve} /></label>
				<label><span className="field-label">P1 Y</span><input aria-label="P1 Y" type="number" step="0.01" value={draftCurve.y1} onChange={(event) => updateDraftCoordinate('first', 'y', event.currentTarget.value)} onBlur={commitCurve} /></label>
				<label><span className="field-label">P2 X</span><input aria-label="P2 X" type="number" min="0" max="1" step="0.01" value={draftCurve.x2} onChange={(event) => updateDraftCoordinate('second', 'x', event.currentTarget.value)} onBlur={commitCurve} /></label>
				<label><span className="field-label">P2 Y</span><input aria-label="P2 Y" type="number" step="0.01" value={draftCurve.y2} onChange={(event) => updateDraftCoordinate('second', 'y', event.currentTarget.value)} onBlur={commitCurve} /></label>
				<button className="quiet-button" type="button" onClick={commitCurve}>Apply curve</button>
			</div>
		</div>
	);
};

const moveDrawOrderSlot = function moveDrawOrderSlot(
	order: readonly EntityId[],
	slotId: EntityId,
	direction: -1 | 1
): readonly EntityId[] {
	const index = order.indexOf(slotId);
	const targetIndex = index + direction;

	if (index < 0 || targetIndex < 0 || targetIndex >= order.length) {
		return order;
	}

	const moving = order[index];
	const target = order[targetIndex];

	if (!moving || !target) {
		return order;
	}

	return order.map((current, currentIndex) => currentIndex === index
		? target
		: currentIndex === targetIndex
			? moving
			: current);
};

type TimelineSplitterProps = Readonly<{
	height: number;
	viewportHeight: number;
	onHeightChange: (height: number) => void;
}>;

export const TimelineSplitter = function TimelineSplitter({ height, viewportHeight, onHeightChange }: TimelineSplitterProps): ReactElement {
	const pointerSessionRef = useRef<Readonly<{ id: number; startY: number; startHeight: number }> | undefined>(undefined);
	const [dragging, setDragging] = useState(false);
	const bounds = timelineHeightBounds(viewportHeight);
	const beginPointerDrag = function beginPointerDrag(event: ReactPointerEvent<HTMLDivElement>): void {
		if (event.button !== 0) {
			return;
		}

		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		pointerSessionRef.current = { id: event.pointerId, startY: event.clientY, startHeight: height };
		setDragging(true);
	};
	const updatePointerDrag = function updatePointerDrag(event: ReactPointerEvent<HTMLDivElement>): void {
		const session = pointerSessionRef.current;

		if (!session || session.id !== event.pointerId) {
			return;
		}

		onHeightChange(timelineHeightFromPointer(session.startHeight, session.startY, event.clientY, viewportHeight));
	};
	const endPointerDrag = function endPointerDrag(event: ReactPointerEvent<HTMLDivElement>): void {
		const session = pointerSessionRef.current;

		if (!session || session.id !== event.pointerId) {
			return;
		}

		pointerSessionRef.current = undefined;
		setDragging(false);

		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};
	const updateFromKeyboard = function updateFromKeyboard(event: ReactKeyboardEvent<HTMLDivElement>): void {
		const nextHeight = timelineHeightFromKeyboard(height, event.key, viewportHeight);

		if (nextHeight === undefined) {
			return;
		}

		event.preventDefault();
		onHeightChange(nextHeight);
	};

	return (
		<div
			className={dragging ? 'timeline-splitter is-dragging' : 'timeline-splitter'}
			role="separator"
			tabIndex={0}
			aria-label="Resize animation timeline"
			aria-orientation="horizontal"
			aria-valuemin={bounds.min}
			aria-valuemax={bounds.max}
			aria-valuenow={height}
			aria-valuetext={`${height} pixels`}
			aria-controls="animation-timeline-pane"
			onKeyDown={updateFromKeyboard}
			onPointerDown={beginPointerDrag}
			onPointerMove={updatePointerDrag}
			onPointerUp={endPointerDrag}
			onPointerCancel={endPointerDrag}
		>
			<span className="timeline-splitter-grip" aria-hidden="true" />
		</div>
	);
};

type AnimateTimelineProps = Readonly<{
	project: Project;
	activeClip: Clip | undefined;
	playback: PlaybackState;
	selection: Selection;
	rowMode: TimelineRowMode;
	expandedRowIds: ReadonlySet<string>;
	pinnedEntityIds: ReadonlySet<EntityId>;
	autoKey: boolean;
	pendingEditCount: number;
	onSelectClip: (clipId: EntityId) => void;
	onCreateClip: () => void;
	onDuplicateClip: () => void;
	onRenameClip: (name: string) => void;
	onDeleteClip: () => void;
	onAddEvent: (input: EventKeyInput) => EntityId | undefined;
	onUpdateEvent: (eventId: EntityId, input: EventKeyUpdate) => void;
	onMoveEvent: (eventId: EntityId, timeSeconds: number) => void;
	onDeleteEvent: (eventId: EntityId) => void;
	onUpdatePlayback: (settings: ClipPlaybackSettings) => void;
	onTogglePlayback: () => void;
	onStepPlayback: (direction: PlaybackDirection) => void;
	onSeekPlayback: (frameIndex: number) => void;
	onCreateTrack: (definition: TrackDefinition) => EntityId | undefined;
	onDeleteTrack: (trackId: EntityId) => void;
	onAddKey: (trackId: EntityId, input: AnimationKeyInput) => EntityId | undefined;
	onMoveKey: (trackId: EntityId, keyId: EntityId, frameIndex: number) => void;
	onCopyKey: (trackId: EntityId, keyId: EntityId, frameIndex: number) => EntityId | undefined;
	onUpdateInterpolation: (trackId: EntityId, keyId: EntityId, input: NumberKeyInterpolationInput) => void;
	onUpdateAttachmentKey: (trackId: EntityId, keyId: EntityId, value: EntityId | null) => void;
	onUpdateDrawOrderKey: (trackId: EntityId, keyId: EntityId, value: readonly EntityId[]) => void;
	onDeleteKeys: (keys: readonly Readonly<{ trackId: EntityId; keyId: EntityId }>[]) => void;
	onRetimeKeys: (keys: readonly Readonly<{ trackId: EntityId; keyId: EntityId }>[], deltaFrames: number) => void;
	onPasteKeys: (clipboard: TimelineClipboard) => void;
	onSelectEntity: (entity: SelectableEntity, additive: boolean) => void;
	onRowModeChange: (mode: TimelineRowMode) => void;
	onExpandedRowIdsChange: (ids: ReadonlySet<string>) => void;
	onTogglePinnedEntity: (entityId: EntityId) => void;
	onClearPinnedEntities: () => void;
	onContextChange: (context: InspectorContext) => void;
	onAutoKeyChange: (enabled: boolean) => void;
	onKeyPendingEdits: () => void;
}>;

type TimelineDetail = 'clip' | 'track' | 'key' | 'event';

type TimelineKeyDragSession = Readonly<{
	pointerId: number;
	trackId: EntityId;
	keyId: EntityId;
	startX: number;
	selectedKeys: readonly TimelineKeyReference[];
	}>;

type TimelineMarqueeSession = Readonly<{
	pointerId: number;
	trackId: EntityId;
	startX: number;
	startY: number;
	additive: boolean;
	}>;

export const AnimateTimeline = function AnimateTimeline({
	project,
	activeClip,
	playback,
	selection,
	rowMode,
	expandedRowIds,
	pinnedEntityIds,
	autoKey,
	pendingEditCount,
	onSelectClip,
	onCreateClip,
	onDuplicateClip,
	onRenameClip,
	onDeleteClip,
	onAddEvent,
	onUpdateEvent,
	onMoveEvent,
	onDeleteEvent,
	onUpdatePlayback,
	onTogglePlayback,
	onStepPlayback,
	onSeekPlayback,
	onCreateTrack,
	onDeleteTrack,
	onAddKey,
	onMoveKey,
	onCopyKey,
	onUpdateInterpolation,
	onUpdateAttachmentKey,
	onUpdateDrawOrderKey,
	onDeleteKeys,
	onRetimeKeys,
	onPasteKeys,
	onSelectEntity,
	onRowModeChange,
	onExpandedRowIdsChange,
	onTogglePinnedEntity,
	onClearPinnedEntities,
	onContextChange,
	onAutoKeyChange,
	onKeyPendingEdits
}: AnimateTimelineProps): ReactElement {
	const [timelineViewport, setTimelineViewport] = useState<TimelineViewport>(createTimelineViewport);
	const [trackFilter, setTrackFilter] = useState('');
	const [selectedTrackId, setSelectedTrackId] = useState<EntityId | undefined>(undefined);
	const [selectedKeys, setSelectedKeys] = useState<readonly Readonly<{ trackId: EntityId; keyId: EntityId }>[]>([]);
	const [trackDefinitionValue, setTrackDefinitionValue] = useState('');
	const [selectedEventId, setSelectedEventId] = useState<EntityId | undefined>(undefined);
	const [eventError, setEventError] = useState<string | undefined>(undefined);
	const [openDetails, setOpenDetails] = useState<TimelineDetail | undefined>(undefined);
	const [timelineClipboard, setTimelineClipboard] = useState<TimelineClipboard | undefined>(undefined);
	const [timelineNotice, setTimelineNotice] = useState<string | undefined>(undefined);
	const [timelineMarquee, setTimelineMarquee] = useState<Readonly<{ left: number; top: number; width: number; height: number }> | undefined>(undefined);
	const [timelineKeyDragDelta, setTimelineKeyDragDelta] = useState(0);
	const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
	const keyDragRef = useRef<TimelineKeyDragSession | undefined>(undefined);
	const keyDragDeltaRef = useRef(0);
	const keyDragClickSuppressedRef = useRef(false);
	const marqueeRef = useRef<TimelineMarqueeSession | undefined>(undefined);
	const openDetailSurface = function openDetailSurface(detail: TimelineDetail, trigger: HTMLButtonElement): void {
		detailTriggerRef.current = trigger;
		setOpenDetails(detail);
	};
	const closeDetailSurface = function closeDetailSurface(): void {
		const trigger = detailTriggerRef.current;

		detailTriggerRef.current = null;
		setOpenDetails(undefined);
		trigger?.focus();
	};
	const submitClipName = function submitClipName(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const name = new FormData(event.currentTarget).get('name');

		if (typeof name === 'string') {
			onRenameClip(name);
		}
	};
	const addTimelineEvent = function addTimelineEvent(): void {
		if (!activeClip) {
			return;
		}

		const id = onAddEvent({
			timeSeconds: playback.frameIndex / activeClip.fps,
			name: 'event',
			payload: {}
		});

		if (id) {
			setSelectedEventId(id);
			setEventError(undefined);
			onContextChange({ kind: 'event', clipId: activeClip.id, eventId: id });
		}
	};
	const submitEventDetails = function submitEventDetails(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();

		if (!selectedEvent) {
			return;
		}

		const data = new FormData(event.currentTarget);
		const name = data.get('eventName');
		const payloadText = data.get('eventPayload');

		if (typeof name !== 'string' || typeof payloadText !== 'string') {
			return;
		}

		let payload: unknown;

		try {
			payload = JSON.parse(payloadText);
		} catch {
			setEventError('Event payload must be valid JSON.');
			return;
		}
		if (!isEventPayload(payload)) {
			setEventError('Event payload must be a bounded JSON object.');
			return;
		}

		onUpdateEvent(selectedEvent.id, { name, payload });
		setEventError(undefined);
	};
	const submitEventMove = function submitEventMove(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();

		if (!activeClip || !selectedEvent) {
			return;
		}

		const frame = formNumber(new FormData(event.currentTarget), 'eventFrame');

		if (frame === undefined || frame < 1 || frame > frameCount || !Number.isInteger(frame)) {
			setEventError(`Event frame must be an integer between 1 and ${frameCount}.`);
			return;
		}

		onMoveEvent(selectedEvent.id, (frame - 1) / activeClip.fps);
		setEventError(undefined);
	};
	const deleteTimelineEvent = function deleteTimelineEvent(): void {
		if (!selectedEvent) {
			return;
		}

		onDeleteEvent(selectedEvent.id);
		setSelectedEventId(undefined);
		setEventError(undefined);
		onContextChange({ kind: 'none' });
	};
	const submitPlayback = function submitPlayback(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const data = new FormData(event.currentTarget);
		const durationSeconds = formNumber(data, 'durationSeconds');
		const fps = formNumber(data, 'fps');

		if (durationSeconds === undefined || fps === undefined) {
			return;
		}

		onUpdatePlayback({ durationSeconds, fps, loop: data.get('loop') === 'on' });
	};
	const frameCount = activeClip ? frameCountForClip(activeClip) : 1;
	const timelineRange = timelineFrameRange(timelineViewport, frameCount);
	const timelineVisibleCount = visibleFrameCount(timelineViewport, frameCount);
	const trackRows = activeClip ? buildTimelineTrackRows(project, activeClip, trackFilter) : [];
	const selectedTrackEntityIds = selectedTrackId
		? new Set(trackRows
			.filter((row) => row.track.id === selectedTrackId)
			.flatMap((row) => 'targetId' in row.track ? [row.track.targetId] : []))
		: new Set<EntityId>();
	const groupedRows = activeClip ? buildGroupedTimelineRows(project, activeClip, {
		mode: rowMode,
		filter: trackFilter,
		expandedIds: expandedRowIds,
		pinnedEntityIds,
		selection,
		selectedTrackIds: selectedTrackId ? new Set([selectedTrackId]) : new Set<EntityId>(),
		selectedEntityIds: selectedTrackEntityIds
	}) : [];
	const trackOptions = activeClip ? availableTrackDefinitions(project, activeClip) : [];
	const selectedTrackOption = trackOptions.find((candidate) => candidate.value === trackDefinitionValue) ?? trackOptions[0];
	const selectedRow = trackRows.find((row) => row.track.id === selectedTrackId) ?? trackRows[0];
	const selectedTrack = selectedRow?.track;
	const selectedKeyMarkers = selectedKeys.flatMap((reference) => {
		const row = trackRows.find((candidate) => candidate.track.id === reference.trackId);
		const key = row?.keys.find((candidate) => candidate.id === reference.keyId);

		return key ? [{ ...reference, frameIndex: key.frameIndex }] : [];
	});
	const selectedKeyMarker = selectedKeyMarkers.length === 1 ? selectedKeyMarkers[0] : undefined;
	const selectedNumberKey = selectedKeyMarker && selectedRow
		&& (selectedRow.track.kind === 'bone-transform'
			|| selectedRow.track.kind === 'attachment-transform'
			|| selectedRow.track.kind === 'attachment-opacity'
			|| selectedRow.track.kind === 'rectangle-size')
		? selectedRow.track.keys.find((key) => key.id === selectedKeyMarker.keyId)
		: undefined;
	const selectedAttachmentKey = selectedKeyMarker && selectedRow?.track.kind === 'slot-attachment'
		? selectedRow.track.keys.find((key) => key.id === selectedKeyMarker.keyId)
		: undefined;
	const selectedSlotId = selectedRow?.track.kind === 'slot-attachment' ? selectedRow.track.targetId : undefined;
	const selectedDrawOrderKey = selectedKeyMarker && selectedRow?.track.kind === 'slot-draw-order'
		? selectedRow.track.keys.find((key) => key.id === selectedKeyMarker.keyId)
		: undefined;
	const selectedEvent = activeClip?.events.find((event) => event.id === selectedEventId);
	const contextForTimelineKeys = function contextForTimelineKeys(keys: readonly TimelineKeyReference[]): InspectorContext {
		if (!activeClip || keys.length === 0) {
			return { kind: 'none' };
		}

		const first = keys[0];
		const track = first ? trackRows.find((row) => row.track.id === first.trackId)?.track : undefined;

		if (keys.length === 1 && first && track?.kind === 'slot-draw-order') {
			return { kind: 'draw-order', clipId: activeClip.id, trackId: track.id, keyId: first.keyId };
		}
		if (keys.length === 1 && first && track?.kind === 'slot-attachment') {
			return { kind: 'attachment-swap', clipId: activeClip.id, trackId: track.id, keyId: first.keyId, slotId: track.targetId };
		}

		return { kind: 'key', clipId: activeClip.id, keys };
	};
	const submitCreateTrack = function submitCreateTrack(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();

		if (!selectedTrackOption) {
			return;
		}

		const id = onCreateTrack(selectedTrackOption.definition);

		if (id) {
			setSelectedTrackId(id);
			setSelectedKeys([]);
			if (activeClip) {
				onContextChange({ kind: 'track', clipId: activeClip.id, trackId: id });
			}
		}
	};
	const submitAddKey = function submitAddKey(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();

		if (!activeClip || !selectedRow) {
			return;
		}

		const data = new FormData(event.currentTarget);
		const timeSeconds = playback.frameIndex / activeClip.fps;
		const track = selectedRow.track;
		const added = track.kind === 'bone-transform'
			|| track.kind === 'attachment-transform'
			|| track.kind === 'attachment-opacity'
			|| track.kind === 'rectangle-size'
			? ((): EntityId | undefined => {
				const value = formNumber(data, 'value');

				return value === undefined ? undefined : onAddKey(track.id, {
					kind: 'number',
					input: { timeSeconds, value, interpolation: 'linear', curve: null }
				});
			})()
			: track.kind === 'slot-attachment'
				? onAddKey(track.id, {
					kind: 'attachment',
									input: {
										timeSeconds,
										value: parseEntityId(data.get('attachmentId')) ?? null
									}
				})
				: track.kind === 'slot-draw-order'
					? onAddKey(track.id, { kind: 'draw-order', input: { timeSeconds, value: project.setupDrawOrder } })
					: onAddKey(track.id, { kind: 'boolean', input: { timeSeconds, value: data.get('enabled') === 'on' } });

		if (added) {
			const nextKeys = [{ trackId: track.id, keyId: added }];

			setSelectedKeys(nextKeys);
			setSelectedTrackId(track.id);
			onContextChange(contextForTimelineKeys(nextKeys));
		}
	};
	const submitMoveKey = function submitMoveKey(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();

		if (!selectedRow || !selectedKeyMarker || !activeClip) {
			return;
		}

		const frame = formNumber(new FormData(event.currentTarget), 'frame');

		if (frame !== undefined) {
			onMoveKey(selectedRow.track.id, selectedKeyMarker.keyId, Math.round(frame) - 1);
		}
	};
	const submitRetimeKeys = function submitRetimeKeys(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const offsetFrames = formNumber(new FormData(event.currentTarget), 'offsetFrames');

		if (offsetFrames !== undefined && selectedKeys.length > 1) {
			onRetimeKeys(selectedKeys, Math.round(offsetFrames));
		}
	};
	const updateSelectedInterpolation = function updateSelectedInterpolation(value: string): void {
		if (!selectedRow || !selectedKeyMarker || !selectedNumberKey) {
			return;
		}

		const interpolation: Interpolation | undefined = value === 'stepped' || value === 'linear' || value === 'bezier'
			? value
			: undefined;

		if (!interpolation) {
			return;
		}

		onUpdateInterpolation(selectedRow.track.id, selectedKeyMarker.keyId, interpolation === 'bezier'
			? { interpolation }
			: { interpolation, curve: null });
	};
	const updateSelectedAttachment = function updateSelectedAttachment(value: string): void {
		if (!selectedRow || !selectedKeyMarker || !selectedAttachmentKey) {
			return;
		}

		onUpdateAttachmentKey(selectedRow.track.id, selectedKeyMarker.keyId, parseEntityId(value) ?? null);
	};
	const updateSelectedDrawOrder = function updateSelectedDrawOrder(slotId: EntityId, direction: -1 | 1): void {
		if (!selectedRow || !selectedKeyMarker || !selectedDrawOrderKey) {
			return;
		}

		onUpdateDrawOrderKey(
			selectedRow.track.id,
			selectedKeyMarker.keyId,
			moveDrawOrderSlot(selectedDrawOrderKey.value, slotId, direction)
		);
	};
	const selectAnimationKey = function selectAnimationKey(
		trackId: EntityId,
		keyId: EntityId,
		additive: boolean
	): void {
		if (!activeClip) {
			return;
		}

		const row = trackRows.find((candidate) => candidate.track.id === trackId);
		const key = row?.keys.find((candidate) => candidate.id === keyId);
		const reference = { trackId, keyId };
		const selected = selectedKeys.some((candidate) => candidate.trackId === trackId && candidate.keyId === keyId);
		const nextKeys = !additive
			? [reference]
			: selected
				? selectedKeys.filter((candidate) => candidate.trackId !== trackId || candidate.keyId !== keyId)
				: [...selectedKeys, reference];

		setSelectedTrackId(trackId);
		if (key) {
			onSeekPlayback(key.frameIndex);
		}
		setSelectedKeys(nextKeys);
		onContextChange(contextForTimelineKeys(nextKeys));
	};
	const setSelectedTimelineKeys = function setSelectedTimelineKeys(
		keys: readonly TimelineKeyReference[],
		additive: boolean
	): void {
		const uniqueKeys = keys.filter((key, index) => keys.findIndex((candidate) => candidate.trackId === key.trackId && candidate.keyId === key.keyId) === index);

		const nextKeys = additive
			? [...selectedKeys, ...uniqueKeys.filter((key) => !selectedKeys.some((candidate) => candidate.trackId === key.trackId && candidate.keyId === key.keyId))]
			: uniqueKeys;

		setSelectedKeys(nextKeys);
		setSelectedTrackId(uniqueKeys[0]?.trackId);
		onContextChange(contextForTimelineKeys(nextKeys));
	};
	const timelineFrameAtClientX = function timelineFrameAtClientX(clientX: number, bounds: DOMRect): number {
		if (bounds.width <= 0) {
			return timelineRange.startFrame;
		}

		const offset = (clientX - bounds.left) / bounds.width * timelineVisibleCount - 0.5;

		return Math.max(timelineRange.startFrame, Math.min(timelineRange.endFrame, timelineRange.startFrame + Math.round(offset)));
	};
	const seekTimelinePointer = function seekTimelinePointer(event: Readonly<{ clientX: number; currentTarget: HTMLElement }>): void {
		onSeekPlayback(timelineFrameAtClientX(event.clientX, event.currentTarget.getBoundingClientRect()));
	};
	const timelinePropertyRows = function timelinePropertyRows(): readonly Readonly<{ trackId: EntityId; frameIndex: number; keyId: EntityId }>[] {
		return groupedRows.flatMap((row) => {
			const trackId = row.trackId;

			return row.kind === 'property' && trackId
				? row.keys.map((key) => ({ trackId, frameIndex: key.frameIndex, keyId: key.id }))
				: [];
		});
	};
	const timelineGroupIds = groupedRows.flatMap((row) => row.kind === 'entity' ? [row.id] : []);
	const toggleTimelineGroup = function toggleTimelineGroup(rowId: string): void {
		const expanded = new Set(expandedRowIds.size === 0 ? timelineGroupIds : expandedRowIds);

		if (expanded.has(rowId)) {
			expanded.delete(rowId);
		} else {
			expanded.add(rowId);
		}

		onExpandedRowIdsChange(expanded);
	};
	const selectTimelineRow = function selectTimelineRow(row: TimelineRow, additive: boolean): void {
		const entity = selectableEntityForTimelineRow(project, row);

		if (entity) {
			onSelectEntity(entity, additive);
		}
		if (row.trackId) {
			setSelectedTrackId(row.trackId);
			setSelectedKeys([]);
			if (activeClip) {
				onContextChange({ kind: 'track', clipId: activeClip.id, trackId: row.trackId });
			}
		}
	};
	const beginKeyPointerDrag = function beginKeyPointerDrag(
		event: ReactPointerEvent<HTMLButtonElement>,
		trackId: EntityId,
		keyId: EntityId
	): void {
		if (event.button !== 0 || !activeClip) {
			return;
		}

		event.stopPropagation();
		const reference = { trackId, keyId };
		const alreadySelected = selectedKeys.some((key) => key.trackId === trackId && key.keyId === keyId);
		const keysForDrag = alreadySelected ? selectedKeys : [reference];

		keyDragRef.current = {
			pointerId: event.pointerId,
			trackId,
			keyId,
			startX: event.clientX,
			selectedKeys: keysForDrag
		};
		keyDragDeltaRef.current = 0;
		keyDragClickSuppressedRef.current = false;
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const updateKeyPointerDrag = function updateKeyPointerDrag(event: ReactPointerEvent<HTMLButtonElement>): void {
		const session = keyDragRef.current;

		if (!session || session.pointerId !== event.pointerId || !activeClip) {
			return;
		}

		const deltaPixels = event.clientX - session.startX;

		if (Math.abs(deltaPixels) < 3) {
			return;
		}

		keyDragClickSuppressedRef.current = true;
		keyDragDeltaRef.current = Math.round(deltaPixels / timelineViewport.pixelsPerFrame);
		setTimelineKeyDragDelta(keyDragDeltaRef.current);
		setSelectedTrackId(session.trackId);
		setSelectedKeys(session.selectedKeys);
	};
	const endKeyPointerDrag = function endKeyPointerDrag(
		event: ReactPointerEvent<HTMLButtonElement>,
		cancelled: boolean
	): void {
		const session = keyDragRef.current;

		if (!session || session.pointerId !== event.pointerId) {
			return;
		}

		if (!cancelled && activeClip && keyDragClickSuppressedRef.current) {
			const plan = planKeyDrag(activeClip, session.selectedKeys, event.clientX - session.startX, timelineViewport.pixelsPerFrame);

			if (plan.ok && plan.value.deltaFrames !== 0) {
				onRetimeKeys(session.selectedKeys, plan.value.deltaFrames);
				setTimelineNotice(`Moved ${session.selectedKeys.length} key${session.selectedKeys.length === 1 ? '' : 's'} by ${plan.value.deltaFrames} frame${Math.abs(plan.value.deltaFrames) === 1 ? '' : 's'}.`);
			} else if (!plan.ok) {
				setTimelineNotice(plan.error);
			}
		}

		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		keyDragRef.current = undefined;
		keyDragDeltaRef.current = 0;
		setTimelineKeyDragDelta(0);
	};
	const beginTimelineMarquee = function beginTimelineMarquee(event: ReactPointerEvent<HTMLDivElement>, trackId: EntityId): void {
		if (event.button !== 0 || !activeClip) {
			return;
		}

		event.stopPropagation();
		marqueeRef.current = {
			pointerId: event.pointerId,
			trackId,
			startX: event.clientX,
			startY: event.clientY,
			additive: event.metaKey || event.ctrlKey
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const updateTimelineMarquee = function updateTimelineMarquee(event: ReactPointerEvent<HTMLDivElement>): void {
		const session = marqueeRef.current;

		if (!session || session.pointerId !== event.pointerId) {
			return;
		}

		const bounds = event.currentTarget.getBoundingClientRect();
		const left = Math.min(session.startX, event.clientX) - bounds.left;
		const top = Math.min(session.startY, event.clientY) - bounds.top;

		if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) >= 3) {
			setTimelineMarquee({
				left,
				top,
				width: Math.abs(event.clientX - session.startX),
				height: Math.abs(event.clientY - session.startY)
			});
		}
	};
	const endTimelineMarquee = function endTimelineMarquee(
		event: ReactPointerEvent<HTMLDivElement>,
		cancelled: boolean
	): void {
		const session = marqueeRef.current;

		if (!session || session.pointerId !== event.pointerId) {
			return;
		}

		const didMove = Math.hypot(event.clientX - session.startX, event.clientY - session.startY) >= 3;

		if (!cancelled && activeClip) {
			const bounds = event.currentTarget.getBoundingClientRect();

			if (!didMove) {
				onSeekPlayback(timelineFrameAtClientX(event.clientX, bounds));
			} else {
				const startFrame = timelineFrameAtClientX(session.startX, bounds);
				const endFrame = timelineFrameAtClientX(event.clientX, bounds);
				const minimum = Math.min(startFrame, endFrame);
				const maximum = Math.max(startFrame, endFrame);
				const selected = timelinePropertyRows()
					.filter((key) => key.frameIndex >= minimum && key.frameIndex <= maximum)
					.map(({ trackId, keyId }) => ({ trackId, keyId }));

				setSelectedTimelineKeys(selected, session.additive);
			}
		}

		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		marqueeRef.current = undefined;
		setTimelineMarquee(undefined);
	};
	const timelineKeyDown = function timelineKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
		const target = event.target;
		const isFormTarget = target instanceof HTMLInputElement
			|| target instanceof HTMLTextAreaElement
			|| target instanceof HTMLSelectElement
			|| target instanceof HTMLElement && target.isContentEditable;

		if (isFormTarget) {
			return;
		}

		const modifier = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();

		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			keyDragRef.current = undefined;
			marqueeRef.current = undefined;
			setTimelineKeyDragDelta(0);
			setTimelineMarquee(undefined);
			return;
		}
		if (modifier && key === 'c') {
			event.preventDefault();
			event.stopPropagation();
			if (!activeClip) {
				return;
			}

			const copied = createTimelineClipboard(activeClip, selectedKeys);

			if (copied.ok) {
				setTimelineClipboard(copied.value);
				setTimelineNotice(`Copied ${copied.value.keys.length} key${copied.value.keys.length === 1 ? '' : 's'}.`);
			} else {
				setTimelineNotice(copied.error);
			}
			return;
		}
		if (modifier && key === 'v') {
			event.preventDefault();
			event.stopPropagation();
			if (!timelineClipboard) {
				setTimelineNotice('The key clipboard is empty.');
				return;
			}

			onPasteKeys(timelineClipboard);
			setTimelineNotice(`Pasted ${timelineClipboard.keys.length} key${timelineClipboard.keys.length === 1 ? '' : 's'}.`);
			return;
		}
		if (!modifier && (key === 'delete' || key === 'backspace') && selectedKeys.length > 0) {
			event.preventDefault();
			event.stopPropagation();
			deleteSelectedKeys();
			return;
		}
		if (!modifier && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && selectedKeys.length > 0 && activeClip) {
			event.preventDefault();
			event.stopPropagation();
			const delta = event.key === 'ArrowLeft' ? -1 : 1;
			const plan = planNudgeKeys(activeClip, selectedKeys, delta);

			if (plan.ok && plan.value.deltaFrames !== 0) {
				onRetimeKeys(selectedKeys, plan.value.deltaFrames);
			} else if (!plan.ok) {
				setTimelineNotice(plan.error);
			}
		}
	};
	const deleteSelectedKeys = function deleteSelectedKeys(): void {
		onDeleteKeys(selectedKeys);
		setSelectedKeys([]);
	};
	const deleteSelectedTrack = function deleteSelectedTrack(): void {
		if (selectedRow) {
			onDeleteTrack(selectedRow.track.id);
			setSelectedTrackId(undefined);
			setSelectedKeys([]);
		}
	};
	const renderSummaryKeys = function renderSummaryKeys(row: TimelineRow): readonly ReactElement[] {
		return row.keys
			.filter((key) => key.frameIndex >= timelineRange.startFrame && key.frameIndex <= timelineRange.endFrame)
			.map((key) => (
				<span
					aria-label={`Keys at frame ${key.frameIndex + 1}`}
					className="timeline-summary-key"
					key={key.id}
					style={{ left: `${((key.frameIndex - timelineRange.startFrame + 0.5) / timelineVisibleCount) * 100}%` }}
				/>
			));
	};
	const renderTimelineKeys = function renderTimelineKeys(row: TimelineRow, trackId: EntityId): readonly ReactElement[] {
		return row.keys
			.filter((key) => key.frameIndex >= timelineRange.startFrame && key.frameIndex <= timelineRange.endFrame)
			.map((key) => {
				const selected = selectedKeys.some((candidate) => candidate.keyId === key.id && candidate.trackId === trackId);
				const frameIndex = key.frameIndex + (selected ? timelineKeyDragDelta : 0);

				return (
					<button
						aria-label={`Key frame ${key.frameIndex + 1}`}
						className={selected ? 'track-key is-selected' : 'track-key'}
						data-key-id={key.id}
						key={key.id}
						type="button"
						onClick={(event) => {
							event.stopPropagation();

							if (keyDragClickSuppressedRef.current) {
								keyDragClickSuppressedRef.current = false;
								return;
							}

							selectAnimationKey(trackId, key.id, event.metaKey || event.ctrlKey);
						}}
						onPointerCancel={(event) => endKeyPointerDrag(event, true)}
						onPointerDown={(event) => beginKeyPointerDrag(event, trackId, key.id)}
						onPointerMove={updateKeyPointerDrag}
						onPointerUp={(event) => endKeyPointerDrag(event, false)}
						style={{ left: `${((frameIndex - timelineRange.startFrame + 0.5) / timelineVisibleCount) * 100}%` }}
						title={`Frame ${key.frameIndex + 1} · drag to retime`}
					/>
				);
			});
	};

	return (
		<>
			<div className="timeline-header">
				<div>
					<p className="eyebrow">Animation</p>
					<h2>Timeline</h2>
				</div>
				<button className="secondary-button" type="button" onClick={onCreateClip}>+ Clip</button>
			</div>
			{project.clips.length === 0 ? (
				<div className="timeline-empty">
					<p>No clips yet</p>
					<button className="secondary-button" type="button" onClick={onCreateClip}>Create animation clip</button>
				</div>
			) : (
				<div className="animate-timeline" data-testid="animate-timeline" tabIndex={0} onKeyDown={timelineKeyDown}>
					{activeClip && (
						<div className="timeline-shell">
							<div className="timeline-sticky">
								<div className="clip-selector-row">
									<div className="clip-tabs" aria-label="Animation clips">
										{project.clips.map((clip) => (
											<button
												className={activeClip.id === clip.id ? 'clip-tab is-active' : 'clip-tab'}
												key={clip.id}
												type="button"
												onClick={() => onSelectClip(clip.id)}
												aria-pressed={activeClip.id === clip.id}
											>
												{clip.name}
											</button>
										))}
									</div>
									<div className="timeline-detail-actions" aria-label="Timeline details">
										<button className="quiet-button" type="button" aria-expanded={openDetails === 'clip'} onClick={(event) => { openDetailSurface('clip', event.currentTarget); onContextChange({ kind: 'clip', clipId: activeClip.id }); }}>Clip settings</button>
										<button className="quiet-button" type="button" aria-expanded={openDetails === 'track'} onClick={(event) => { openDetailSurface('track', event.currentTarget); onContextChange(selectedTrack ? { kind: 'track', clipId: activeClip.id, trackId: selectedTrack.id } : { kind: 'clip', clipId: activeClip.id }); }}>Track details</button>
										<button className="quiet-button" type="button" aria-expanded={openDetails === 'key'} disabled={selectedKeyMarkers.length === 0} onClick={(event) => { openDetailSurface('key', event.currentTarget); onContextChange(contextForTimelineKeys(selectedKeys)); }}>Key details</button>
										<button className="quiet-button" type="button" aria-expanded={openDetails === 'event'} disabled={!selectedEvent} onClick={(event) => { openDetailSurface('event', event.currentTarget); if (selectedEvent) { onContextChange({ kind: 'event', clipId: activeClip.id, eventId: selectedEvent.id }); } }}>Event details</button>
									</div>
								</div>
								<div className="clip-playback-controls" aria-label="Playback controls">
									<button className="quiet-button" type="button" aria-label="Step backward" onClick={() => onStepPlayback(-1)}>◀</button>
									<button className="secondary-button" type="button" aria-label={playback.playing ? 'Pause animation' : 'Play animation'} onClick={onTogglePlayback}>
										{playback.playing ? 'Pause' : 'Play'}
									</button>
									<button className="quiet-button" type="button" aria-label="Step forward" onClick={() => onStepPlayback(1)}>▶</button>
									<span className="playback-readout">Frame {playback.frameIndex + 1} / {frameCountForClip(activeClip)} · {frameTimeSeconds(playback, activeClip).toFixed(3)}s</span>
									<label className="auto-key-field"><input type="checkbox" aria-label="Auto Key" checked={autoKey} onChange={(event) => onAutoKeyChange(event.target.checked)} /><span>Auto Key</span></label>
									<button className="quiet-button" type="button" onClick={onKeyPendingEdits} disabled={pendingEditCount === 0}>Key edited properties{pendingEditCount > 0 ? ` (${pendingEditCount})` : ''}</button>
								</div>
								<div className="timeline-navigation">
									<div className="timeline-navigation-actions" aria-label="Timeline navigation">
										<button className="quiet-button" type="button" aria-label="Pan timeline left" onClick={() => setTimelineViewport((current) => panTimeline(current, 320, frameCount))}>◀</button>
										<button className="quiet-button" type="button" aria-label="Zoom timeline out" onClick={() => setTimelineViewport((current) => zoomTimeline(current, -1, playback.frameIndex, frameCount))}>−</button>
										<button className="quiet-button" type="button" aria-label="Reset timeline view" onClick={() => setTimelineViewport(resetTimelineViewport())}>100%</button>
										<button className="quiet-button" type="button" aria-label="Zoom timeline in" onClick={() => setTimelineViewport((current) => zoomTimeline(current, 1, playback.frameIndex, frameCount))}>+</button>
										<button className="quiet-button" type="button" aria-label="Pan timeline right" onClick={() => setTimelineViewport((current) => panTimeline(current, -320, frameCount))}>▶</button>
									</div>
									<label className="timeline-filter-field">
										<span className="sr-only">Filter tracks</span>
										<input type="search" aria-label="Filter tracks" placeholder="Filter tracks" value={trackFilter} onChange={(event) => setTrackFilter(event.target.value)} />
									</label>
									<label className="timeline-row-mode-field">
										<span className="sr-only">Timeline rows</span>
										<select aria-label="Timeline rows" value={rowMode} onChange={(event) => {
											const nextMode = event.target.value;

											if (nextMode === 'selection' || nextMode === 'all-keyed') {
												onRowModeChange(nextMode);
											}
										}}>
											<option value="selection">Selection</option>
											<option value="all-keyed">All keyed</option>
										</select>
									</label>
									{pinnedEntityIds.size > 0 && <button className="quiet-button" type="button" onClick={onClearPinnedEntities}>Clear pins</button>}
									<span className="timeline-zoom-readout">{Math.round(timelineViewport.pixelsPerFrame / 32 * 100)}%</span>
								</div>
							</div>
							<div className="timeline-content" id="animation-timeline-pane" data-testid="timeline-scroll-region">
								<div className="timeline-ruler-meta">
									<span aria-label="Timeline frame range">Frames {timelineRange.startFrame + 1}–{timelineRange.endFrame + 1} of {frameCount}</span>
									<span className="muted-copy">{trackRows.length} matching track{trackRows.length === 1 ? '' : 's'}</span>
									{timelineNotice && <span className="timeline-notice" role="status">{timelineNotice}</span>}
								</div>
								<div className="dopesheet" aria-label="Animation tracks">
									<div className="dopesheet-ruler">
										<span className="track-row-label">Track</span>
										<div className="timeline-ruler" aria-label="Timeline ruler">
											{Array.from({ length: timelineVisibleCount }, (_, index) => timelineRange.startFrame + index).map((frame) => (
												<span className={frame === playback.frameIndex ? 'timeline-tick is-playhead' : 'timeline-tick'} key={frame}>{frame + 1}</span>
											))}
										</div>
									</div>
									{trackRows.length === 0 ? (
										<div className="dopesheet-empty">No typed tracks match this filter.</div>
									) : groupedRows.map((row) => {
										if (row.kind === 'overview') {
											return (
														<div className="track-row timeline-group-row timeline-overview-row" data-timeline-row-id={row.id} key={row.id}>
													<div className="track-row-label"><span>Overview</span><small>{row.subLabel}</small></div>
													<div className="track-key-lane timeline-summary-lane" onClick={seekTimelinePointer}>{renderSummaryKeys(row)}</div>
												</div>
											);
										}
										if (row.kind === 'entity') {
											return (
																<div className={row.selected ? 'track-row timeline-group-row is-selected' : 'track-row timeline-group-row'} data-entity-id={row.entityId} data-timeline-row-id={row.id} key={row.id}>
													<div className="timeline-group-label">
														<button className="timeline-row-expander" type="button" aria-expanded={row.expanded} aria-label={`${row.expanded ? 'Collapse' : 'Expand'} ${row.label}`} onClick={() => toggleTimelineGroup(row.id)}>{row.expanded ? '▾' : '▸'}</button>
														<button className="timeline-row-select" type="button" aria-pressed={row.selected} onClick={(event) => selectTimelineRow(row, event.metaKey || event.ctrlKey)}><span>{row.label}</span><small>{row.subLabel}</small></button>
														<button className={pinnedEntityIds.has(row.entityId ?? '') ? 'timeline-pin is-pinned' : 'timeline-pin'} type="button" aria-pressed={pinnedEntityIds.has(row.entityId ?? '')} aria-label={`${pinnedEntityIds.has(row.entityId ?? '') ? 'Unpin' : 'Pin'} ${row.label} timeline rows`} onClick={(event) => { event.stopPropagation(); if (row.entityId) { onTogglePinnedEntity(row.entityId); } }}>{pinnedEntityIds.has(row.entityId ?? '') ? '●' : '○'}</button>
													</div>
													<div className="track-key-lane timeline-summary-lane" onClick={seekTimelinePointer}>{renderSummaryKeys(row)}</div>
												</div>
											);
										}
						if (row.kind === 'property' && row.trackId) {
							const trackId = row.trackId;
							const track = trackRows.find((candidate) => candidate.track.id === trackId);

											if (!track) {
												return null;
											}

											return (
							<div className={selectedRow?.track.id === trackId ? 'track-row timeline-property-row is-selected' : 'track-row timeline-property-row'} data-track-id={trackId} data-timeline-row-id={row.id} key={row.id} onClick={(event) => selectTimelineRow(row, event.metaKey || event.ctrlKey)}>
													<div className="track-row-label" style={{ paddingLeft: `${row.depth * 16}px` }}><span>{row.label}</span><small>{row.subLabel ?? track.track.kind}</small></div>
													<div className="track-key-lane" onClick={seekTimelinePointer} onPointerCancel={(event) => endTimelineMarquee(event, true)} onPointerDown={(event) => beginTimelineMarquee(event, trackId)} onPointerMove={updateTimelineMarquee} onPointerUp={(event) => endTimelineMarquee(event, false)}>
														{renderTimelineKeys(row, trackId)}
														{timelineMarquee && marqueeRef.current?.trackId === trackId && <div className="timeline-marquee" style={{ left: timelineMarquee.left, top: timelineMarquee.top, width: timelineMarquee.width, height: timelineMarquee.height }} />}
													</div>
												</div>
											);
										}
										if (row.kind === 'draw-order') {
											const track = trackRows.find((candidate) => candidate.track.kind === 'slot-draw-order');

											return track ? (
														<div className="track-row timeline-group-row timeline-special-row" data-track-id={track.track.id} data-timeline-row-id={row.id} key={row.id}>
													<div className="track-row-label"><span>{row.label}</span><small>{row.subLabel}</small></div>
													<div className="track-key-lane timeline-summary-lane" onClick={seekTimelinePointer}>{renderTimelineKeys(row, track.track.id)}</div>
												</div>
											) : null;
										}

										return null;
									})}
									<div className="event-track" aria-label="Animation events">
										<div className="track-row-label event-row-label">
											<div><span>Events</span><small>{activeClip.events.length} event{activeClip.events.length === 1 ? '' : 's'}</small></div>
											<button className="quiet-button" type="button" onClick={addTimelineEvent}>Add event</button>
										</div>
										<div className="track-key-lane">
											{activeClip.events
												.filter((event) => {
													const frameIndex = frameIndexForTime(activeClip, event.timeSeconds);

													return frameIndex >= timelineRange.startFrame && frameIndex <= timelineRange.endFrame;
												})
												.map((event) => {
													const frameIndex = frameIndexForTime(activeClip, event.timeSeconds);

													return (
														<button
															aria-label={`Event ${event.name} at frame ${frameIndex + 1}`}
															className={selectedEventId === event.id ? 'event-key is-selected' : 'event-key'}
															key={event.id}
															onClick={() => { setSelectedEventId(event.id); setEventError(undefined); onSeekPlayback(frameIndex); onContextChange({ kind: 'event', clipId: activeClip.id, eventId: event.id }); }}
															type="button"
															style={{ left: `${((frameIndex - timelineRange.startFrame + 0.5) / timelineVisibleCount) * 100}%` }}
															title={`${event.name} · frame ${frameIndex + 1}`}
														/>
													);
												})}
										</div>
									</div>
								</div>
								<label className="playhead-field">
									<span className="field-label">Playhead</span>
									<input
										aria-label="Playhead"
										type="range"
										min="0"
										max={frameCountForClip(activeClip) - 1}
										step="1"
										value={playback.frameIndex}
										onChange={(event) => onSeekPlayback(Number(event.target.value))}
									/>
								</label>
							</div>
							{openDetails === 'clip' && (
								<section className="timeline-detail-surface" aria-label="Clip settings" role="dialog">
									<div className="timeline-detail-heading">
										<div><p className="eyebrow">Details</p><h2>Clip settings</h2></div>
										<button className="quiet-button" type="button" aria-label="Close Clip settings" onClick={closeDetailSurface}>Close</button>
									</div>
									<p className="muted-copy">{activeClip.tracks.length} tracks · {activeClip.events.length} events</p>
									<form className="clip-form" key={`name:${activeClip.id}:${activeClip.name}`} onSubmit={submitClipName}>
										<label><span className="field-label">Clip name</span><input name="name" defaultValue={activeClip.name} aria-label="Clip name" /></label>
										<button className="secondary-button" type="submit">Rename</button>
									</form>
									<form className="clip-form clip-playback-form" key={`playback:${activeClip.id}:${activeClip.durationSeconds}:${activeClip.fps}:${activeClip.loop}`} onSubmit={submitPlayback}>
										<label><span className="field-label">Duration (sec)</span><input name="durationSeconds" type="number" min="0.01" step="any" defaultValue={activeClip.durationSeconds} /></label>
										<label><span className="field-label">FPS</span><input name="fps" type="number" min="0.01" step="any" defaultValue={activeClip.fps} /></label>
										<label className="clip-loop-field"><input name="loop" type="checkbox" defaultChecked={activeClip.loop} /><span className="field-label">Loop</span></label>
										<button className="secondary-button" type="submit">Apply playback</button>
									</form>
									<div className="inspector-actions">
										<button className="quiet-button" type="button" onClick={onDuplicateClip}>Duplicate</button>
										<button className="danger-button" type="button" onClick={onDeleteClip}>Delete</button>
									</div>
								</section>
							)}
							{openDetails === 'track' && (
								<section className="timeline-detail-surface" aria-label="Track details" role="dialog">
									<div className="timeline-detail-heading">
										<div><p className="eyebrow">Details</p><h2>Track details</h2></div>
										<button className="quiet-button" type="button" aria-label="Close Track details" onClick={closeDetailSurface}>Close</button>
									</div>
									<form className="track-create-form" onSubmit={submitCreateTrack}>
										<label>
											<span className="field-label">New track</span>
											<select aria-label="New track" value={selectedTrackOption?.value ?? ''} onChange={(event) => setTrackDefinitionValue(event.target.value)} disabled={trackOptions.length === 0}>
												{trackOptions.length === 0 ? <option value="">No available properties</option> : trackOptions.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
											</select>
										</label>
										<button className="secondary-button" type="submit" disabled={!selectedTrackOption}>Add track</button>
									</form>
									{selectedTrack && (
										<>
											<div className="track-edit-toolbar">
												<span className="muted-copy">Selected: {selectedRow?.label}</span>
												<button className="danger-button" type="button" onClick={deleteSelectedTrack}>Delete track</button>
											</div>
											<form className="key-create-form" key={selectedTrack.id} onSubmit={submitAddKey}>
												<span className="muted-copy">Add key at frame {playback.frameIndex + 1}</span>
												{(selectedTrack.kind === 'bone-transform'
													|| selectedTrack.kind === 'attachment-transform'
													|| selectedTrack.kind === 'attachment-opacity'
													|| selectedTrack.kind === 'rectangle-size') && (
													<label><span className="field-label">Value</span><input name="value" type="number" step="any" defaultValue={selectedTrack.kind === 'attachment-opacity' || selectedTrack.kind === 'rectangle-size' ? 1 : 0} /></label>
												)}
												{selectedTrack.kind === 'slot-attachment' && (
													<label><span className="field-label">Attachment</span><select name="attachmentId" aria-label="Key attachment" defaultValue=""><option value="">None</option>{project.attachments.filter((attachment) => attachment.kind === 'image' && attachment.slotId === selectedTrack.targetId).map((attachment) => <option key={attachment.id} value={attachment.id}>{attachment.name}</option>)}</select></label>
												)}
												{(selectedTrack.kind === 'point-enabled' || selectedTrack.kind === 'rectangle-enabled') && (
													<label className="key-boolean-field"><input name="enabled" type="checkbox" defaultChecked={enabledValueForTrack(project, selectedTrack)} /><span className="field-label">Enabled</span></label>
												)}
												<button className="secondary-button" type="submit">Add key</button>
											</form>
										</>
									)}
								</section>
							)}
							{openDetails === 'key' && (
								<section className="timeline-detail-surface" aria-label="Key details" role="dialog">
									<div className="timeline-detail-heading">
										<div><p className="eyebrow">Details</p><h2>Key details</h2></div>
										<button className="quiet-button" type="button" aria-label="Close Key details" onClick={closeDetailSurface}>Close</button>
									</div>
									{selectedKeyMarkers.length > 1 && (
										<form className="key-editor" onSubmit={submitRetimeKeys}>
											<span className="muted-copy">{selectedKeyMarkers.length} keys selected</span>
											<label><span className="field-label">Offset frames</span><input name="offsetFrames" type="number" step="1" defaultValue="0" /></label>
											<button className="secondary-button" type="submit">Retime selected keys</button>
											<button className="danger-button" type="button" onClick={deleteSelectedKeys}>Delete selected keys</button>
										</form>
									)}
									{selectedKeyMarker && selectedRow && (
										<form className="key-editor" key={`${selectedKeyMarker.keyId}:${selectedKeyMarker.frameIndex}`} onSubmit={submitMoveKey}>
											<span className="muted-copy">Key frame {selectedKeyMarker.frameIndex + 1}</span>
											<label><span className="field-label">Frame</span><input name="frame" type="number" min="1" max={frameCount} step="1" defaultValue={selectedKeyMarker.frameIndex + 1} /></label>
											{selectedNumberKey && (
												<label>
													<span className="field-label">Interpolation to next key</span>
													<select aria-label="Interpolation" value={selectedNumberKey.interpolation} onChange={(event) => updateSelectedInterpolation(event.currentTarget.value)}>
														<option value="stepped">Stepped</option>
														<option value="linear">Linear</option>
														<option value="bezier">Cubic Bezier</option>
													</select>
													{selectedNumberKey.interpolation === 'bezier' && <small className="muted-copy">Curve controls are available in the graph editor.</small>}
												</label>
											)}
											{selectedNumberKey?.interpolation === 'bezier' && selectedNumberKey.curve && (
												<BezierGraphEditor
													key={`${selectedKeyMarker.keyId}:${selectedNumberKey.curve.x1}:${selectedNumberKey.curve.y1}:${selectedNumberKey.curve.x2}:${selectedNumberKey.curve.y2}`}
													curve={selectedNumberKey.curve}
													onChange={(curve) => onUpdateInterpolation(selectedRow.track.id, selectedKeyMarker.keyId, { interpolation: 'bezier', curve })}
												/>
											)}
											{selectedAttachmentKey && selectedSlotId && (
												<label>
													<span className="field-label">Keyed attachment</span>
													<select aria-label="Selected attachment" value={selectedAttachmentKey.value ?? ''} onChange={(event) => updateSelectedAttachment(event.currentTarget.value)}>
														<option value="">None</option>
														{project.attachments
															.filter((attachment) => attachment.kind === 'image' && attachment.slotId === selectedSlotId)
															.map((attachment) => <option key={attachment.id} value={attachment.id}>{attachment.name}</option>)}
													</select>
												</label>
											)}
											{selectedDrawOrderKey && (
												<div className="draw-order-key-editor">
													<span className="field-label">Keyed slot order</span>
													<ol>
														{selectedDrawOrderKey.value.map((slotId, index) => {
															const slotName = project.slots.find((slot) => slot.id === slotId)?.name ?? slotId;

															return (
																<li key={slotId} data-slot-id={slotId}>
																	<span>{slotName}</span>
																	<div>
																		<button className="quiet-button" type="button" aria-label={`Move ${slotName} earlier`} disabled={index === 0} onClick={() => updateSelectedDrawOrder(slotId, -1)}>↑</button>
																		<button className="quiet-button" type="button" aria-label={`Move ${slotName} later`} disabled={index === selectedDrawOrderKey.value.length - 1} onClick={() => updateSelectedDrawOrder(slotId, 1)}>↓</button>
																	</div>
																</li>
															);
														})}
													</ol>
												</div>
											)}
											<button className="secondary-button" type="submit">Move key</button>
											<button className="quiet-button" type="button" onClick={(event) => {
												const form = event.currentTarget.form;
												const frame = form ? form.elements.namedItem('frame') : undefined;

												if (frame instanceof HTMLInputElement) {
													const copiedId = onCopyKey(selectedRow.track.id, selectedKeyMarker.keyId, Math.round(Number(frame.value)) - 1);

													if (copiedId) {
														const nextKeys = [{ trackId: selectedRow.track.id, keyId: copiedId }];

														setSelectedKeys(nextKeys);
														onContextChange(contextForTimelineKeys(nextKeys));
													}
												}
											}}>Copy key</button>
											<button className="danger-button" type="button" onClick={deleteSelectedKeys}>Delete key</button>
										</form>
									)}
								</section>
							)}
							{openDetails === 'event' && selectedEvent && (
								<section className="timeline-detail-surface" aria-label="Event details" role="dialog">
									<div className="timeline-detail-heading">
										<div><p className="eyebrow">Details</p><h2>Event details</h2></div>
										<button className="quiet-button" type="button" aria-label="Close Event details" onClick={closeDetailSurface}>Close</button>
									</div>
									<form className="event-editor" key={`${selectedEvent.id}:${selectedEvent.name}:${JSON.stringify(selectedEvent.payload)}`} onSubmit={submitEventDetails}>
										<div className="event-editor-heading">
											<span className="muted-copy">Selected event</span>
											<button className="danger-button" type="button" onClick={deleteTimelineEvent}>Delete event</button>
										</div>
										<label><span className="field-label">Event name</span><input name="eventName" defaultValue={selectedEvent.name} /></label>
										<label><span className="field-label">Payload JSON</span><textarea name="eventPayload" rows={4} defaultValue={JSON.stringify(selectedEvent.payload, null, 2)} /></label>
										<button className="secondary-button" type="submit">Apply event</button>
									</form>
									<form className="event-editor event-move-form" onSubmit={submitEventMove}>
										<label><span className="field-label">Event frame</span><input name="eventFrame" type="number" min="1" max={frameCount} step="1" defaultValue={frameIndexForTime(activeClip, selectedEvent.timeSeconds) + 1} /></label>
										<button className="secondary-button" type="submit">Move event</button>
									</form>
									{eventError && <p className="form-error" role="alert">{eventError}</p>}
								</section>
							)}
						</div>
					)}
				</div>
			)}
		</>
	);
};
