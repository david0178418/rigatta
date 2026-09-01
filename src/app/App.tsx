import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { DEFAULT_LOCAL_TRANSFORM, degreesToRadians, radiansToDegrees, type LocalTransform } from '../domain/coordinates.ts';
import { isEventPayload } from '../domain/events.ts';
import { createEntityId, parseEntityId, type EntityId } from '../domain/ids.ts';
import {
	canRedo,
	canUndo,
	beginTransaction,
	cancelTransaction,
	commitTransaction,
	createHistory,
	currentProject,
	dispatchCommand,
	redo,
	undo,
	type HistoryState
} from '../domain/history.ts';
import type { ProjectCommand } from '../domain/commands.ts';
import type { BoneTransformProperty, Clip, CubicBezier, Interpolation, Project, Track } from '../domain/model.ts';
import { validateProject, type ValidationDiagnostic } from '../domain/validation.ts';
import { canvasWarningsForSetup, type CanvasWarning } from '../domain/canvas-warnings.ts';
import type { AttachmentKeyInput, BooleanKeyInput, DrawOrderKeyInput, DuplicateClipIds, EventKeyInput, EventKeyUpdate, KeyTimeChange, NumberKeyInput, NumberKeyInterpolationInput, TrackDefinition } from '../domain/animation.ts';
import { advancePlayback, createPlaybackState, frameCountForClip, frameTimeSeconds, seekPlayback, stepPlayback, togglePlayback, type PlaybackDirection, type PlaybackState } from '../domain/playback.ts';
import { localPointForBone, evaluateBoneWorldMatrices } from '../domain/transforms.ts';
import type { OperationResult } from '../domain/operations.ts';
import { importDroppedItems, pickImageDirectory, type AssetDropItem, type AssetImportResult, type ImportedImage } from '../assets/import.ts';
import { createAutosaveScheduler } from '../persistence/autosave.ts';
import { estimateStorage, type StorageReport } from '../persistence/storage.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import type { ReadyStartup, StartupState } from './startup.ts';
import { loadEditorStartup } from './startup.ts';
import { buildAssetLibraryEntries } from './asset-library.ts';
import { entitiesInBounds, hitTestProject } from './hit-testing.ts';
import { boneDropCommands, dropZoneForClientY, type BoneDropZone } from './hierarchy-dnd.ts';
import { DEFAULT_GRID_SETTINGS, type GridSettings } from './grid.ts';
import { createSelection, isSelected, selectEntities, selectEntity, type SelectableEntity, type Selection } from './selection.ts';
import { slotDropCommands, slotDropZoneForClientY, type SlotDropZone } from './slot-dnd.ts';
import { availableTrackDefinitions, buildTimelineTrackRows, createTimelineViewport, frameIndexForTime, panTimeline, resetTimelineViewport, timelineFrameRange, visibleFrameCount, zoomTimeline, type TimelineViewport } from './timeline.ts';
import { createTransformGesture, isTransformHandleHit, transformGestureCommands, type TransformGesture, type TransformPhase, type TransformTool } from './transform-gesture.ts';
import { ViewportCanvas } from './ViewportCanvas.tsx';
import type { ViewportPoint } from './viewport.ts';
import { clipIdsForProject, createExportClipSelection, normalizeExportClipIds, setExportOutputMode, toggleExportClip, type ExportClipSelection } from '../export/selection.ts';
import { createExportDiagnostics, formatByteCount } from '../export/diagnostics.ts';
import { createExampleAssetBlobs, exampleProject } from '../examples/example-project.ts';
import { shortcutActionFor, type ShortcutAction } from './shortcuts.ts';
import { nextAvailableName } from './entity-names.ts';

type EditorMode = 'setup' | 'animate';

const transformToolLabels: Record<TransformTool, string> = {
	translate: 'Move',
	rotate: 'Rotate',
	scale: 'Scale',
	shear: 'Shear'
};

const BONE_DRAG_MIME = 'application/x-bone-animation-bone';
const ASSET_DRAG_MIME = 'application/x-bone-animation-asset';
const SLOT_DRAG_MIME = 'application/x-bone-animation-slot';

const modeLabels: Record<EditorMode, string> = {
	setup: 'Setup',
	animate: 'Animate'
};

const errorMessage = function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'The editor could not start.';
};

const blobForImage = function blobForImage(image: ImportedImage): Blob {
	const buffer = new ArrayBuffer(image.bytes.byteLength);
	new Uint8Array(buffer).set(image.bytes);

	return new Blob([buffer], { type: image.mimeType });
};

const formNumber = function formNumber(data: FormData, name: string): number | undefined {
	const value = data.get(name);

	if (typeof value !== 'string' || value.trim().length === 0) {
		return undefined;
	}

	const number = Number(value);

	return Number.isFinite(number) ? number : undefined;
};

const transformFromForm = function transformFromForm(
	data: FormData,
	current: LocalTransform
): LocalTransform | undefined {
	const x = formNumber(data, 'x');
	const y = formNumber(data, 'y');
	const rotation = formNumber(data, 'rotation');
	const scaleX = formNumber(data, 'scaleX');
	const scaleY = formNumber(data, 'scaleY');
	const shearX = formNumber(data, 'shearX');
	const shearY = formNumber(data, 'shearY');

	if ([x, y, rotation, scaleX, scaleY, shearX, shearY].some((value) => value === undefined)) {
		return undefined;
	}

	return {
		x: x ?? current.x,
		y: y ?? current.y,
		rotation: degreesToRadians(rotation ?? radiansToDegrees(current.rotation)),
		scaleX: scaleX ?? current.scaleX,
		scaleY: scaleY ?? current.scaleY,
		shearX: degreesToRadians(shearX ?? radiansToDegrees(current.shearX)),
		shearY: degreesToRadians(shearY ?? radiansToDegrees(current.shearY))
	};
};

const imagePropertiesFromForm = function imagePropertiesFromForm(
	data: FormData
): Readonly<{ opacity: number; pivotX: number; pivotY: number }> | undefined {
	const opacity = formNumber(data, 'opacity');
	const pivotX = formNumber(data, 'pivotX');
	const pivotY = formNumber(data, 'pivotY');

	return opacity === undefined || pivotX === undefined || pivotY === undefined
		? undefined
		: { opacity, pivotX, pivotY };
};

const rectangleSizeFromForm = function rectangleSizeFromForm(
	data: FormData
): Readonly<{ width: number; height: number }> | undefined {
	const width = formNumber(data, 'width');
	const height = formNumber(data, 'height');

	return width === undefined || height === undefined ? undefined : { width, height };
};

const blobsForProject = function blobsForProject(
	project: Project,
	blobs: ProjectAssetBlobs
): ProjectAssetBlobs {
	return new Map(project.assets.flatMap((asset) => {
		const blob = blobs.get(asset.id);

		return blob ? [[asset.id, blob] as const] : [];
	}));
};

