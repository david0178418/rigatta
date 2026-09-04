import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { parseEntityId, type EntityId } from '../domain/ids.ts';
import type { AttachmentKeyInput, BooleanKeyInput, DrawOrderKeyInput, EventKeyInput, EventKeyUpdate, NumberKeyInput, NumberKeyInterpolationInput, TrackDefinition } from '../domain/animation.ts';
import { frameCountForClip, frameTimeSeconds, type PlaybackDirection, type PlaybackState } from '../domain/playback.ts';
import type { Clip, Project, Track } from '../domain/model.ts';
import { availableTrackDefinitions, buildTimelineTrackRows, createTimelineViewport, frameIndexForTime, panTimeline, resetTimelineViewport, timelineFrameRange, visibleFrameCount, zoomTimeline, type TimelineViewport } from './timeline.ts';
import { timelineHeightBounds, timelineHeightFromKeyboard, timelineHeightFromPointer } from './timeline-layout.ts';
import { buildGroupedTimelineRows, createTimelineClipboard, planKeyDrag, planNudgeKeys, selectableEntityForTimelineRow, selectableTimelineKeysForRows, validPinnedTimelineEntityIds, type TimelineClipboard, type TimelineKeyReference, type TimelineMarkerKind, type TimelineRow, type TimelineRowMode } from './timeline-model.ts';
import { isSelected, type SelectableEntity, type Selection } from './selection.ts';
import type { InspectorContext } from './inspector-context.ts';
import type { TransformTool } from './transform-gesture.ts';
import { Tooltip } from './ui-primitives.tsx';

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

const selectableEntityForTimelineTrack = function selectableEntityForTimelineTrack(
	project: Project,
	track: Track
): SelectableEntity | undefined {
	if (track.kind === 'bone-transform') {
		return project.bones.some((bone) => bone.id === track.targetId)
			? { kind: 'bone', id: track.targetId }
			: undefined;
	}
	if (track.kind === 'slot-attachment') {
		return project.slots.some((slot) => slot.id === track.targetId)
			? { kind: 'slot', id: track.targetId }
			: undefined;
	}
	if (track.kind === 'attachment-transform'
		|| track.kind === 'attachment-opacity'
		|| track.kind === 'point-enabled'
		|| track.kind === 'rectangle-size'
		|| track.kind === 'rectangle-enabled') {
		return project.attachments.some((attachment) => attachment.id === track.targetId)
			? { kind: 'attachment', id: track.targetId }
			: undefined;
	}

	return undefined;
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
	poseAvailable: boolean;
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
	onCopyPose: () => void;
	onPastePose: () => void;
	poseClipboardAvailable: boolean;
	poseClipboardNotice?: string;
	onSelectEntity: (entity: SelectableEntity, additive: boolean) => void;
	onSelectTransformTool?: (tool: TransformTool) => void;
	onRowModeChange: (mode: TimelineRowMode) => void;
	onExpandedRowIdsChange: (ids: ReadonlySet<string>) => void;
	onTogglePinnedEntity: (entityId: EntityId) => void;
	onClearPinnedEntities: () => void;
	onContextChange: (context: InspectorContext) => void;
	onAutoKeyChange: (enabled: boolean) => void;
	onKeyPendingEdits: () => void;
}>;

type TimelineDetail = 'track';

type TimelineKeyDragSession = Readonly<{
	pointerId: number;
	trackId: EntityId;
	keyId: EntityId;
	startX: number;
	pixelsPerFrame: number;
	selectedKeys: readonly TimelineKeyReference[];
	previousKeys: readonly TimelineKeyReference[];
	previousTrackId: EntityId | undefined;
	captureTarget: HTMLButtonElement;
	}>;