const duplicateIdsForClip = function duplicateIdsForClip(clip: Clip): DuplicateClipIds {
	return {
		id: createEntityId(),
		trackIds: clip.tracks.map(() => createEntityId()),
		keyIds: clip.tracks.map((track) => track.keys.map(() => createEntityId())),
		eventIds: clip.events.map(() => createEntityId())
	};
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

const animationProperties: readonly BoneTransformProperty[] = [
	'x',
	'y',
	'rotation',
	'scaleX',
	'scaleY',
	'shearX',
	'shearY'
];

type PendingAnimationProperty = BoneTransformProperty | 'opacity' | 'width' | 'height';

type PendingAnimationEdit = Readonly<{
	targetId: EntityId;
	property: PendingAnimationProperty;
}>;

type AnimationKeyState = 'unkeyed' | 'edited' | 'keyed';

const keyStateLabels: Readonly<Record<AnimationKeyState, string>> = {
	unkeyed: 'Unkeyed',
	edited: 'Pending',
	keyed: 'Keyed'
};

const animationKeyState = function animationKeyState(
	project: Project,
	clip: Clip | undefined,
	targetId: EntityId,
	property: PendingAnimationProperty,
	frameIndex: number,
	pendingEdits: readonly PendingAnimationEdit[]
): AnimationKeyState {
	if (pendingEdits.some((edit) => edit.targetId === targetId && edit.property === property)) {
		return 'edited';
	}
	if (!clip) {
		return 'unkeyed';
	}

	const transformTrackKind = project.bones.some((bone) => bone.id === targetId)
		? 'bone-transform'
		: 'attachment-transform';
	const track = property === 'opacity'
		? clip.tracks.find((candidate) => candidate.kind === 'attachment-opacity' && candidate.targetId === targetId)
		: property === 'width' || property === 'height'
			? clip.tracks.find((candidate) => candidate.kind === 'rectangle-size' && candidate.targetId === targetId && candidate.property === property)
			: clip.tracks.find((candidate) => candidate.kind === transformTrackKind && candidate.targetId === targetId && candidate.property === property);

	return track?.keys.some((key) => Math.round(key.timeSeconds * clip.fps) === frameIndex) ? 'keyed' : 'unkeyed';
};

const trackMatchesDefinition = function trackMatchesDefinition(
	track: Track,
	definition: TrackDefinition
): boolean {
	if (track.kind !== definition.kind) {
		return false;
	}

	return (!('targetId' in definition) || ('targetId' in track && track.targetId === definition.targetId))
		&& (!('property' in definition) || ('property' in track && track.property === definition.property));
};

const autoKeyCommandsForNumber = function autoKeyCommandsForNumber(
	clip: Clip,
	definition: TrackDefinition,
	value: number,
	timeSeconds: number
): readonly ProjectCommand[] {
	const existingTrack = clip.tracks.find((track) => trackMatchesDefinition(track, definition));
	const trackId = existingTrack?.id ?? createEntityId();

	return [
		...(existingTrack ? [] : [{ kind: 'create-track' as const, id: trackId, clipId: clip.id, definition }]),
		{ kind: 'set-number-key' as const, id: createEntityId(), clipId: clip.id, trackId, input: { timeSeconds, value, interpolation: 'linear' as const, curve: null } }
	];
};

export const App = function App(): ReactElement {
	const [startup, setStartup] = useState<StartupState>({ status: 'loading' });

	useEffect(() => {
		const lifecycle = { cancelled: false };

		void loadEditorStartup()
			.then((nextStartup) => {
				if (!lifecycle.cancelled) {
					setStartup(nextStartup);
					return;
				}
				if (nextStartup.status === 'ready') {
					nextStartup.repository.close();
				}
			})
			.catch((error: unknown) => {
				if (!lifecycle.cancelled) {
					setStartup({ status: 'fatal', message: errorMessage(error) });
				}
			});

		return function cleanup(): void {
			lifecycle.cancelled = true;
		};
	}, []);

	if (startup.status === 'loading') {
		return <StartupStateView title="Loading project storage" message="Checking local projects and recovery snapshots…" />;
	}
	if (startup.status === 'unsupported') {
		return <StartupStateView title="Browser support required" message={`${startup.message} Use current desktop Chrome with site storage enabled.`} />;
	}
	if (startup.status === 'fatal') {
		return <StartupStateView title="Could not open the editor" message={startup.message} />;
	}

	return <EditorShell startup={startup} />;
};

const StartupStateView = function StartupStateView({
	title,
	message
}: Readonly<{ title: string; message: string }>): ReactElement {
	return (
		<main className="startup-view" aria-live="polite">
			<div className="startup-card">
				<span className="brand-mark" aria-hidden="true">BA</span>
				<p className="eyebrow">Bone Animation Utility</p>
				<h1>{title}</h1>
				<p>{message}</p>
			</div>
		</main>
	);
};

type ClipPlaybackSettings = Readonly<Partial<{
	durationSeconds: number;
	fps: number;
	loop: boolean;
}>>;

type AnimationKeyInput =
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

type AnimateTimelineProps = Readonly<{
	project: Project;
	activeClip: Clip | undefined;
	playback: PlaybackState;
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
	onAutoKeyChange: (enabled: boolean) => void;
	onKeyPendingEdits: () => void;
}>;

const AnimateTimeline = function AnimateTimeline({
	project,
	activeClip,
	playback,
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
	const submitCreateTrack = function submitCreateTrack(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();

		if (!selectedTrackOption) {
			return;
		}

		const id = onCreateTrack(selectedTrackOption.definition);

		if (id) {
			setSelectedTrackId(id);
			setSelectedKeys([]);
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
			setSelectedKeys([{ trackId: track.id, keyId: added }]);
			setSelectedTrackId(track.id);
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
		setSelectedTrackId(trackId);
		setSelectedKeys((current) => {
			const selected = current.some((key) => key.trackId === trackId && key.keyId === keyId);

			if (!additive) {
				return [{ trackId, keyId }];
			}
			if (selected) {
				return current.filter((key) => key.trackId !== trackId || key.keyId !== keyId);
			}

			return [...current, { trackId, keyId }];
		});
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
				<div className="animate-timeline">
					<div className="clip-tabs" aria-label="Animation clips">
						{project.clips.map((clip) => (
							<button
								className={activeClip?.id === clip.id ? 'clip-tab is-active' : 'clip-tab'}
								key={clip.id}
								type="button"
								onClick={() => onSelectClip(clip.id)}
								aria-pressed={activeClip?.id === clip.id}
							>
									{clip.name}
							</button>
							))}
					</div>
					{activeClip && (
						<div className="clip-editor">
							<div className="clip-editor-heading">
								<span className="muted-copy">{activeClip.tracks.length} tracks · {activeClip.events.length} events</span>
								<div className="inspector-actions">
									<button className="quiet-button" type="button" onClick={onDuplicateClip}>Duplicate</button>
									<button className="danger-button" type="button" onClick={onDeleteClip}>Delete</button>
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
								<span className="timeline-zoom-readout">{Math.round(timelineViewport.pixelsPerFrame / 32 * 100)}%</span>
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
							<div className="event-toolbar">
								<span className="muted-copy">{activeClip.events.length} event{activeClip.events.length === 1 ? '' : 's'}</span>
								<button className="secondary-button" type="button" onClick={addTimelineEvent}>Add event</button>
							</div>
							{selectedTrack && (
								<div className="track-edit-toolbar">
									<span className="muted-copy">Selected: {selectedRow?.label}</span>
									<button className="danger-button" type="button" onClick={deleteSelectedTrack}>Delete track</button>
								</div>
							)}
							{selectedTrack && (
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
							)}
							<div className="timeline-ruler-meta">
								<span aria-label="Timeline frame range">Frames {timelineRange.startFrame + 1}–{timelineRange.endFrame + 1} of {frameCount}</span>
								<span className="muted-copy">{trackRows.length} matching track{trackRows.length === 1 ? '' : 's'}</span>
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
								) : trackRows.map((row) => (
									<div className={selectedRow?.track.id === row.track.id ? 'track-row is-selected' : 'track-row'} data-track-id={row.track.id} key={row.track.id} onClick={() => { setSelectedTrackId(row.track.id); setSelectedKeys([]); }}>
										<div className="track-row-label"><span>{row.label}</span><small>{row.track.kind}</small></div>
										<div className="track-key-lane">
											{row.keys.filter((key) => key.frameIndex >= timelineRange.startFrame && key.frameIndex <= timelineRange.endFrame).map((key) => (
													<button
														aria-label={`Key frame ${key.frameIndex + 1}`}
														className={selectedKeys.some((selected) => selected.keyId === key.id && selected.trackId === row.track.id) ? 'track-key is-selected' : 'track-key'}
														key={key.id}
														onClick={(event) => { event.stopPropagation(); selectAnimationKey(row.track.id, key.id, event.metaKey || event.ctrlKey); }}
														type="button"
														style={{ left: `${((key.frameIndex - timelineRange.startFrame + 0.5) / timelineVisibleCount) * 100}%` }}
														title={`Frame ${key.frameIndex + 1}`}
													/>
											))}
										</div>
									</div>
								))}
																						</div>
																				<div className="event-track" aria-label="Animation events">
																					<div className="track-row-label"><span>Events</span><small>event</small></div>
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
																									onClick={() => { setSelectedEventId(event.id); setEventError(undefined); }}
																									type="button"
																									style={{ left: `${((frameIndex - timelineRange.startFrame + 0.5) / timelineVisibleCount) * 100}%` }}
																									title={`${event.name} · frame ${frameIndex + 1}`}
																								/>
																								);
																					})}
																					</div>
																				</div>
																				{selectedEvent && (
																					<>
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
																						</>
																				)}
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
														setSelectedKeys([{ trackId: selectedRow.track.id, keyId: copiedId }]);
											}
										}
									}}>Copy key</button>
									<button className="danger-button" type="button" onClick={deleteSelectedKeys}>Delete key</button>
								</form>
							)}
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
						</div>
					)}
				</div>
			)}
		</>
	);
};

type ExportControlsProps = Readonly<{
	project: Project;
	selection: ExportClipSelection;
	storageReport?: StorageReport;
	requiredStorageBytes: number;
	onChange: (selection: ExportClipSelection) => void;
	onClose: () => void;
}>;

const ExportControls = function ExportControls({
	project,
	selection,
	storageReport,
	requiredStorageBytes,
	onChange,
	onClose
}: ExportControlsProps): ReactElement {
	const selectedClipIds = normalizeExportClipIds(project, selection.clipIds);
	const allClipsSelected = project.clips.length > 0 && selectedClipIds.length === project.clips.length;
	const preflight = createExportDiagnostics(project, { ...selection, clipIds: selectedClipIds }, {
		storageReport,
		requiredStorageBytes
	});

	return (
		<div className="export-panel-overlay">
			<section className="export-panel" aria-label="Export controls">
				<div className="panel-heading">
					<div>
						<p className="eyebrow">Output</p>
						<h2>Export animation</h2>
					</div>
					<button className="quiet-button" type="button" aria-label="Close export controls" onClick={onClose}>Close</button>
				</div>
				<p className="muted-copy export-description">Choose the clips and file grouping for the next export.</p>
				<fieldset className="export-mode-fieldset">
					<legend>File grouping</legend>
					<label>
						<input
							type="radio"
							name="export-mode"
							value="combined"
							checked={selection.mode === 'combined'}
							onChange={() => onChange(setExportOutputMode(selection, 'combined'))}
						/>
						<span>Combined output</span>
					</label>
					<label>
						<input
							type="radio"
							name="export-mode"
							value="per-clip"
							checked={selection.mode === 'per-clip'}
							onChange={() => onChange(setExportOutputMode(selection, 'per-clip'))}
						/>
						<span>One output per clip</span>
					</label>
				</fieldset>
				<div className="export-clip-heading">
					<span className="field-label">Clips</span>
					<div className="inspector-actions">
						<button className="quiet-button" type="button" onClick={() => onChange({ ...selection, clipIds: clipIdsForProject(project) })}>Select all</button>
						<button className="quiet-button" type="button" onClick={() => onChange({ ...selection, clipIds: [] })}>Clear</button>
					</div>
				</div>
				<div className="export-clip-list" aria-label="Export clips">
					{project.clips.length === 0 ? (
						<span className="muted-copy">Create a clip before exporting.</span>
					) : project.clips.map((clip) => (
						<label className="export-clip-option" key={clip.id}>
							<input
								type="checkbox"
								aria-label={`Export clip ${clip.name}`}
								checked={selectedClipIds.includes(clip.id)}
								onChange={() => onChange(toggleExportClip(project, selection, clip.id))}
							/>
							<span>{clip.name}</span>
						</label>
					))}
				</div>
					<p className="muted-copy export-selection-count" aria-live="polite">
						{selectedClipIds.length} of {project.clips.length} clips selected{allClipsSelected ? ' · all clips' : ''}.
					</p>
					<section className="export-diagnostics" aria-label="Export diagnostics">
						<div className="export-diagnostics-heading">
							<span className="field-label">Preflight</span>
							<strong>{preflight.diagnostics.length === 0 ? 'Ready' : `${preflight.diagnostics.length} issue${preflight.diagnostics.length === 1 ? '' : 's'}`}</strong>
						</div>
						{preflight.diagnostics.length > 0 && (
							<ul>
								{preflight.diagnostics.map((item, index) => (
									<li className={`export-diagnostic-${item.severity}`} key={`${item.code}:${item.path}:${index}`}>
										<code>{item.code}</code>
										<span>{item.message}</span>
									</li>
								))}
							</ul>
						)}
						<p className="muted-copy">Estimated peak memory: {formatByteCount(preflight.memory.totalBytes)}.</p>
					</section>
					<p className="muted-copy export-status">Rendering and download controls will appear after the export pipeline is connected.</p>
			</section>
		</div>
	);
};

const ShortcutReference = function ShortcutReference({ onClose }: Readonly<{ onClose: () => void }>): ReactElement {
	const shortcuts: readonly Readonly<{ keys: string; action: string }>[] = [
		{ keys: 'Ctrl/Cmd + Z', action: 'Undo' },
		{ keys: 'Ctrl/Cmd + Shift + Z', action: 'Redo' },
		{ keys: 'Ctrl/Cmd + Y', action: 'Redo' },
		{ keys: 'Space', action: 'Play or pause the active clip' },
		{ keys: '← / →', action: 'Step the active clip by one frame' },
		{ keys: '?', action: 'Open this reference' }
	];

	return (
		<div className="shortcut-panel-overlay">
			<section className="shortcut-panel" aria-label="Keyboard shortcuts">
				<div className="panel-heading">
					<div>
						<p className="eyebrow">Reference</p>
						<h2>Keyboard shortcuts</h2>
					</div>
					<button className="quiet-button" type="button" aria-label="Close keyboard shortcuts" onClick={onClose}>Close</button>
				</div>
				<dl className="shortcut-list">
					{shortcuts.map((shortcut) => (
						<div key={shortcut.keys}>
							<dt><kbd>{shortcut.keys}</kbd></dt>
							<dd>{shortcut.action}</dd>
						</div>
					))}
				</dl>
				<p className="muted-copy shortcut-note">Shortcuts are inactive while typing in a form field.</p>
			</section>
		</div>
	);
};

const ValidationDiagnostics = function ValidationDiagnostics({ diagnostics }: Readonly<{ diagnostics: readonly ValidationDiagnostic[] }>): ReactElement | null {
	if (diagnostics.length === 0) {
		return null;
	}

	const visibleDiagnostics = diagnostics.slice(0, 8);

	return (
		<section className="diagnostics-panel" aria-label="Project diagnostics" role="alert">
			<div className="diagnostics-heading">
				<div>
					<p className="eyebrow">Validation</p>
					<h2>Project diagnostics</h2>
				</div>
				<span className="diagnostics-count">{diagnostics.length} issue{diagnostics.length === 1 ? '' : 's'}</span>
			</div>
			<ul className="diagnostics-list">
				{visibleDiagnostics.map((item) => (
					<li key={`${item.code}:${item.path}:${item.message}`}>
						<code>{item.code}</code>
						<span>{item.path}: {item.message}</span>
					</li>
				))}
			</ul>
			{diagnostics.length > visibleDiagnostics.length && (
				<p className="muted-copy diagnostics-overflow">Showing the first {visibleDiagnostics.length} issues.</p>
			)}
		</section>
	);
};

const CanvasWarnings = function CanvasWarnings({ warnings }: Readonly<{ warnings: readonly CanvasWarning[] }>): ReactElement | null {
	if (warnings.length === 0) {
		return null;
	}

	return (
		<div className="canvas-warning-panel" role="status" aria-label="Canvas overflow warnings">
			<div className="canvas-warning-heading">
				<span>Canvas bounds</span>
				<strong>{warnings.length} warning{warnings.length === 1 ? '' : 's'}</strong>
			</div>
			<ul>
				{warnings.map((warning) => <li key={`${warning.attachmentId}:${warning.code}`}>{warning.message}</li>)}
			</ul>
			<p>Fixed-canvas export clips content outside the logical canvas.</p>
		</div>
	);
};