type TimelineMarqueeSession = Readonly<{
	pointerId: number;
	startX: number;
	startY: number;
	additive: boolean;
	lane: HTMLDivElement;
	container: HTMLDivElement;
	captureTarget: HTMLDivElement;
	previousKeys: readonly TimelineKeyReference[];
	previousTrackId: EntityId | undefined;
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
	onCopyPose,
	onPastePose,
	poseAvailable,
	poseClipboardAvailable,
	poseClipboardNotice,
	onSelectEntity,
	onSelectTransformTool,
	onRowModeChange,
	onExpandedRowIdsChange,
	onTogglePinnedEntity,
	onClearPinnedEntities,
	onContextChange,
	onAutoKeyChange,
	onKeyPendingEdits
	}: AnimateTimelineProps): ReactElement {
	void onCopyKey;
	void onDuplicateClip;
	void onRenameClip;
	void onDeleteClip;
	void onUpdateEvent;
	void onMoveEvent;
	void onDeleteEvent;
	void onUpdatePlayback;
	void onMoveKey;
	void onUpdateInterpolation;
	void onUpdateAttachmentKey;
	void onUpdateDrawOrderKey;
	void onDeleteTrack;
	const [timelineViewport, setTimelineViewport] = useState<TimelineViewport>(createTimelineViewport);
	const [trackFilter, setTrackFilter] = useState('');
	const [selectedTrackId, setSelectedTrackId] = useState<EntityId | undefined>(undefined);
	const [selectedKeys, setSelectedKeys] = useState<readonly Readonly<{ trackId: EntityId; keyId: EntityId }>[]>([]);
	const [trackDefinitionValue, setTrackDefinitionValue] = useState('');
	const [selectedEventId, setSelectedEventId] = useState<EntityId | undefined>(undefined);
	const [openDetails, setOpenDetails] = useState<TimelineDetail | undefined>(undefined);
	const [timelineClipboard, setTimelineClipboard] = useState<TimelineClipboard | undefined>(undefined);
	const [timelineNotice, setTimelineNotice] = useState<string | undefined>(undefined);
	const [timelineMarquee, setTimelineMarquee] = useState<Readonly<{ left: number; top: number; width: number; height: number }> | undefined>(undefined);
	const [timelineKeyDragDelta, setTimelineKeyDragDelta] = useState(0);
	const keyDragRef = useRef<TimelineKeyDragSession | undefined>(undefined);
	const keyDragDeltaRef = useRef(0);
	const keyDragClickSuppressedRef = useRef(false);
	const marqueeRef = useRef<TimelineMarqueeSession | undefined>(undefined);
	const timelineKeyAreaRef = useRef<HTMLDivElement | null>(null);
	const trackDetailsTriggerRef = useRef<HTMLButtonElement | null>(null);
	const trackDetailsCloseRef = useRef<HTMLButtonElement | null>(null);
	const trackDetailsId = 'timeline-track-creation-menu';
	const trackDetailsHeadingId = 'timeline-track-details-heading';
	useEffect(() => {
		if (openDetails === 'track') {
			trackDetailsCloseRef.current?.focus();
		}
	}, [openDetails]);
	const closeTrackDetails = function closeTrackDetails(): void {
		setOpenDetails(undefined);
		trackDetailsTriggerRef.current?.focus();
	};
	const toggleTrackDetails = function toggleTrackDetails(): void {
		if (openDetails === 'track') {
			closeTrackDetails();
			return;
		}

		setOpenDetails('track');
		if (activeClip) {
			onContextChange(selectedTrack ? { kind: 'track', clipId: activeClip.id, trackId: selectedTrack.id } : { kind: 'clip', clipId: activeClip.id });
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
			onContextChange({ kind: 'event', clipId: activeClip.id, eventId: id });
		}
	};
	const frameCount = activeClip ? frameCountForClip(activeClip) : 1;
	const timelineRange = timelineFrameRange(timelineViewport, frameCount);
	const timelineVisibleCount = visibleFrameCount(timelineViewport, frameCount);
	const trackRows = activeClip ? buildTimelineTrackRows(project, activeClip, trackFilter) : [];
	const visiblePinnedEntityIds = validPinnedTimelineEntityIds(project, pinnedEntityIds);
	const selectedTrackEntityIds = selectedTrackId
		? new Set(trackRows
			.filter((row) => row.track.id === selectedTrackId)
			.flatMap((row) => 'targetId' in row.track ? [row.track.targetId] : []))
		: new Set<EntityId>();
	const groupedRows = activeClip ? buildGroupedTimelineRows(project, activeClip, {
		mode: rowMode,
		filter: trackFilter,
		expandedIds: expandedRowIds,
		pinnedEntityIds: visiblePinnedEntityIds,
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
		const entity = row ? selectableEntityForTimelineTrack(project, row.track) : undefined;

		if (entity && (!additive || !isSelected(selection, entity))) {
			onSelectEntity(entity, additive);
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
		setSelectedTrackId(nextKeys[0]?.trackId);
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
	const timelineKeyDownCapture = function timelineKeyDownCapture(event: ReactKeyboardEvent<HTMLDivElement>): void {
		if (event.key !== 'Escape' || openDetails !== 'track' || keyDragRef.current || marqueeRef.current) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		closeTrackDetails();
	};
	const timelineRulerKeyDown = function timelineRulerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
		const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
		const targetFrame = event.key === 'Home'
			? 0
			: event.key === 'End'
				? frameCount - 1
				: undefined;

		if (direction === 0 && targetFrame === undefined) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		onSeekPlayback(targetFrame ?? Math.max(0, Math.min(frameCount - 1, playback.frameIndex + direction)));
	};
	const timelineLaneKeyDown = function timelineLaneKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
		const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
		const targetFrame = event.key === 'Home'
			? 0
			: event.key === 'End'
				? frameCount - 1
				: undefined;
		const activate = event.key === 'Enter' || event.key === ' ';

		if (direction === 0 && targetFrame === undefined && !activate) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		if (activate) {
			const bounds = event.currentTarget.getBoundingClientRect();
			onSeekPlayback(timelineFrameAtClientX(bounds.left + bounds.width / 2, bounds));
			return;
		}

		onSeekPlayback(targetFrame ?? Math.max(0, Math.min(frameCount - 1, playback.frameIndex + direction)));
	};
	const timelineSelectableKeys = function timelineSelectableKeys(): ReturnType<typeof selectableTimelineKeysForRows> {
		return selectableTimelineKeysForRows(groupedRows);
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
	const transformToolForTrack = function transformToolForTrack(track: Track | undefined): TransformTool | undefined {
		if (!track || (track.kind !== 'bone-transform' && track.kind !== 'attachment-transform')) {
			return undefined;
		}

		if (track.property === 'x' || track.property === 'y') {
			return 'translate';
		}
		if (track.property === 'rotation') {
			return 'rotate';
		}
		if (track.property === 'scaleX' || track.property === 'scaleY') {
			return 'scale';
		}

		return 'shear';
	};
	const selectTimelineRow = function selectTimelineRow(row: TimelineRow, additive: boolean): void {
		const entity = selectableEntityForTimelineRow(project, row);
		const track = row.trackId ? trackRows.find((candidate) => candidate.track.id === row.trackId)?.track : undefined;

		if (entity) {
			onSelectEntity(entity, additive);
		}
		const transformTool = transformToolForTrack(track);

		if (transformTool && onSelectTransformTool) {
			onSelectTransformTool(transformTool);
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

		event.preventDefault();
		event.stopPropagation();
		const reference = { trackId, keyId };
		const alreadySelected = selectedKeys.some((key) => key.trackId === trackId && key.keyId === keyId);
		const keysForDrag = alreadySelected ? selectedKeys : [reference];
		const lane = event.currentTarget.parentElement;
		const laneWidth = lane?.getBoundingClientRect().width ?? 0;
		const pixelsPerFrame = timelineVisibleCount > 0 && laneWidth > 0
			? laneWidth / timelineVisibleCount
			: timelineViewport.pixelsPerFrame;

		keyDragRef.current = {
			pointerId: event.pointerId,
			trackId,
			keyId,
			startX: event.clientX,
			pixelsPerFrame,
			selectedKeys: keysForDrag,
			previousKeys: selectedKeys,
			previousTrackId: selectedTrackId,
			captureTarget: event.currentTarget
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

		if (Math.abs(deltaPixels) < 4) {
			return;
		}

		keyDragClickSuppressedRef.current = true;
		const plan = planKeyDrag(activeClip, session.selectedKeys, deltaPixels, session.pixelsPerFrame);

		if (!plan.ok) {
			keyDragDeltaRef.current = 0;
			setTimelineKeyDragDelta(0);
			setTimelineNotice(plan.error);
			return;
		}

		keyDragDeltaRef.current = plan.value.deltaFrames;
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
			const plan = planKeyDrag(activeClip, session.selectedKeys, event.clientX - session.startX, session.pixelsPerFrame);

			if (plan.ok && plan.value.deltaFrames !== 0) {
				onRetimeKeys(session.selectedKeys, plan.value.deltaFrames);
				setTimelineNotice(`Moved ${session.selectedKeys.length} key${session.selectedKeys.length === 1 ? '' : 's'} by ${plan.value.deltaFrames} frame${Math.abs(plan.value.deltaFrames) === 1 ? '' : 's'}.`);
			} else if (plan.ok) {
				setTimelineNotice('The drag did not cross a frame boundary.');
			} else if (!plan.ok) {
				setTimelineNotice(plan.error);
			}
		} else if (cancelled) {
			setSelectedKeys(session.previousKeys);
			setSelectedTrackId(session.previousTrackId);
			onContextChange(contextForTimelineKeys(session.previousKeys));
		}

		if (session.captureTarget.hasPointerCapture(event.pointerId)) {
			session.captureTarget.releasePointerCapture(event.pointerId);
		}
		keyDragRef.current = undefined;
		keyDragDeltaRef.current = 0;
		if (cancelled) {
			keyDragClickSuppressedRef.current = false;
		}
		setTimelineKeyDragDelta(0);
	};
	const beginTimelineMarquee = function beginTimelineMarquee(event: ReactPointerEvent<HTMLDivElement>): void {
		if (event.button !== 0 || !activeClip) {
			return;
		}
		if (event.target instanceof HTMLElement && event.target.closest('button')) {
			return;
		}

		const container = timelineKeyAreaRef.current;

		if (!container) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		marqueeRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			additive: event.metaKey || event.ctrlKey,
			lane: event.currentTarget,
			container,
			captureTarget: event.currentTarget,
			previousKeys: selectedKeys,
			previousTrackId: selectedTrackId
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const updateTimelineMarquee = function updateTimelineMarquee(event: ReactPointerEvent<HTMLDivElement>): void {
		const session = marqueeRef.current;

		if (!session || session.pointerId !== event.pointerId) {
			return;
		}

		const bounds = session.container.getBoundingClientRect();
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

		if (cancelled) {
			setSelectedKeys(session.previousKeys);
			setSelectedTrackId(session.previousTrackId);
			onContextChange(contextForTimelineKeys(session.previousKeys));
		} else if (activeClip) {
			const bounds = session.lane.getBoundingClientRect();

			if (!didMove) {
				onSeekPlayback(timelineFrameAtClientX(event.clientX, bounds));
			} else {
				const startFrame = timelineFrameAtClientX(session.startX, bounds);
				const endFrame = timelineFrameAtClientX(event.clientX, bounds);
				const minimum = Math.min(startFrame, endFrame);
				const maximum = Math.max(startFrame, endFrame);
				const top = Math.min(session.startY, event.clientY);
				const bottom = Math.max(session.startY, event.clientY);
				const selected = timelineSelectableKeys()
					.filter((key) => {
						const laneElement = session.container.querySelector<HTMLElement>(`[data-timeline-lane="${key.trackId}"]`);

						if (!laneElement) {
							return false;
						}

						const laneBounds = laneElement.getBoundingClientRect();
						const verticalOverlap = laneBounds.bottom >= top && laneBounds.top <= bottom;

						return verticalOverlap && key.frameIndex >= minimum && key.frameIndex <= maximum;
					})
					.map(({ trackId, keyId }) => ({ trackId, keyId }));

				setSelectedTimelineKeys(selected, session.additive);
			}
		}

		if (session.captureTarget.hasPointerCapture(event.pointerId)) {
			session.captureTarget.releasePointerCapture(event.pointerId);
		}
		marqueeRef.current = undefined;
		setTimelineMarquee(undefined);
	};
	const timelineMarqueeHandlers = {
		onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => endTimelineMarquee(event, true),
		onPointerDown: beginTimelineMarquee,
		onPointerMove: updateTimelineMarquee,
		onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => endTimelineMarquee(event, false)
	} as const;
	const timelineKeyDown = function timelineKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
		const target = event.target;
		const isFormTarget = target instanceof HTMLInputElement
			|| target instanceof HTMLTextAreaElement
			|| target instanceof HTMLSelectElement
			|| target instanceof HTMLElement && target.isContentEditable;
		const keyDrag = keyDragRef.current;
		const marquee = marqueeRef.current;

		if (event.key === 'Escape' && openDetails === 'track' && !keyDrag && !marquee) {
			event.preventDefault();
			event.stopPropagation();
			closeTrackDetails();
			return;
		}

		if (isFormTarget) {
			return;
		}

		const modifier = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();

		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();

			if (keyDrag) {
				if (keyDrag.captureTarget.hasPointerCapture(keyDrag.pointerId)) {
					keyDrag.captureTarget.releasePointerCapture(keyDrag.pointerId);
				}
				setSelectedKeys(keyDrag.previousKeys);
				setSelectedTrackId(keyDrag.previousTrackId);
				onContextChange(contextForTimelineKeys(keyDrag.previousKeys));
			}
			if (marquee) {
				if (marquee.captureTarget.hasPointerCapture(marquee.pointerId)) {
					marquee.captureTarget.releasePointerCapture(marquee.pointerId);
				}
				setSelectedKeys(marquee.previousKeys);
				setSelectedTrackId(marquee.previousTrackId);
				onContextChange(contextForTimelineKeys(marquee.previousKeys));
			}

			keyDragRef.current = undefined;
			marqueeRef.current = undefined;
			keyDragClickSuppressedRef.current = false;
			setTimelineKeyDragDelta(0);
			setTimelineMarquee(undefined);
			return;
		}
		if (modifier && !event.shiftKey && !event.altKey && key === 'c') {
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
		if (modifier && !event.shiftKey && !event.altKey && key === 'v') {
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
		if (!modifier && (key === 'delete' || key === 'backspace')) {
			event.preventDefault();
			event.stopPropagation();
			if (selectedKeys.length > 0) {
				deleteSelectedKeys();
			}
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
		if (selectedKeys.length === 0) {
			return;
		}

		onDeleteKeys(selectedKeys);
		setSelectedKeys([]);
		onContextChange({ kind: 'none' });
	};
	const markerClassForKind = function markerClassForKind(markerKind: TimelineMarkerKind): string {
		return `timeline-key-marker is-${markerKind.replace('continuous-', '')}`;
	};
	const renderKeyMarkers = function renderKeyMarkers(row: TimelineRow): readonly ReactElement[] {
		return row.keys
			.filter((key) => {
				const selected = key.trackId ? selectedKeys.some((candidate) => candidate.keyId === key.id && candidate.trackId === key.trackId) : false;
				const frameIndex = key.frameIndex + (selected ? timelineKeyDragDelta : 0);

				return frameIndex >= timelineRange.startFrame && frameIndex <= timelineRange.endFrame;
			})
			.map((key) => {
				const trackId = key.trackId;
				const selected = trackId ? selectedKeys.some((candidate) => candidate.keyId === key.id && candidate.trackId === trackId) : false;
				const frameIndex = key.frameIndex + (selected ? timelineKeyDragDelta : 0);
				const markerClass = markerClassForKind(key.markerKind);
				const keyLabel = row.kind === 'property' || row.kind === 'draw-order'
					? `Key frame ${key.frameIndex + 1}`
					: `${row.label} key at frame ${key.frameIndex + 1}`;

				return (
					<Tooltip className="timeline-marker-tooltip" key={`${key.id}:${key.trackId ?? 'aggregate'}`} label={`${keyLabel} · select or drag to retime`}>
						<button
							aria-label={keyLabel}
							className={`${row.kind === 'property' ? 'track-key' : 'timeline-summary-key'} ${markerClass}${selected ? ' is-selected' : ''}${selected && timelineKeyDragDelta !== 0 ? ' is-preview' : ''}`}
							data-key-id={key.id}
							data-key-kind={key.markerKind}
							type="button"
							onClick={(event) => {
								event.stopPropagation();

								if (keyDragClickSuppressedRef.current) {
									keyDragClickSuppressedRef.current = false;
									return;
								}

								if (trackId) {
									selectAnimationKey(trackId, key.id, event.metaKey || event.ctrlKey);
								}
							}}
							onPointerCancel={trackId ? (event: ReactPointerEvent<HTMLButtonElement>): void => endKeyPointerDrag(event, true) : undefined}
							onPointerDown={trackId ? (event: ReactPointerEvent<HTMLButtonElement>): void => beginKeyPointerDrag(event, trackId, key.id) : undefined}
							onPointerMove={trackId ? updateKeyPointerDrag : undefined}
								onPointerUp={trackId ? (event: ReactPointerEvent<HTMLButtonElement>): void => endKeyPointerDrag(event, false) : undefined}
								style={{ left: `${((frameIndex - timelineRange.startFrame + 0.5) / timelineVisibleCount) * 100}%` }}
								title={`${row.label} · frame ${key.frameIndex + 1} · drag to retime`}
							>
								<span aria-hidden="true" className="timeline-marker-glyph" />
							</button>
					</Tooltip>
				);
			});
	};
	const selectTimelineEvent = function selectTimelineEvent(eventId: EntityId): void {
		if (!activeClip) {
			return;
		}

		const event = activeClip.events.find((candidate) => candidate.id === eventId);

		if (!event) {
			return;
		}

		const frameIndex = frameIndexForTime(activeClip, event.timeSeconds);

		setSelectedEventId(event.id);
		onSeekPlayback(frameIndex);
		onContextChange({ kind: 'event', clipId: activeClip.id, eventId: event.id });
	};
	const renderEventMarkers = function renderEventMarkers(row: TimelineRow): readonly ReactElement[] {
		return row.keys
			.filter((key) => key.frameIndex >= timelineRange.startFrame && key.frameIndex <= timelineRange.endFrame)
			.map((key) => {
				const event = activeClip?.events.find((candidate) => candidate.id === key.id);
				const label = event ? `Event ${event.name} at frame ${key.frameIndex + 1}` : `Event at frame ${key.frameIndex + 1}`;

				return (
					<Tooltip className="timeline-marker-tooltip" key={key.id} label={`${label} · select to edit in Properties`}>
						<button
							aria-label={label}
							className={selectedEventId === key.id ? 'event-key is-selected' : 'event-key'}
							data-event-id={key.id}
							data-key-kind={key.markerKind}
							onClick={(eventClick) => { eventClick.stopPropagation(); selectTimelineEvent(key.id); }}
							style={{ left: `${((key.frameIndex - timelineRange.startFrame + 0.5) / timelineVisibleCount) * 100}%` }}
								title={label}
								type="button"
							>
								<span aria-hidden="true" className="timeline-marker-glyph" />
							</button>
					</Tooltip>
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
				<div className="animate-timeline" data-testid="animate-timeline" tabIndex={0} onKeyDown={timelineKeyDown} onKeyDownCapture={timelineKeyDownCapture}>
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
										<button className="quiet-button" type="button" onClick={() => { setOpenDetails(undefined); onContextChange({ kind: 'clip', clipId: activeClip.id }); }}>Clip settings</button>
											<button aria-controls={trackDetailsId} aria-expanded={openDetails === 'track'} aria-haspopup="dialog" className="quiet-button" ref={trackDetailsTriggerRef} type="button" onClick={toggleTrackDetails}>Track details</button>
										<button className="quiet-button" type="button" disabled={selectedKeyMarkers.length === 0} onClick={() => { setOpenDetails(undefined); onContextChange(contextForTimelineKeys(selectedKeys)); }}>Key details</button>
										<button className="quiet-button" type="button" disabled={!selectedEvent} onClick={() => { setOpenDetails(undefined); if (selectedEvent) { onContextChange({ kind: 'event', clipId: activeClip.id, eventId: selectedEvent.id }); } }}>Event details</button>
									</div>
								</div>
								<div className="clip-playback-controls" aria-label="Playback controls">
									<Tooltip label="Step backward" shortcut="Left Arrow">
										<button className="quiet-button" type="button" aria-label="Step backward" aria-keyshortcuts="ArrowLeft" onClick={() => onStepPlayback(-1)}>◀</button>
									</Tooltip>
									<Tooltip label={playback.playing ? 'Pause animation' : 'Play animation'} shortcut="Space">
										<button className="secondary-button" type="button" aria-label={playback.playing ? 'Pause animation' : 'Play animation'} aria-keyshortcuts="Space" onClick={onTogglePlayback}>
											{playback.playing ? 'Pause' : 'Play'}
										</button>
									</Tooltip>
									<Tooltip label="Step forward" shortcut="Right Arrow">
										<button className="quiet-button" type="button" aria-label="Step forward" aria-keyshortcuts="ArrowRight" onClick={() => onStepPlayback(1)}>▶</button>
									</Tooltip>
									<span className="playback-readout">Frame {playback.frameIndex + 1} / {frameCountForClip(activeClip)} · {frameTimeSeconds(playback, activeClip).toFixed(3)}s</span>
									<label className="auto-key-field"><input type="checkbox" aria-label="Auto Key" checked={autoKey} onChange={(event) => onAutoKeyChange(event.target.checked)} /><span>Auto Key</span></label>
									<button className="quiet-button" type="button" aria-keyshortcuts="K" onClick={onKeyPendingEdits} disabled={pendingEditCount === 0} title="Key edited properties · K">Key edited properties{pendingEditCount > 0 ? ` (${pendingEditCount})` : ''}</button>
									<Tooltip label="Copy pose" shortcut="Ctrl/Cmd + Shift + C">
										<button className="quiet-button" type="button" aria-label="Copy pose" aria-keyshortcuts="Control+Shift+C Meta+Shift+C" onClick={onCopyPose} disabled={!activeClip || !poseAvailable}>Copy pose</button>
									</Tooltip>
									<Tooltip label="Paste pose" shortcut="Ctrl/Cmd + Shift + V">
										<button className="quiet-button" type="button" aria-label="Paste pose" aria-keyshortcuts="Control+Shift+V Meta+Shift+V" onClick={onPastePose} disabled={!activeClip || !poseClipboardAvailable}>Paste pose</button>
									</Tooltip>
								</div>
								<div className="timeline-navigation">
									<div className="timeline-navigation-actions" aria-label="Timeline navigation">
										<Tooltip label="Pan timeline left">
											<button className="quiet-button" type="button" aria-label="Pan timeline left" onClick={() => setTimelineViewport((current) => panTimeline(current, 320, frameCount))}>◀</button>
										</Tooltip>
										<Tooltip label="Zoom timeline out">
											<button className="quiet-button" type="button" aria-label="Zoom timeline out" onClick={() => setTimelineViewport((current) => zoomTimeline(current, -1, playback.frameIndex, frameCount))}>−</button>
										</Tooltip>
										<Tooltip label="Reset timeline view">
											<button className="quiet-button" type="button" aria-label="Reset timeline view" onClick={() => setTimelineViewport(resetTimelineViewport())}>100%</button>
										</Tooltip>
										<Tooltip label="Zoom timeline in">
											<button className="quiet-button" type="button" aria-label="Zoom timeline in" onClick={() => setTimelineViewport((current) => zoomTimeline(current, 1, playback.frameIndex, frameCount))}>+</button>
										</Tooltip>
										<Tooltip label="Pan timeline right">
											<button className="quiet-button" type="button" aria-label="Pan timeline right" onClick={() => setTimelineViewport((current) => panTimeline(current, -320, frameCount))}>▶</button>
										</Tooltip>
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
									{visiblePinnedEntityIds.size > 0 && <button className="quiet-button" type="button" aria-label="Clear pinned timeline rows" title="Clear all pinned timeline rows" onClick={onClearPinnedEntities}>Clear pins</button>}
									<span className="timeline-zoom-readout">{Math.round(timelineViewport.pixelsPerFrame / 32 * 100)}%</span>
								</div>
							</div>
							<div className="timeline-content" id="animation-timeline-pane" data-testid="timeline-scroll-region">
								<div className="timeline-ruler-meta">
									<span aria-label="Timeline frame range">Frames {timelineRange.startFrame + 1}–{timelineRange.endFrame + 1} of {frameCount}</span>
									<span className="muted-copy">{trackRows.length} matching track{trackRows.length === 1 ? '' : 's'}</span>
									{timelineNotice && <span className="timeline-notice" role="status">{timelineNotice}</span>}
									{poseClipboardNotice && <span className="pose-clipboard-notice" role="status" aria-live="polite">{poseClipboardNotice}</span>}
								</div>
								<div className="dopesheet" aria-label="Animation tracks">
									<div className="dopesheet-ruler">
											<span className="track-row-label timeline-sticky-label">Track</span>
											<div
												aria-label="Timeline ruler"
												aria-valuemax={frameCount - 1}
													aria-valuemin={0}
												aria-valuenow={playback.frameIndex}
												aria-valuetext={`Frame ${playback.frameIndex + 1} of ${frameCount}`}
												className="timeline-ruler"
												onClick={seekTimelinePointer}
												onKeyDown={timelineRulerKeyDown}
												tabIndex={0}
												role="slider"
											>
											{Array.from({ length: timelineVisibleCount }, (_, index) => timelineRange.startFrame + index).map((frame) => (
												<span className={frame === playback.frameIndex ? 'timeline-tick is-playhead' : 'timeline-tick'} key={frame}>{frame + 1}</span>
											))}
										</div>
									</div>
									{trackRows.length === 0 && !groupedRows.some((row) => row.kind === 'draw-order' || row.kind === 'events') ? (
										<div className="dopesheet-empty">No typed tracks match this filter.</div>
										) : (
											<div className="dopesheet-body" ref={timelineKeyAreaRef}>
											{groupedRows.map((row) => {
										if (row.kind === 'overview') {
											return (
														<div className="track-row timeline-group-row timeline-overview-row" data-timeline-row-id={row.id} key={row.id}>
														<div className="track-row-label timeline-sticky-label"><span>Overview</span><small>{row.subLabel}</small></div>
																						<div
																							aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
																							aria-label={`Seek ${row.label} timeline; current frame ${playback.frameIndex + 1}`}
																							{...timelineMarqueeHandlers}
																							className="track-key-lane timeline-summary-lane"
																							onClick={seekTimelinePointer}
																							onKeyDown={timelineLaneKeyDown}
																							tabIndex={0}
																							role="group"
																						>{renderKeyMarkers(row)}</div>
												</div>
											);
										}
										if (row.kind === 'entity') {
											const entityId = row.entityId;

											if (!entityId) {
												return null;
											}

											return (
																															<div className={row.selected ? 'track-row timeline-group-row is-selected' : 'track-row timeline-group-row'} data-entity-id={entityId} data-timeline-row-id={row.id} key={row.id}>
																		<div className="timeline-group-label timeline-sticky-label">
																			<Tooltip label={`${row.expanded ? 'Collapse' : 'Expand'} ${row.label}`}>
																				<button className="timeline-row-expander" type="button" aria-expanded={row.expanded} aria-label={`${row.expanded ? 'Collapse' : 'Expand'} ${row.label}`} onClick={() => toggleTimelineGroup(row.id)}>{row.expanded ? '▾' : '▸'}</button>
																			</Tooltip>
																			<button className="timeline-row-select" type="button" aria-pressed={row.selected} onClick={(event) => selectTimelineRow(row, event.metaKey || event.ctrlKey)}><span>{row.label}</span><small>{row.subLabel}</small></button>
																			{rowMode === 'selection' && <Tooltip label={`${visiblePinnedEntityIds.has(entityId) ? 'Unpin' : 'Pin'} ${row.label} timeline rows`}><button className={visiblePinnedEntityIds.has(entityId) ? 'timeline-pin is-pinned' : 'timeline-pin'} type="button" aria-pressed={visiblePinnedEntityIds.has(entityId)} aria-label={`${visiblePinnedEntityIds.has(entityId) ? 'Unpin' : 'Pin'} ${row.label} timeline rows`} onClick={(event) => { event.stopPropagation(); onTogglePinnedEntity(entityId); }}>{visiblePinnedEntityIds.has(entityId) ? '●' : '○'}</button></Tooltip>}
																</div>
																					<div
																							aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
																							aria-label={`Seek ${row.label} timeline; current frame ${playback.frameIndex + 1}`}
																							{...timelineMarqueeHandlers}
																							className="track-key-lane timeline-summary-lane"
																							onClick={seekTimelinePointer}
																							onKeyDown={timelineLaneKeyDown}
																							tabIndex={0}
																							role="group"
																						>{renderKeyMarkers(row)}</div>
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
																							<div className={selectedRow?.track.id === trackId ? 'track-row timeline-property-row is-selected' : 'track-row timeline-property-row'} data-track-id={trackId} data-timeline-row-id={row.id} key={row.id}>
																							<button className="track-row-label timeline-sticky-label timeline-row-select" style={{ paddingLeft: `${row.depth * 16}px` }} aria-label={`Select ${row.label}`} aria-pressed={selectedRow?.track.id === trackId} type="button" onClick={(event) => selectTimelineRow(row, event.metaKey || event.ctrlKey)}><span>{row.label}</span><small>{row.subLabel ?? track.track.kind}</small></button>
																					<div
																							aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
																							aria-label={`Seek ${row.label} timeline; current frame ${playback.frameIndex + 1}`}
																							{...timelineMarqueeHandlers}
																							className="track-key-lane"
																							data-timeline-lane={trackId}
																							onClick={seekTimelinePointer}
																							onKeyDown={timelineLaneKeyDown}
																							tabIndex={0}
																							role="group"
																						>
																							{renderKeyMarkers(row)}
																					</div>
												</div>
											);
										}
												if (row.kind === 'draw-order') {
											const track = trackRows.find((candidate) => candidate.track.kind === 'slot-draw-order');

											return track ? (
														<div className="track-row timeline-group-row timeline-special-row" data-track-id={track.track.id} data-timeline-row-id={row.id} key={row.id}>
															<div className="track-row-label timeline-sticky-label"><span>{row.label}</span><small>{row.subLabel}</small></div>
																							<div
																							aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
																							aria-label={`Seek ${row.label} timeline; current frame ${playback.frameIndex + 1}`}
																							{...timelineMarqueeHandlers}
																							className="track-key-lane timeline-summary-lane"
																							data-timeline-lane={track.track.id}
																							onClick={seekTimelinePointer}
																							onKeyDown={timelineLaneKeyDown}
																							tabIndex={0}
																							role="group"
																						>{renderKeyMarkers(row)}</div>
												</div>
													) : null;
												}
												if (row.kind === 'events') {
													return (
														<div className="event-track timeline-event-row" aria-label="Animation events" data-timeline-row-id={row.id} key={row.id}>
															<div className="track-row-label event-row-label timeline-sticky-label">
																<div><span>{row.label}</span><small>{row.subLabel}</small></div>
																<button className="quiet-button" type="button" onClick={addTimelineEvent}>Add event</button>
															</div>
																							<div
																							aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
																							aria-label={`Seek ${row.label} timeline; current frame ${playback.frameIndex + 1}`}
																							{...timelineMarqueeHandlers}
																							className="track-key-lane"
																							onClick={seekTimelinePointer}
																							onKeyDown={timelineLaneKeyDown}
																							tabIndex={0}
																							role="group"
																						>{renderEventMarkers(row)}</div>
														</div>
													);
												}

												return null;
												})}
													{timelineMarquee && <div className="timeline-marquee" style={{ left: timelineMarquee.left, top: timelineMarquee.top, width: timelineMarquee.width, height: timelineMarquee.height }} />}
												</div>
										)}
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
							{openDetails === 'track' && (
											<section className="timeline-create-menu" aria-labelledby={trackDetailsHeadingId} id={trackDetailsId} role="dialog">
											<div className="timeline-detail-heading">
												<div><p className="eyebrow">Details</p><h2 id={trackDetailsHeadingId}>Track details</h2></div>
												<button className="quiet-button" ref={trackDetailsCloseRef} type="button" aria-label="Close Track details" onClick={closeTrackDetails}>Close</button>
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
						</div>
					)}
				</div>
			)}
		</>
	);
};