const EditorShell = function EditorShell({ startup }: Readonly<{ startup: ReadyStartup }>): ReactElement {
	const [mode, setMode] = useState<EditorMode>('setup');
	const [history, setHistory] = useState<HistoryState>(() => createHistory(startup.project));
	const [persistenceError, setPersistenceError] = useState<string | undefined>(undefined);
	const [commandError, setCommandError] = useState<string | undefined>(undefined);
	const [assetError, setAssetError] = useState<string | undefined>(undefined);
	const [selection, setSelection] = useState<Selection>(createSelection);
	const [transformTool, setTransformTool] = useState<TransformTool>('translate');
	const [gridSettings, setGridSettings] = useState<GridSettings>(() => ({ ...DEFAULT_GRID_SETTINGS }));
	const [gridSpacingInput, setGridSpacingInput] = useState(String(DEFAULT_GRID_SETTINGS.spacing));
	const [activeClipId, setActiveClipId] = useState<EntityId | undefined>(undefined);
	const [autoKey, setAutoKey] = useState(true);
	const [pendingAnimationEdits, setPendingAnimationEdits] = useState<readonly PendingAnimationEdit[]>([]);
	const [playback, setPlayback] = useState<Readonly<{ clipId: EntityId; state: PlaybackState }> | undefined>(undefined);
	const [boneDropPreview, setBoneDropPreview] = useState<Readonly<{ boneId: EntityId; zone: BoneDropZone }> | undefined>(undefined);
	const [assetSlotDropPreview, setAssetSlotDropPreview] = useState<EntityId | undefined>(undefined);
	const [slotOrderDropPreview, setSlotOrderDropPreview] = useState<Readonly<{ slotId: EntityId; zone: SlotDropZone }> | undefined>(undefined);
	const [exportPanelOpen, setExportPanelOpen] = useState(false);
	const [exportSelection, setExportSelection] = useState<ExportClipSelection>({ mode: 'combined', clipIds: [] });
	const [shortcutPanelOpen, setShortcutPanelOpen] = useState(false);
	const [storageReport, setStorageReport] = useState<StorageReport | undefined>(undefined);
	const transformSessionRef = useRef<Readonly<{ gesture: TransformGesture; history: HistoryState }> | undefined>(undefined);
	const [isImporting, setIsImporting] = useState(false);
	const [assetQuery, setAssetQuery] = useState('');
	const [assetBlobs, setAssetBlobs] = useState<ProjectAssetBlobs>(startup.assets);
	const autosave = useMemo(() => createAutosaveScheduler(startup.repository, {
		onError: (error) => setPersistenceError(error.message)
	}), [startup.repository]);
	const project = currentProject(history);
	const projectDiagnostics = validateProject(project);
	const canvasWarnings = canvasWarningsForSetup(project);
	const requiredStorageBytes = Array.from(assetBlobs.values()).reduce((total, blob) => total + blob.size, 0);
	const activeClip = project.clips.find((clip) => clip.id === activeClipId) ?? project.clips[0];
	const activePlayback = activeClip && playback?.clipId === activeClip.id
		? playback.state
		: createPlaybackState();
	const playbackRef = useRef<Readonly<{ clipId: EntityId; state: PlaybackState }> | undefined>(undefined);
	playbackRef.current = playback;
	const orderedBones = project.boneOrder.flatMap((boneId) => project.bones.filter((bone) => bone.id === boneId));
	const libraryEntries = buildAssetLibraryEntries(project.assets, assetQuery);
	const openExportPanel = function openExportPanel(): void {
		setExportSelection((current) => current.clipIds.length === 0
			? createExportClipSelection(project, current.mode)
			: { ...current, clipIds: normalizeExportClipIds(project, current.clipIds) });
		setExportPanelOpen(true);
	};
	const loadExampleProject = function loadExampleProject(): void {
		const hasContent = project.assets.length > 0
			|| project.bones.length > 0
			|| project.slots.length > 0
			|| project.attachments.length > 0
			|| project.clips.length > 0;

		if (hasContent && !window.confirm('Replace the current project with the built-in example?')) {
			return;
		}

		const nextAssets = createExampleAssetBlobs();

		setHistory(createHistory(exampleProject));
		setAssetBlobs(nextAssets);
		setSelection(createSelection());
		setActiveClipId(exampleProject.clips[0]?.id);
		setPlayback(undefined);
		setPendingAnimationEdits([]);
		setExportSelection(createExportClipSelection(exampleProject));
		setCommandError(undefined);
		setPersistenceError(undefined);
		setAssetError(undefined);
		autosave.schedule(exampleProject, blobsForProject(exampleProject, nextAssets));
	};

	useEffect(() => {
		return function cleanup(): void {
			autosave.cancel();
		};
	}, [autosave]);

	useEffect(() => {
		const lifecycle = { cancelled: false };

		void estimateStorage().then((result) => {
			if (lifecycle.cancelled || !result.ok) {
				return;
			}

			setStorageReport(result.value);
		});

		return function cleanup(): void {
			lifecycle.cancelled = true;
		};
	}, []);

	useEffect(() => {
		const clip = activeClip;

		if (!clip || !activePlayback.playing) {
			return function cleanup(): void {};
		}

		const lastTimestampRef = { current: undefined as number | undefined };
		const animationFrameRef = { current: undefined as number | undefined };
		const tick = function tick(timestamp: number): void {
			const previousTimestamp = lastTimestampRef.current ?? timestamp;
			lastTimestampRef.current = timestamp;
			const current = playbackRef.current;

			if (!current || current.clipId !== clip.id || !current.state.playing) {
				return;
			}

			const nextState = advancePlayback(current.state, clip, (timestamp - previousTimestamp) / 1000);
			const next = { clipId: clip.id, state: nextState };

			playbackRef.current = next;
			setPlayback(next);

			if (nextState.playing) {
				animationFrameRef.current = requestAnimationFrame(tick);
			}
		};

		animationFrameRef.current = requestAnimationFrame(tick);

		return function cleanup(): void {
			const animationFrame = animationFrameRef.current;

			if (animationFrame !== undefined) {
				cancelAnimationFrame(animationFrame);
			}
		};
	}, [activeClip?.durationSeconds, activeClip?.fps, activeClip?.id, activeClip?.loop, activePlayback.playing]);

	useEffect(() => {
		const isFormTarget = function isFormTarget(target: EventTarget | null): boolean {
			return target instanceof HTMLInputElement
				|| target instanceof HTMLTextAreaElement
				|| target instanceof HTMLSelectElement
				|| target instanceof HTMLElement && target.isContentEditable;
		};
		const actionHandlers: Readonly<Record<ShortcutAction, () => void>> = {
			undo: () => stepHistory(undo(history)),
			redo: () => stepHistory(redo(history)),
			'toggle-playback': () => toggleActivePlayback(),
			'step-backward': () => stepActivePlayback(-1),
			'step-forward': () => stepActivePlayback(1),
			'open-reference': () => setShortcutPanelOpen(true)
		};
		const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
			if (isFormTarget(event.target)) {
				return;
			}

			const action = shortcutActionFor(event);
			const handler = action ? actionHandlers[action] : undefined;

			if (!handler) {
				return;
			}

			event.preventDefault();
			handler();
		};

		window.addEventListener('keydown', onKeyDown);

		return function cleanup(): void {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [activeClip?.durationSeconds, activeClip?.fps, activeClip?.id, activeClip?.loop, activePlayback.frameIndex, activePlayback.playing, history, mode]);

	const commitHistory = function commitHistory(
		nextHistory: HistoryState,
		nextAssets: ProjectAssetBlobs = assetBlobs
	): void {
		setHistory(nextHistory);
		setCommandError(undefined);
		const nextProject = currentProject(nextHistory);

		if (nextProject !== project && !nextHistory.transaction) {
			setPersistenceError(undefined);
			autosave.schedule(nextProject, blobsForProject(nextProject, nextAssets));
		}
	};

	const applyCommand = function applyCommand(command: ProjectCommand): boolean {
		const result = dispatchCommand(history, command);

		if (!result.ok) {
			setCommandError(result.error.message);
			return false;
		}

		commitHistory(result.value);
		return true;
	};

	const createAnimationClip = function createAnimationClip(): void {
		const id = createEntityId();
		const created = applyCommand({
			kind: 'create-clip',
			id,
			input: { name: nextAvailableName(`clip ${project.clips.length + 1}`, project.clips.map((clip) => clip.name)) }
		});

		if (created) {
			setActiveClipId(id);
		}
	};

	const duplicateActiveClip = function duplicateActiveClip(): void {
		if (!activeClip) {
			return;
		}

		const ids = duplicateIdsForClip(activeClip);
		const duplicated = applyCommand({ kind: 'duplicate-clip', clipId: activeClip.id, ids });

		if (duplicated) {
			setActiveClipId(ids.id);
		}
	};

	const renameActiveClip = function renameActiveClip(name: string): void {
		if (activeClip) {
			applyCommand({ kind: 'rename-clip', clipId: activeClip.id, name });
		}
	};

	const deleteActiveClip = function deleteActiveClip(): void {
		if (!activeClip || !window.confirm(`Delete animation clip “${activeClip.name}” and all of its keys?`)) {
			return;
		}
		if (!applyCommand({ kind: 'delete-clip', clipId: activeClip.id })) {
			return;
		}

		setActiveClipId(project.clips.find((clip) => clip.id !== activeClip.id)?.id);
	};

	const updateActiveClipPlayback = function updateActiveClipPlayback(settings: ClipPlaybackSettings): void {
		if (activeClip) {
			applyCommand({ kind: 'update-clip-playback', clipId: activeClip.id, settings });
		}
	};

	const addAnimationEvent = function addAnimationEvent(input: EventKeyInput): EntityId | undefined {
		if (!activeClip) {
			return undefined;
		}

		const id = createEntityId();

		return applyCommand({ kind: 'add-event', id, clipId: activeClip.id, input }) ? id : undefined;
	};

	const updateAnimationEvent = function updateAnimationEvent(eventId: EntityId, input: EventKeyUpdate): void {
		if (activeClip) {
			applyCommand({ kind: 'update-event', clipId: activeClip.id, eventId, input });
		}
	};

	const moveAnimationEvent = function moveAnimationEvent(eventId: EntityId, timeSeconds: number): void {
		if (activeClip) {
			applyCommand({ kind: 'move-event', clipId: activeClip.id, eventId, timeSeconds });
		}
	};

	const deleteAnimationEvent = function deleteAnimationEvent(eventId: EntityId): void {
		if (activeClip) {
			applyCommand({ kind: 'delete-event', clipId: activeClip.id, eventId });
		}
	};

	const createAnimationTrack = function createAnimationTrack(definition: TrackDefinition): EntityId | undefined {
		if (!activeClip) {
			return undefined;
		}

		const id = createEntityId();

		return applyCommand({ kind: 'create-track', id, clipId: activeClip.id, definition }) ? id : undefined;
	};

	const deleteAnimationTrack = function deleteAnimationTrack(trackId: EntityId): void {
		if (activeClip) {
			applyCommand({ kind: 'delete-track', clipId: activeClip.id, trackId });
		}
	};

	const addAnimationKey = function addAnimationKey(trackId: EntityId, input: AnimationKeyInput): EntityId | undefined {
		if (!activeClip) {
			return undefined;
		}

		const id = createEntityId();

		if (input.kind === 'number') {
			return applyCommand({ kind: 'add-number-key', id, clipId: activeClip.id, trackId, input: input.input }) ? id : undefined;
		}
		if (input.kind === 'attachment') {
			return applyCommand({ kind: 'add-attachment-key', id, clipId: activeClip.id, trackId, input: input.input }) ? id : undefined;
		}
		if (input.kind === 'draw-order') {
			return applyCommand({ kind: 'add-draw-order-key', id, clipId: activeClip.id, trackId, input: input.input }) ? id : undefined;
		}

		return applyCommand({ kind: 'add-boolean-key', id, clipId: activeClip.id, trackId, input: input.input }) ? id : undefined;
	};

	const moveAnimationKey = function moveAnimationKey(trackId: EntityId, keyId: EntityId, frameIndex: number): void {
		if (activeClip) {
			applyCommand({ kind: 'move-key', clipId: activeClip.id, trackId, keyId, timeSeconds: frameIndex / activeClip.fps });
		}
	};

	const copyAnimationKey = function copyAnimationKey(trackId: EntityId, keyId: EntityId, frameIndex: number): EntityId | undefined {
		if (!activeClip) {
			return undefined;
		}

		const id = createEntityId();

		return applyCommand({ kind: 'copy-key', id, clipId: activeClip.id, trackId, keyId, timeSeconds: frameIndex / activeClip.fps }) ? id : undefined;
	};

	const updateAnimationInterpolation = function updateAnimationInterpolation(
		trackId: EntityId,
		keyId: EntityId,
		input: NumberKeyInterpolationInput
	): void {
		if (activeClip) {
			applyCommand({ kind: 'set-number-key-interpolation', clipId: activeClip.id, trackId, keyId, input });
		}
	};

	const updateAnimationAttachmentKey = function updateAnimationAttachmentKey(
		trackId: EntityId,
		keyId: EntityId,
		value: EntityId | null
	): void {
		if (activeClip) {
			applyCommand({ kind: 'set-attachment-key', clipId: activeClip.id, trackId, keyId, value });
		}
	};

	const updateAnimationDrawOrderKey = function updateAnimationDrawOrderKey(
		trackId: EntityId,
		keyId: EntityId,
		value: readonly EntityId[]
	): void {
		if (activeClip) {
			applyCommand({ kind: 'set-draw-order-key', clipId: activeClip.id, trackId, keyId, value });
		}
	};

	const deleteAnimationKeys = function deleteAnimationKeys(
		keys: readonly Readonly<{ trackId: EntityId; keyId: EntityId }>[]
	): void {
		if (!activeClip || keys.length === 0) {
			return;
		}

		applyCommandSequence(keys.map((key) => ({
			kind: 'delete-key' as const,
			clipId: activeClip.id,
			trackId: key.trackId,
			keyId: key.keyId
		})));
	};

	const retimeAnimationKeys = function retimeAnimationKeys(
		keys: readonly Readonly<{ trackId: EntityId; keyId: EntityId }>[],
		deltaFrames: number
	): void {
		if (!activeClip) {
			return;
		}

		const changes = keys.flatMap((selected): readonly KeyTimeChange[] => {
			const track = activeClip.tracks.find((candidate) => candidate.id === selected.trackId);
			const key = track?.keys.find((candidate) => candidate.id === selected.keyId);

			return key ? [{
				trackId: selected.trackId,
				keyId: selected.keyId,
				timeSeconds: key.timeSeconds + deltaFrames / activeClip.fps
			}] : [];
		});

		if (changes.length === keys.length) {
			applyCommand({ kind: 'retime-keys', clipId: activeClip.id, changes });
		}
	};

	const toggleActivePlayback = function toggleActivePlayback(): void {
		if (!activeClip) {
			return;
		}

		setPlayback({ clipId: activeClip.id, state: togglePlayback(activePlayback, activeClip) });
	};

	const stepActivePlayback = function stepActivePlayback(direction: PlaybackDirection): void {
		if (!activeClip) {
			return;
		}

		setPlayback({ clipId: activeClip.id, state: stepPlayback(activePlayback, activeClip, direction) });
	};

	const seekActivePlayback = function seekActivePlayback(frameIndex: number): void {
		if (!activeClip) {
			return;
		}

		setPlayback({ clipId: activeClip.id, state: seekPlayback(activePlayback, activeClip, frameIndex) });
	};

	const addImportedImages = function addImportedImages(result: AssetImportResult): void {
		if (!result.ok) {
			setAssetError(result.error);
			return;
		}

		const candidates = result.value.map((image) => {
			const id = createEntityId();

			return {
				id,
				asset: {
					name: image.name,
					relativePath: image.relativePath,
					mimeType: image.mimeType,
					width: image.width,
					height: image.height
				},
				blob: blobForImage(image)
			};
		});
		const nextProject = dispatchCommand(history, {
			kind: 'add-image-assets',
			assets: candidates.map(({ id, asset }) => ({ id, asset }))
		});

		if (!nextProject.ok) {
			setCommandError(nextProject.error.message);
			return;
		}

		const nextAssets = new Map([
			...assetBlobs,
			...candidates.map(({ id, blob }) => [id, blob] as const)
		]);

		setAssetBlobs(nextAssets);
		setAssetError(undefined);
		commitHistory(nextProject.value, nextAssets);
	};

	const importDirectory = async function importDirectory(): Promise<void> {
		setIsImporting(true);
		setAssetError(undefined);

		try {
			addImportedImages(await pickImageDirectory());
		} catch (error: unknown) {
			setAssetError(errorMessage(error));
		} finally {
			setIsImporting(false);
		}
	};

	const dragOverLibrary = function dragOverLibrary(event: DragEvent<HTMLElement>): void {
		event.preventDefault();
	};

	const dragAsset = function dragAsset(event: DragEvent<HTMLElement>, assetId: string): void {
		event.dataTransfer.effectAllowed = 'copy';
		event.dataTransfer.setData(ASSET_DRAG_MIME, assetId);
	};

	const dropOnLibrary = function dropOnLibrary(event: DragEvent<HTMLElement>): void {
		event.preventDefault();

		if (isImporting) {
			return;
		}

		const items: readonly AssetDropItem[] = Array.from(event.dataTransfer.items).map((item) => ({
			getAsFile: () => item.getAsFile(),
			getAsFileSystemHandle: () => item.getAsFileSystemHandle?.() ?? Promise.resolve(null)
		}));

		setIsImporting(true);
		setAssetError(undefined);
		void importDroppedItems(items)
			.then(addImportedImages)
			.catch((error: unknown) => setAssetError(errorMessage(error)))
			.finally(() => setIsImporting(false));
	};

	const createRootBone = function createRootBone(): void {
		applyCommand({
			kind: 'create-bone',
			id: createEntityId(),
			input: { name: 'root', parentId: null }
		});
	};

	const stepHistory = function stepHistory(nextHistory: HistoryState): void {
		commitHistory(nextHistory);
	};

	const updateGridSpacing = function updateGridSpacing(value: string): void {
		setGridSpacingInput(value);
		const spacing = Number(value);

		if (Number.isFinite(spacing) && spacing > 0) {
			setGridSettings((current) => ({ ...current, spacing }));
		}
	};

	const commitGridSpacingInput = function commitGridSpacingInput(): void {
		setGridSpacingInput(String(gridSettings.spacing));
	};

	const applyCommandSequence = function applyCommandSequence(
		commands: readonly ProjectCommand[],
		nextAssets: ProjectAssetBlobs = assetBlobs
	): boolean {
		const started = beginTransaction(history);
		const result = commands.reduce<OperationResult<HistoryState>>(
			(current, command) => current.ok ? dispatchCommand(current.value, command) : current,
			{ ok: true, value: started }
		);

		if (!result.ok) {
			setCommandError(result.error.message);
			return false;
		}

		commitHistory(commitTransaction(result.value), nextAssets);
		return true;
	};

	const dropAssetOnCanvas = function dropAssetOnCanvas(assetId: string, point: ViewportPoint): void {
		const asset = project.assets.find((candidate) => candidate.id === assetId);
		const root = project.bones.find((bone) => bone.parentId === null);

		if (!asset) {
			setAssetError('The dragged image is no longer in this project.');
			return;
		}

		const localPoint = root
			? localPointForBone(evaluateBoneWorldMatrices(project), root.id, point)
			: point;

		if (!localPoint) {
			setAssetError('The root bone transform cannot receive an image at that position.');
			return;
		}

		const rootId: EntityId = root?.id ?? createEntityId();
		const slotId = createEntityId();
		const attachmentId = createEntityId();
		const commands: readonly ProjectCommand[] = [
			...(root ? [] : [{ kind: 'create-bone' as const, id: rootId, input: { name: 'root', parentId: null } }]),
			{
				kind: 'create-slot' as const,
				id: slotId,
				input: { name: asset.name, boneId: rootId }
			},
			{
				kind: 'create-image-attachment' as const,
				id: attachmentId,
				input: {
					name: asset.name,
					slotId,
					assetId,
					transform: { ...DEFAULT_LOCAL_TRANSFORM, x: localPoint.x, y: localPoint.y }
				}
			},
			{ kind: 'assign-slot-attachment' as const, slotId, attachmentId }
		];

		setAssetError(undefined);
		applyCommandSequence(commands);
	};

	const dragOverSlot = function dragOverSlot(event: DragEvent<HTMLElement>, slotId: EntityId): void {
		if (!event.dataTransfer.types.includes(ASSET_DRAG_MIME)) {
			return;
		}

		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
		setAssetSlotDropPreview(slotId);
	};

	const dropAssetOnSlot = function dropAssetOnSlot(event: DragEvent<HTMLElement>, slotId: EntityId): void {
		event.preventDefault();
		setAssetSlotDropPreview(undefined);
		const assetId = event.dataTransfer.getData(ASSET_DRAG_MIME);
		const asset = project.assets.find((candidate) => candidate.id === assetId);

		if (!asset) {
			setAssetError('The dragged image is no longer in this project.');
			return;
		}

		const currentAttachment = project.attachments.find((attachment) => attachment.id === project.slots.find((slot) => slot.id === slotId)?.setupAttachmentId);
		const attachmentId = createEntityId();
		const commands: readonly ProjectCommand[] = [
			{
				kind: 'create-image-attachment',
				id: attachmentId,
				input: {
					name: asset.name,
					slotId,
					assetId,
					transform: currentAttachment?.kind === 'image' ? currentAttachment.transform : DEFAULT_LOCAL_TRANSFORM,
					opacity: currentAttachment?.kind === 'image' ? currentAttachment.opacity : 1,
					pivotX: currentAttachment?.kind === 'image' ? currentAttachment.pivotX : 0.5,
					pivotY: currentAttachment?.kind === 'image' ? currentAttachment.pivotY : 0.5
				}
			},
			{ kind: 'assign-slot-attachment', slotId, attachmentId }
		];

		if (applyCommandSequence(commands)) {
			setSelection([{ kind: 'attachment', id: attachmentId }]);
		}
	};

	const dragSlot = function dragSlot(event: DragEvent<HTMLElement>, slotId: EntityId): void {
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(SLOT_DRAG_MIME, slotId);
	};

	const dragOverSlotOrder = function dragOverSlotOrder(event: DragEvent<HTMLElement>, slotId: EntityId): void {
		if (!event.dataTransfer.types.includes(SLOT_DRAG_MIME)) {
			return;
		}

		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		const bounds = event.currentTarget.getBoundingClientRect();

		setSlotOrderDropPreview({
			slotId,
			zone: slotDropZoneForClientY(bounds.top, bounds.height, event.clientY)
		});
	};

	const dropSlotOrder = function dropSlotOrder(event: DragEvent<HTMLElement>, targetId: EntityId): void {
		event.preventDefault();
		setSlotOrderDropPreview(undefined);
		const sourceId = event.dataTransfer.getData(SLOT_DRAG_MIME);

		if (!sourceId) {
			return;
		}

		const bounds = event.currentTarget.getBoundingClientRect();
		const zone = slotDropZoneForClientY(bounds.top, bounds.height, event.clientY);
		const commands = slotDropCommands(project, sourceId, targetId, zone);

		if (!commands) {
			setCommandError('That slot drop could not update setup draw order.');
			return;
		}

		applyCommandSequence(commands);
	};

	const updateSlotAttachment = function updateSlotAttachment(slotId: EntityId, attachmentId: EntityId | null): void {
		applyCommand({ kind: 'assign-slot-attachment', slotId, attachmentId });
	};

	const updateSelection = function updateSelection(entity: SelectableEntity, additive: boolean): void {
		setSelection((current) => selectEntity(current, entity, additive));
	};

	const selectCanvasPoint = function selectCanvasPoint(point: ViewportPoint, additive: boolean): void {
		const hit = hitTestProject(project, point);

		if (hit) {
			updateSelection(hit, additive);
			return;
		}

		if (!additive) {
			setSelection(createSelection());
		}
	};

	const selectCanvasMarquee = function selectCanvasMarquee(bounds: Readonly<{ x: number; y: number; w: number; h: number }>, additive: boolean): void {
		setSelection((current) => selectEntities(current, entitiesInBounds(project, bounds), additive));
	};

	const dragBone = function dragBone(event: DragEvent<HTMLElement>, boneId: EntityId): void {
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData(BONE_DRAG_MIME, boneId);
	};

	const dragOverBone = function dragOverBone(event: DragEvent<HTMLElement>, boneId: EntityId): void {
		if (!event.dataTransfer.types.includes(BONE_DRAG_MIME)) {
			return;
		}

		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		const bounds = event.currentTarget.getBoundingClientRect();

		setBoneDropPreview({
			boneId,
			zone: dropZoneForClientY(bounds.top, bounds.height, event.clientY)
		});
	};

	const dropBone = function dropBone(event: DragEvent<HTMLElement>, targetId: EntityId): void {
		event.preventDefault();
		setBoneDropPreview(undefined);
		const sourceId = event.dataTransfer.getData(BONE_DRAG_MIME);

		if (!sourceId) {
			return;
		}

		const bounds = event.currentTarget.getBoundingClientRect();
		const zone = dropZoneForClientY(bounds.top, bounds.height, event.clientY);
		const commands = boneDropCommands(project, sourceId, targetId, zone);

		if (!commands) {
			setCommandError('That bone drop would create an invalid hierarchy.');
			return;
		}

		applyCommandSequence(commands);
	};

	const selectedEntity = selection.at(-1);
	const selectedName = selectedEntity
		? project.assets.find((asset) => asset.id === selectedEntity.id)?.name
			?? project.bones.find((bone) => bone.id === selectedEntity.id)?.name
			?? project.slots.find((slot) => slot.id === selectedEntity.id)?.name
			?? project.attachments.find((attachment) => attachment.id === selectedEntity.id)?.name
		: undefined;
	const selectedBone = selectedEntity?.kind === 'bone'
		? project.bones.find((bone) => bone.id === selectedEntity.id)
		: undefined;
	const selectedSlot = selectedEntity?.kind === 'slot'
		? project.slots.find((slot) => slot.id === selectedEntity.id)
		: undefined;
	const selectedAttachment = selectedEntity?.kind === 'attachment'
		? project.attachments.find((attachment) => attachment.id === selectedEntity.id)
		: undefined;
	const selectedTransform = selectedBone?.transform ?? selectedAttachment?.transform;
	const renameInputRef = useRef<HTMLInputElement>(null);
	const animationFieldLabel = function animationFieldLabel(
		label: string,
		targetId: EntityId,
		property: PendingAnimationProperty
	): ReactElement {
		const state = mode === 'animate' ? animationKeyState(project, activeClip, targetId, property, activePlayback.frameIndex, pendingAnimationEdits) : undefined;

		return (
			<span className={state ? `field-label key-state key-state-${state}` : 'field-label'}>
				<span>{label}</span>
				{state && <small>{keyStateLabels[state]}</small>}
			</span>
		);
	};

	const beginCanvasTransform = function beginCanvasTransform(point: ViewportPoint, tool: TransformTool): boolean {
		const transformableSelection = selection.filter((entity) => entity.kind === 'bone' || entity.kind === 'attachment');
		const hit = hitTestProject(project, point);
		const selectedEntityHit = !!hit && transformableSelection.some((entity) => entity.kind === hit.kind && entity.id === hit.id);
		const handleHit = transformableSelection.length > 0 && isTransformHandleHit(project, transformableSelection, point, tool);

		if (transformableSelection.length === 0 || (!selectedEntityHit && !handleHit)) {
			return false;
		}

		const gesture = createTransformGesture(project, transformableSelection, point, tool);

		if (!gesture) {
			return false;
		}

		const started = beginTransaction(history);
		transformSessionRef.current = { gesture, history: started };
		setHistory(started);
		return true;
	};

	const updateCanvasTransform = function updateCanvasTransform(point: ViewportPoint, phase: TransformPhase): void {
		const session = transformSessionRef.current;

		if (!session) {
			return;
		}
		if (phase === 'cancel') {
			transformSessionRef.current = undefined;
			setHistory(cancelTransaction(session.history));
			return;
		}
		if (phase === 'end') {
			transformSessionRef.current = undefined;
			commitHistory(commitTransaction(session.history));
			return;
		}

		const commands = transformGestureCommands(session.gesture, point);

		if (!commands) {
			return;
		}

		const result = commands.reduce<OperationResult<HistoryState>>(
			(current, command) => current.ok ? dispatchCommand(current.value, command) : current,
			{ ok: true, value: session.history }
		);

		if (!result.ok) {
			setCommandError(result.error.message);
			return;
		}

		transformSessionRef.current = { ...session, history: result.value };
		setHistory(result.value);
	};

	const addChildBone = function addChildBone(): void {
		if (!selectedBone) {
			setCommandError('Select a bone before adding a child bone.');
			return;
		}

		const id = createEntityId();
		const added = applyCommand({
			kind: 'create-bone',
			id,
			input: { name: nextAvailableName('bone', project.bones.map((bone) => bone.name)), parentId: selectedBone.id }
		});

		if (added) {
			setSelection([{ kind: 'bone', id }]);
		}
	};

	const addSlot = function addSlot(): void {
		if (!selectedBone) {
			setCommandError('Select a bone before adding a slot.');
			return;
		}

		const id = createEntityId();
		const added = applyCommand({
			kind: 'create-slot',
			id,
			input: { name: nextAvailableName('slot', project.slots.map((slot) => slot.name)), boneId: selectedBone.id }
		});

		if (added) {
			setSelection([{ kind: 'slot', id }]);
		}
	};

	const addPointAttachment = function addPointAttachment(): void {
		if (!selectedBone) {
			setCommandError('Select a bone before adding a point attachment.');
			return;
		}

		const id = createEntityId();
		const added = applyCommand({
			kind: 'create-point-attachment',
			id,
			input: { name: nextAvailableName('point', project.attachments.map((attachment) => attachment.name)), boneId: selectedBone.id }
		});

		if (added) {
			setSelection([{ kind: 'attachment', id }]);
		}
	};

	const addRectangleAttachment = function addRectangleAttachment(): void {
		if (!selectedBone) {
			setCommandError('Select a bone before adding a rectangle attachment.');
			return;
		}

		const id = createEntityId();
		const added = applyCommand({
			kind: 'create-rectangle-attachment',
			id,
			input: {
				name: nextAvailableName('rectangle', project.attachments.map((attachment) => attachment.name)),
				boneId: selectedBone.id,
				width: 64,
				height: 64
			}
		});

		if (added) {
			setSelection([{ kind: 'attachment', id }]);
		}
	};

	const renameSelected = function renameSelected(name: string): void {
		if (!selectedEntity || selectedEntity.kind === 'asset') {
			return;
		}

		const command = selectedEntity.kind === 'bone'
			? { kind: 'rename-bone' as const, boneId: selectedEntity.id, name }
			: selectedEntity.kind === 'slot'
				? { kind: 'rename-slot' as const, slotId: selectedEntity.id, name }
			: { kind: 'rename-attachment' as const, attachmentId: selectedEntity.id, name };

		applyCommand(command);
	};

	const deleteSelected = function deleteSelected(): void {
		if (!selectedEntity || selectedEntity.kind === 'asset') {
			return;
		}

		const commands: readonly ProjectCommand[] = selectedEntity.kind === 'bone'
			? [{ kind: 'delete-bone', boneId: selectedEntity.id }]
			: selectedEntity.kind === 'slot'
				? [{ kind: 'delete-slot', slotId: selectedEntity.id }]
				: ((): readonly ProjectCommand[] => {
				const owningSlot = project.slots.find((slot) => slot.setupAttachmentId === selectedEntity.id);

				return owningSlot
					? [
						{ kind: 'assign-slot-attachment' as const, slotId: owningSlot.id, attachmentId: null },
						{ kind: 'delete-attachment' as const, attachmentId: selectedEntity.id }
					]
					: [{ kind: 'delete-attachment' as const, attachmentId: selectedEntity.id }];
				})();
		const entityLabel = selectedEntity.kind === 'bone'
			? 'bone'
			: selectedEntity.kind === 'slot' ? 'slot' : 'attachment';

		if (!window.confirm(`Delete ${entityLabel} “${selectedName ?? selectedEntity.id}”?`)) {
			return;
		}

		if (applyCommandSequence(commands)) {
			setSelection(createSelection());
		}
	};

	const submitRename = function submitRename(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const input = renameInputRef.current;

		if (input) {
			renameSelected(input.value);
		}
	};

	const submitTransform = function submitTransform(event: FormEvent<HTMLFormElement>): void {
		event.preventDefault();
		const entity = selectedEntity;
		const currentTransform = selectedBone?.transform ?? selectedAttachment?.transform;

		if (!entity || entity.kind === 'asset' || entity.kind === 'slot' || !currentTransform) {
			return;
		}

		const data = new FormData(event.currentTarget);
		const transform = transformFromForm(data, currentTransform);

		if (!transform) {
			setCommandError('Transform fields must contain finite numbers.');
			return;
		}

		const transformCommand: ProjectCommand = entity.kind === 'bone'
			? { kind: 'update-bone-transform', boneId: entity.id, transform }
			: { kind: 'update-attachment-transform', attachmentId: entity.id, transform };
		const imageProperties = selectedAttachment?.kind === 'image'
			? imagePropertiesFromForm(data)
			: undefined;
		const rectangleSize = selectedAttachment?.kind === 'rectangle'
			? rectangleSizeFromForm(data)
			: undefined;

		if (selectedAttachment?.kind === 'image' && !imageProperties) {
			setCommandError('Opacity and pivot fields must contain finite numbers.');
			return;
		}
		if (selectedAttachment?.kind === 'rectangle' && !rectangleSize) {
			setCommandError('Rectangle dimensions must contain finite numbers.');
			return;
		}

		const imageCommand: ProjectCommand | undefined = imageProperties
			? { kind: 'update-image-properties', attachmentId: entity.id, properties: imageProperties }
			: undefined;
		const rectangleCommand: ProjectCommand | undefined = rectangleSize
			? { kind: 'update-rectangle-size', attachmentId: entity.id, ...rectangleSize }
			: undefined;
		const animationClip = mode === 'animate' ? activeClip : undefined;
		const changedTransformProperties = animationProperties.filter((property) => transform[property] !== currentTransform[property]);
		const changedImageOpacity = selectedAttachment?.kind === 'image' && imageProperties && selectedAttachment.opacity !== imageProperties.opacity;
		const changedRectangleProperties = selectedAttachment?.kind === 'rectangle' && rectangleSize
			? (['width', 'height'] as const).filter((property) => rectangleSize[property] !== selectedAttachment[property])
			: [];
		const editedProperties: readonly PendingAnimationEdit[] = [
			...changedTransformProperties.map((property) => ({ targetId: entity.id, property })),
			...(changedImageOpacity ? [{ targetId: entity.id, property: 'opacity' as const }] : []),
			...changedRectangleProperties.map((property) => ({ targetId: entity.id, property }))
		];
		const transformAutoKeys = animationClip && autoKey
			? changedTransformProperties
				.flatMap((property) => autoKeyCommandsForNumber(
					animationClip,
					entity.kind === 'bone'
						? { kind: 'bone-transform', targetId: entity.id, property }
						: { kind: 'attachment-transform', targetId: entity.id, property },
					transform[property],
					activePlayback.frameIndex / animationClip.fps
				))
			: [];
		const imageAutoKeys = animationClip && autoKey && changedImageOpacity && selectedAttachment?.kind === 'image' && imageProperties
			? autoKeyCommandsForNumber(
				animationClip,
				{ kind: 'attachment-opacity', targetId: selectedAttachment.id },
				imageProperties.opacity,
				activePlayback.frameIndex / animationClip.fps
			)
			: [];
		const rectangleAutoKeys = animationClip && autoKey && selectedAttachment?.kind === 'rectangle' && rectangleSize
			? changedRectangleProperties
				.flatMap((property) => autoKeyCommandsForNumber(
					animationClip,
					{ kind: 'rectangle-size', targetId: selectedAttachment.id, property },
					rectangleSize[property],
					activePlayback.frameIndex / animationClip.fps
				))
			: [];
		const commands: readonly ProjectCommand[] = [
			transformCommand,
			...(imageCommand ? [imageCommand] : []),
			...(rectangleCommand ? [rectangleCommand] : []),
			...transformAutoKeys,
			...imageAutoKeys,
			...rectangleAutoKeys
		];

		const committed = applyCommandSequence(commands);

		if (animationClip && committed && editedProperties.length > 0) {
			setPendingAnimationEdits((current) => {
				const retained = current.filter((pending) => !editedProperties.some((edited) => edited.targetId === pending.targetId && edited.property === pending.property));

				return autoKey ? retained : [...retained, ...editedProperties];
			});
		}
	};
	const keyPendingAnimationEdits = function keyPendingAnimationEdits(): void {
		if (!activeClip || pendingAnimationEdits.length === 0) {
			return;
		}

		const timeSeconds = activePlayback.frameIndex / activeClip.fps;
		const commands = pendingAnimationEdits.flatMap((pending) => {
			const transformProperty = animationProperties.find((property) => property === pending.property);
			const bone = project.bones.find((candidate) => candidate.id === pending.targetId);

			if (bone && transformProperty) {
				return autoKeyCommandsForNumber(activeClip, { kind: 'bone-transform', targetId: bone.id, property: transformProperty }, bone.transform[transformProperty], timeSeconds);
			}

			const attachment = project.attachments.find((candidate) => candidate.id === pending.targetId);

			if (!attachment) {
				return [];
			}
			if (transformProperty) {
				return autoKeyCommandsForNumber(activeClip, { kind: 'attachment-transform', targetId: attachment.id, property: transformProperty }, attachment.transform[transformProperty], timeSeconds);
			}
			if (attachment.kind === 'image' && pending.property === 'opacity') {
				return autoKeyCommandsForNumber(activeClip, { kind: 'attachment-opacity', targetId: attachment.id }, attachment.opacity, timeSeconds);
			}
		if (attachment.kind === 'rectangle' && (pending.property === 'width' || pending.property === 'height')) {
				return autoKeyCommandsForNumber(activeClip, { kind: 'rectangle-size', targetId: attachment.id, property: pending.property }, attachment[pending.property], timeSeconds);
			}

			return [];
		});

		if (commands.length > 0 && applyCommandSequence(commands)) {
			setPendingAnimationEdits([]);
		}
	};
	const statusMessage = commandError ?? persistenceError ?? assetError;

	return (
		<div className="app-shell">
			<header className="topbar">
				<div className="brand-lockup">
					<span className="brand-mark" aria-hidden="true">BA</span>
					<div>
						<p className="eyebrow">Bone Animation Utility</p>
						<h1>{project.name}</h1>
					</div>
				</div>
				<nav className="mode-switcher" aria-label="Editor mode">
					{(['setup', 'animate'] as const).map((nextMode) => (
						<button
							className={nextMode === mode ? 'mode-button is-active' : 'mode-button'}
							key={nextMode}
							type="button"
							onClick={() => setMode(nextMode)}
							aria-pressed={nextMode === mode}
						>
								{modeLabels[nextMode]}
							</button>
							))}
				</nav>
				<div className="toolbar-actions">
					<button className="quiet-button" type="button" disabled={!canUndo(history)} onClick={() => stepHistory(undo(history))}>Undo</button>
					<button className="quiet-button" type="button" disabled={!canRedo(history)} onClick={() => stepHistory(redo(history))}>Redo</button>
					<button className="quiet-button" type="button" onClick={loadExampleProject}>Load example</button>
					<button className="quiet-button" type="button" aria-label="Keyboard shortcuts" onClick={() => setShortcutPanelOpen(true)}>?</button>
					<button className="primary-button" type="button" disabled={project.clips.length === 0} onClick={openExportPanel}>Export</button>
				</div>
			</header>
			{exportPanelOpen && (
					<ExportControls
						project={project}
						selection={exportSelection}
						storageReport={storageReport}
						requiredStorageBytes={requiredStorageBytes}
						onChange={setExportSelection}
					onClose={() => setExportPanelOpen(false)}
				/>
			)}
			{shortcutPanelOpen && <ShortcutReference onClose={() => setShortcutPanelOpen(false)} />}

			<main className="workspace" data-mode={mode}>
				<aside className="panel library-panel" aria-label="Image library" onDragOver={dragOverLibrary} onDrop={dropOnLibrary}>
					<div className="panel-heading">
						<div>
							<p className="eyebrow">Assets</p>
							<h2>Image library</h2>
						</div>
						<button className="icon-button" type="button" aria-label="Import image directory" onClick={() => void importDirectory()} disabled={isImporting}>+</button>
					</div>
					<label className="search-field">
						<span className="sr-only">Search images</span>
						<input
							type="search"
							placeholder="Search images"
							value={assetQuery}
							onChange={(event) => setAssetQuery(event.target.value)}
							disabled={project.assets.length === 0}
						/>
					</label>
					{project.assets.length === 0 ? (
						<div className="empty-state compact-state">
							<span className="empty-glyph" aria-hidden="true">◇</span>
							<p>No images imported</p>
							<span>Drop a folder here to begin.</span>
						</div>
					) : libraryEntries.length === 0 ? (
						<div className="tree-empty">No images match “{assetQuery}”.</div>
					) : (
						<div className="asset-list" aria-label="Imported images">
							{libraryEntries.map((entry) => entry.kind === 'folder' ? (
								<div className="asset-folder-row" key={`folder:${entry.path}`} style={{ paddingLeft: `${8 + entry.depth * 12}px` }}>
									<span className="asset-glyph" aria-hidden="true">▾</span>
									<span>{entry.name}</span>
								</div>
							) : (
								<button
									className="asset-row"
									draggable
									type="button"
									key={entry.asset.id}
									onClick={(event) => updateSelection({ kind: 'asset', id: entry.asset.id }, event.metaKey || event.ctrlKey)}
									onDragStart={(event) => dragAsset(event, entry.asset.id)}
									onDragEnd={() => setAssetSlotDropPreview(undefined)}
									aria-pressed={isSelected(selection, { kind: 'asset', id: entry.asset.id })}
									style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
									title={`Drag ${entry.asset.relativePath} into the canvas`}
								>
									<span className="asset-glyph" aria-hidden="true">▧</span>
									<span>{entry.asset.name}<small>{entry.asset.relativePath}</small></span>
								</button>
							))}
						</div>
					)}
				</aside>

				<section className="viewport-panel" aria-label="Canvas viewport">
					<div className="viewport-toolbar">
						<span className="context-label">{modeLabels[mode]} mode</span>
						<span className="viewport-readout">Canvas {project.logicalCanvas.width} × {project.logicalCanvas.height}</span>
						<div className="grid-controls" aria-label="Grid controls">
							<label className="grid-toggle">
								<input
									type="checkbox"
									aria-label="Show grid"
									checked={gridSettings.visible}
									onChange={(event) => setGridSettings((current) => ({ ...current, visible: event.target.checked }))}
								/>
								<span>Grid</span>
							</label>
							<label className="grid-spacing-field">
								<span>Spacing</span>
								<input
									aria-label="Grid spacing"
									type="number"
									min="1"
									step="1"
									value={gridSpacingInput}
									onChange={(event) => updateGridSpacing(event.target.value)}
									onBlur={commitGridSpacingInput}
								/>
							</label>
							<label className="grid-toggle">
								<input
									type="checkbox"
									aria-label="Snap to grid"
									checked={gridSettings.snap}
									onChange={(event) => setGridSettings((current) => ({ ...current, snap: event.target.checked }))}
								/>
								<span>Snap</span>
							</label>
							</div>
						</div>
						<CanvasWarnings warnings={canvasWarnings} />
						<div className="viewport-stage">
						<ViewportCanvas
							project={project}
							assets={assetBlobs}
							onAssetDrop={dropAssetOnCanvas}
							onCanvasSelect={selectCanvasPoint}
							onCanvasMarquee={selectCanvasMarquee}
								selection={selection}
								transformTool={transformTool}
								gridVisible={gridSettings.visible}
								gridSpacing={gridSettings.spacing}
								snapToGrid={gridSettings.snap}
								onCanvasTransformStart={beginCanvasTransform}
							onCanvasTransform={updateCanvasTransform}
						/>
						{project.bones.length === 0 && project.assets.length === 0 && (
							<div className="canvas-placeholder" aria-label={`Empty ${project.logicalCanvas.width} by ${project.logicalCanvas.height} canvas`}>
								<span>Drop image parts here</span>
								<small>Fixed logical canvas · {project.logicalCanvas.width} × {project.logicalCanvas.height}</small>
							</div>
						)}
					</div>
				</section>

				<aside className="panel inspector-panel" aria-label="Rig hierarchy and inspector">
					<section className="panel-section">
						<div className="panel-heading">
							<div>
								<p className="eyebrow">Rig</p>
								<h2>Hierarchy</h2>
							</div>
							<button className="icon-button" type="button" aria-label="Add rig item" onClick={createRootBone} disabled={project.bones.length > 0}>+</button>
						</div>
						{project.bones.length === 0 ? (
							<div className="tree-empty">
								<p>Create a root bone to see the rig.</p>
								<button className="secondary-button" type="button" onClick={createRootBone}>Create root bone</button>
							</div>
						) : (
							<div className="bone-tree" aria-label="Bone hierarchy">
								{orderedBones.flatMap((bone) => [
									<button
										className={[
											isSelected(selection, { kind: 'bone', id: bone.id }) ? 'bone-row is-selected' : 'bone-row',
											boneDropPreview?.boneId === bone.id ? `drop-${boneDropPreview.zone}` : ''
										].filter(Boolean).join(' ')}
										draggable
										key={bone.id}
										type="button"
										data-bone-id={bone.id}
										data-parent-id={bone.parentId ?? 'root'}
										onClick={(event) => updateSelection({ kind: 'bone', id: bone.id }, event.metaKey || event.ctrlKey)}
										onDragStart={(event) => dragBone(event, bone.id)}
										onDragEnd={() => setBoneDropPreview(undefined)}
										onDragOver={(event) => dragOverBone(event, bone.id)}
										onDrop={(event) => dropBone(event, bone.id)}
										aria-pressed={isSelected(selection, { kind: 'bone', id: bone.id })}
									>
										<span className="bone-dot" aria-hidden="true" />{bone.name}
									</button>,
									...project.slots.filter((slot) => slot.boneId === bone.id).flatMap((slot) => [
										<button
											className={[
												isSelected(selection, { kind: 'slot', id: slot.id }) ? 'slot-row is-selected' : 'slot-row',
												assetSlotDropPreview === slot.id
													? 'drop-target'
													: slotOrderDropPreview?.slotId === slot.id ? `drop-order-${slotOrderDropPreview.zone}` : ''
											].filter(Boolean).join(' ')}
											draggable
											key={slot.id}
											type="button"
											data-slot-id={slot.id}
											data-draw-order-index={project.setupDrawOrder.indexOf(slot.id)}
											onClick={(event) => updateSelection({ kind: 'slot', id: slot.id }, event.metaKey || event.ctrlKey)}
											onDragStart={(event) => dragSlot(event, slot.id)}
											onDragEnd={() => {
												setAssetSlotDropPreview(undefined);
												setSlotOrderDropPreview(undefined);
											}}
											onDragOver={(event) => {
												dragOverSlot(event, slot.id);
												dragOverSlotOrder(event, slot.id);
											}}
											onDrop={(event) => event.dataTransfer.types.includes(SLOT_DRAG_MIME)
												? dropSlotOrder(event, slot.id)
												: dropAssetOnSlot(event, slot.id)}
											aria-pressed={isSelected(selection, { kind: 'slot', id: slot.id })}
										>
											<span aria-hidden="true">↳</span>{slot.name}
										</button>,
										...project.attachments.filter((attachment) => attachment.kind === 'image' && attachment.slotId === slot.id).map((attachment) => (
											<button
												className={isSelected(selection, { kind: 'attachment', id: attachment.id }) ? 'attachment-row is-selected' : 'attachment-row'}
												key={attachment.id}
												type="button"
												onClick={(event) => updateSelection({ kind: 'attachment', id: attachment.id }, event.metaKey || event.ctrlKey)}
												aria-pressed={isSelected(selection, { kind: 'attachment', id: attachment.id })}
											>
												<span aria-hidden="true">•</span>{attachment.name}
										</button>
										))
										]),
										...project.attachments.filter((attachment) => attachment.kind !== 'image' && attachment.boneId === bone.id).map((attachment) => (
											<button
												className={isSelected(selection, { kind: 'attachment', id: attachment.id }) ? 'attachment-row is-selected' : 'attachment-row'}
												key={attachment.id}
												type="button"
												onClick={(event) => updateSelection({ kind: 'attachment', id: attachment.id }, event.metaKey || event.ctrlKey)}
												aria-pressed={isSelected(selection, { kind: 'attachment', id: attachment.id })}
											>
												<span aria-hidden="true">◇</span>{attachment.name}
											</button>
										))
									])}
							</div>
							)}
					</section>
					<section className="panel-section inspector-section">
						<p className="eyebrow">Inspector</p>
						<h2>{selectedName ?? 'Nothing selected'}</h2>
						{!selectedEntity ? (
							<p className="muted-copy">Select a bone, slot, attachment, or image to edit its properties.</p>
						) : (
							<>
								<p className="muted-copy">{`${selection.length} item${selection.length === 1 ? '' : 's'} selected.`}</p>
								{selectedEntity.kind === 'asset' ? (
									<p className="muted-copy">Drag this source image into the canvas to create a part.</p>
								) : (
									<>
										<form className="inspector-form" key={`${selectedEntity.kind}:${selectedEntity.id}`} onSubmit={submitRename}>
											<label>
												<span className="field-label">Name</span>
												<input ref={renameInputRef} defaultValue={selectedName ?? ''} aria-label="Selected name" />
											</label>
											<div className="inspector-actions">
												<button className="secondary-button" type="submit">Rename</button>
												<button className="danger-button" type="button" onClick={deleteSelected}>Delete</button>
											</div>
										</form>
										{selectedTransform && (
											<form
												className="inspector-form transform-form"
														key={`${selectedEntity.kind}:${selectedEntity.id}:${selectedTransform.x}:${selectedTransform.y}:${selectedTransform.rotation}:${selectedTransform.scaleX}:${selectedTransform.scaleY}:${selectedTransform.shearX}:${selectedTransform.shearY}`}
														onSubmit={submitTransform}
												>
													<div className="transform-grid">
														<label>{animationFieldLabel('X', selectedEntity.id, 'x')}<input name="x" type="number" step="any" defaultValue={selectedTransform.x} /></label>
														<label>{animationFieldLabel('Y', selectedEntity.id, 'y')}<input name="y" type="number" step="any" defaultValue={selectedTransform.y} /></label>
														<label>{animationFieldLabel('Rotation (deg)', selectedEntity.id, 'rotation')}<input name="rotation" type="number" step="any" defaultValue={radiansToDegrees(selectedTransform.rotation)} /></label>
														<label>{animationFieldLabel('Scale X', selectedEntity.id, 'scaleX')}<input name="scaleX" type="number" step="any" defaultValue={selectedTransform.scaleX} /></label>
														<label>{animationFieldLabel('Scale Y', selectedEntity.id, 'scaleY')}<input name="scaleY" type="number" step="any" defaultValue={selectedTransform.scaleY} /></label>
														<label>{animationFieldLabel('Shear X (deg)', selectedEntity.id, 'shearX')}<input name="shearX" type="number" step="any" defaultValue={radiansToDegrees(selectedTransform.shearX)} /></label>
														<label>{animationFieldLabel('Shear Y (deg)', selectedEntity.id, 'shearY')}<input name="shearY" type="number" step="any" defaultValue={radiansToDegrees(selectedTransform.shearY)} /></label>
													</div>
													{selectedAttachment?.kind === 'image' && (
														<div className="transform-grid compact-grid">
															<label>{animationFieldLabel('Opacity', selectedAttachment.id, 'opacity')}<input name="opacity" type="number" min="0" max="1" step="0.01" defaultValue={selectedAttachment.opacity} /></label>
															<label><span className="field-label">Pivot X</span><input name="pivotX" type="number" min="0" max="1" step="0.01" defaultValue={selectedAttachment.pivotX} /></label>
															<label><span className="field-label">Pivot Y</span><input name="pivotY" type="number" min="0" max="1" step="0.01" defaultValue={selectedAttachment.pivotY} /></label>
														</div>
													)}
													{selectedAttachment?.kind === 'rectangle' && (
														<div className="transform-grid compact-grid">
															<label>{animationFieldLabel('Width', selectedAttachment.id, 'width')}<input name="width" type="number" min="0" step="any" defaultValue={selectedAttachment.width} /></label>
															<label>{animationFieldLabel('Height', selectedAttachment.id, 'height')}<input name="height" type="number" min="0" step="any" defaultValue={selectedAttachment.height} /></label>
														</div>
													)}
													<button className="secondary-button" type="submit">Apply values</button>
												</form>
											)}
										{selectedSlot && (
											<div className="inspector-form slot-assignment-form">
												<label>
													<span className="field-label">Setup image</span>
													<select
														aria-label="Setup image"
														value={selectedSlot.setupAttachmentId ?? ''}
														onChange={(event) => updateSlotAttachment(selectedSlot.id, event.target.value || null)}
													>
														<option value="">None</option>
														{project.attachments
															.filter((attachment) => attachment.kind === 'image' && attachment.slotId === selectedSlot.id)
															.map((attachment) => <option key={attachment.id} value={attachment.id}>{attachment.name}</option>)}
													</select>
												</label>
												<p className="muted-copy">Draw order {project.setupDrawOrder.indexOf(selectedSlot.id) + 1} of {project.setupDrawOrder.length}. Drag slots to reorder them.</p>
												<p className="muted-copy">Drop an image from the library onto this slot to add a setup attachment.</p>
											</div>
										)}
										<div className="transform-tools" aria-label="Transform tools">
											{(['translate', 'rotate', 'scale', 'shear'] as const).map((tool) => (
												<button
													className={transformTool === tool ? 'tool-button is-active' : 'tool-button'}
													key={tool}
													type="button"
													onClick={() => setTransformTool(tool)}
													aria-pressed={transformTool === tool}
												>
													{transformToolLabels[tool]}
												</button>
											))}
										</div>
										{selectedBone && (
											<div className="inspector-actions inspector-create-actions">
												<button className="secondary-button" type="button" onClick={addChildBone}>Add child bone</button>
												<button className="secondary-button" type="button" onClick={addSlot}>Add slot</button>
												<button className="secondary-button" type="button" onClick={addPointAttachment}>Add point</button>
												<button className="secondary-button" type="button" onClick={addRectangleAttachment}>Add rectangle</button>
											</div>
										)}
									</>
								)}
							</>
						)}
					</section>
				</aside>
			</main>

			<footer className="timeline-panel" aria-label="Animation timeline">
				{mode === 'animate' ? (
					<AnimateTimeline
						project={project}
						activeClip={activeClip}
						playback={activePlayback}
						autoKey={autoKey}
						pendingEditCount={pendingAnimationEdits.length}
						onSelectClip={setActiveClipId}
						onCreateClip={createAnimationClip}
						onDuplicateClip={duplicateActiveClip}
						onRenameClip={renameActiveClip}
						onDeleteClip={deleteActiveClip}
						onAddEvent={addAnimationEvent}
						onUpdateEvent={updateAnimationEvent}
						onMoveEvent={moveAnimationEvent}
						onDeleteEvent={deleteAnimationEvent}
						onUpdatePlayback={updateActiveClipPlayback}
						onTogglePlayback={toggleActivePlayback}
						onStepPlayback={stepActivePlayback}
						onSeekPlayback={seekActivePlayback}
						onCreateTrack={createAnimationTrack}
						onDeleteTrack={deleteAnimationTrack}
						onAddKey={addAnimationKey}
						onMoveKey={moveAnimationKey}
						onCopyKey={copyAnimationKey}
						onUpdateInterpolation={updateAnimationInterpolation}
						onUpdateAttachmentKey={updateAnimationAttachmentKey}
						onUpdateDrawOrderKey={updateAnimationDrawOrderKey}
						onDeleteKeys={deleteAnimationKeys}
						onRetimeKeys={retimeAnimationKeys}
						onAutoKeyChange={setAutoKey}
						onKeyPendingEdits={keyPendingAnimationEdits}
					/>
				) : (
					<>
						<div className="timeline-header">
							<div>
								<p className="eyebrow">Animation</p>
								<h2>Timeline</h2>
							</div>
							<span className="muted-copy">{project.clips.length === 0 ? 'No clips yet' : `${project.clips.length} clip${project.clips.length === 1 ? '' : 's'}`}</span>
						</div>
						<div className="timeline-empty">Create an animation clip when the rig is ready.</div>
					</>
				)}
				<ValidationDiagnostics diagnostics={projectDiagnostics} />
				{statusMessage && <div className="status-strip" role="status">{statusMessage}</div>}
			</footer>
		</div>
	);
};
