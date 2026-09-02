import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { DEFAULT_LOCAL_TRANSFORM, type LocalTransform } from '../domain/coordinates.ts';
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
import { createEmptyProject, type Attachment, type BoneTransformProperty, type Clip, type CubicBezier, type Interpolation, type Project, type Track } from '../domain/model.ts';
import { evaluatePose } from '../domain/pose.ts';
import { validateProject, type ValidationDiagnostic } from '../domain/validation.ts';
import { canvasWarningsForSetup, type CanvasWarning } from '../domain/canvas-warnings.ts';
import type { AttachmentKeyInput, BooleanKeyInput, DrawOrderKeyInput, DuplicateClipIds, EventKeyInput, EventKeyUpdate, NumberKeyInput, NumberKeyInterpolationInput, TrackDefinition } from '../domain/animation.ts';
import { advancePlayback, createPlaybackState, frameCountForClip, frameTimeSeconds, seekPlayback, stepPlayback, togglePlayback, type PlaybackDirection, type PlaybackState } from '../domain/playback.ts';
import { localPointForBone, evaluateBoneWorldMatrices } from '../domain/transforms.ts';
import type { OperationResult } from '../domain/operations.ts';
import { importDroppedItems, pickImageDirectory, type AssetDropItem, type AssetImportResult, type ImportedImage } from '../assets/import.ts';
import { createAutosaveScheduler, type AutosaveStatus } from '../persistence/autosave.ts';
import { estimateStorage, type StorageReport } from '../persistence/storage.ts';
import type { ProjectAssetBlobs, RecentProject } from '../persistence/repository.ts';
import { exportProjectArchive, importProjectArchive } from '../persistence/archive.ts';
import type { ReadyStartup, StartupState } from './startup.ts';
import { loadEditorStartup } from './startup.ts';
import { entitiesInBounds, hitTestProject } from './hit-testing.ts';
import { boneDropCommands, dropZoneForClientY, type BoneDropZone } from './hierarchy-dnd.ts';
import { DEFAULT_GRID_SETTINGS, type GridSettings } from './grid.ts';
import { createSelection, selectEntities, selectEntity, type SelectableEntity, type Selection } from './selection.ts';
import { slotDropCommands, slotDropZoneForClientY, type SlotDropZone } from './slot-dnd.ts';
import { availableTrackDefinitions, buildTimelineTrackRows, createTimelineViewport, frameIndexForTime, panTimeline, resetTimelineViewport, timelineFrameRange, visibleFrameCount, zoomTimeline, type TimelineViewport } from './timeline.ts';
import { createTransformGesture, isTransformHandleHit, transformGestureCommands, type TransformGesture, type TransformModifiers, type TransformPhase, type TransformTool } from './transform-gesture.ts';
import { ViewportCanvas } from './ViewportCanvas.tsx';
import type { ViewportPoint } from './viewport.ts';
import { clipIdsForProject, createExportClipSelection, normalizeExportClipIds, setExportOutputMode, toggleExportClip, type ExportClipSelection } from '../export/selection.ts';
import { createExportDiagnostics, formatByteCount } from '../export/diagnostics.ts';
import { createExampleAssetBlobs, exampleProject } from '../examples/example-project.ts';
import { shortcutActionFor, type ShortcutAction } from './shortcuts.ts';
import { nextAvailableName } from './entity-names.ts';
import { SETUP_TIMELINE_HEIGHT, clampTimelineHeight, timelineHeightBounds, timelineHeightFromKeyboard, timelineHeightFromPointer } from './timeline-layout.ts';
import { AssetBrowser, type AssetImportSummary } from './asset-browser.tsx';
import { DockSplitter } from './dock-splitter.tsx';
import { DrawOrderPanel } from './draw-order-panel.tsx';
import { DirectNameField, DirectNumericField } from './inspector-fields.tsx';
import { ProjectMenu } from './project-menu.tsx';
import { RigTreeView } from './rig-tree-view.tsx';
import { buildRigTreeViewModel, revealAncestors, selectableEntityForRigNode, type RigTreeNode } from './rig-tree.ts';
import { MenuButton, Popover, Tabs } from './ui-primitives.tsx';
import { loadUiPreferences, projectUiPreferencesFor, saveUiPreferences, updateProjectUiPreferences, type AssetDensity, type ProjectUiPreferences, type UiPreferences } from './ui-preferences.ts';
import { clampWorkspaceLayout } from './workspace-layout.ts';
import type { NumericProperty } from './property-drafts.ts';
import { autoKeyCommandsForProperty, planPropertyKeyToggle, propertyKeyState, type KeyableProperty } from './keying.ts';
import { buildGroupedTimelineRows, createTimelineClipboard, planKeyDrag, planNudgeKeys, planPasteTimelineClipboard, selectableEntityForTimelineRow, type TimelineClipboard, type TimelineKeyReference, type TimelineRow, type TimelineRowMode } from './timeline-model.ts';
import { SharedInspector, type NumberKeyChange } from './shared-inspector.tsx';
import type { InspectorContext } from './inspector-context.ts';

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

const blobFromBytes = function blobFromBytes(bytes: Uint8Array, mimeType: string): Blob {
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);

	return new Blob([buffer], { type: mimeType });
};

const formNumber = function formNumber(data: FormData, name: string): number | undefined {
	const value = data.get(name);

	if (typeof value !== 'string' || value.trim().length === 0) {
		return undefined;
	}

	const number = Number(value);

	return Number.isFinite(number) ? number : undefined;
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

const selectableEntityForId = function selectableEntityForId(
	project: Project,
	id: EntityId
): SelectableEntity | undefined {
	if (project.assets.some((asset) => asset.id === id)) {
		return { kind: 'asset', id };
	}
	if (project.bones.some((bone) => bone.id === id)) {
		return { kind: 'bone', id };
	}
	if (project.slots.some((slot) => slot.id === id)) {
		return { kind: 'slot', id };
	}

	return project.attachments.some((attachment) => attachment.id === id)
		? { kind: 'attachment', id }
		: undefined;
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

type SelectedTransformEntry = Readonly<{
	entity: Extract<SelectableEntity, { kind: 'bone' | 'attachment' }>;
	transform: LocalTransform;
}>;

type DirectPropertyTarget = Readonly<{
	entity: SelectableEntity;
	currentValue: number;
	command: ProjectCommand;
}>;

type NumericTrack = Extract<Track, {
	kind: 'bone-transform' | 'attachment-transform' | 'attachment-opacity' | 'rectangle-size';
}>;

const isNumericTrack = function isNumericTrack(track: Track): track is NumericTrack {
	return track.kind === 'bone-transform'
		|| track.kind === 'attachment-transform'
		|| track.kind === 'attachment-opacity'
		|| track.kind === 'rectangle-size';
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

type TimelineSplitterProps = Readonly<{
	height: number;
	viewportHeight: number;
	onHeightChange: (height: number) => void;
}>;

const TimelineSplitter = function TimelineSplitter({ height, viewportHeight, onHeightChange }: TimelineSplitterProps): ReactElement {
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

const AnimateTimeline = function AnimateTimeline({
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
	const [uiPreferences, setUiPreferences] = useState<UiPreferences>(loadUiPreferences);
	const [presentation, setPresentation] = useState<ProjectUiPreferences>(() => projectUiPreferencesFor(loadUiPreferences(), startup.project));
	const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
	const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
	const [history, setHistory] = useState<HistoryState>(() => createHistory(startup.project));
	const [persistenceError, setPersistenceError] = useState<string | undefined>(undefined);
	const [commandError, setCommandError] = useState<string | undefined>(undefined);
	const [assetError, setAssetError] = useState<string | undefined>(undefined);
	const [selection, setSelectionState] = useState<Selection>(createSelection);
	const [inspectorContext, setInspectorContext] = useState<InspectorContext>({ kind: 'none' });
	const initialSelectionHistory = presentation.selectionHistory.flatMap((id) => {
		const entity = selectableEntityForId(startup.project, id);

		return entity ? [[entity]] : [];
	});
	const [selectionHistory, setSelectionHistory] = useState<readonly Selection[]>(initialSelectionHistory);
	const selectionHistoryCursorRef = useRef(initialSelectionHistory.length - 1);
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
	const [recentProjects, setRecentProjects] = useState<readonly RecentProject[]>([]);
	const [rigSearch, setRigSearch] = useState('');
	const [inlineRenameId, setInlineRenameId] = useState<EntityId | undefined>(undefined);
	const [constraintStatus, setConstraintStatus] = useState<string | undefined>(undefined);
	const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus | undefined>(undefined);
	const [storageReport, setStorageReport] = useState<StorageReport | undefined>(undefined);
	const transformSessionRef = useRef<Readonly<{ gesture: TransformGesture; history: HistoryState }> | undefined>(undefined);
	const [isImporting, setIsImporting] = useState(false);
	const [assetImportSummary, setAssetImportSummary] = useState<AssetImportSummary | undefined>(undefined);
	const [assetQuery, setAssetQuery] = useState('');
	const [assetBlobs, setAssetBlobs] = useState<ProjectAssetBlobs>(startup.assets);
	const autosave = useMemo(() => createAutosaveScheduler(startup.repository, {
		onStatus: (status) => {
			setAutosaveStatus(status);

			if (status === 'saved') {
				setPersistenceError(undefined);
			}
		},
		onError: (error) => setPersistenceError(error.message)
	}), [startup.repository]);
	const project = currentProject(history);
	const hiddenEntityIds = useMemo(() => new Set(presentation.hiddenEntityIds), [presentation.hiddenEntityIds]);
	const projectDiagnostics = validateProject(project);
	const canvasWarnings = canvasWarningsForSetup(project);
	const requiredStorageBytes = Array.from(assetBlobs.values()).reduce((total, blob) => total + blob.size, 0);
	const activeClip = project.clips.find((clip) => clip.id === activeClipId) ?? project.clips[0];
	const activePlayback = activeClip && playback?.clipId === activeClip.id
		? playback.state
		: createPlaybackState();
	const boundedTimelineHeight = clampTimelineHeight(presentation.layout.timelineHeight, viewportHeight);
	const shellStyle = {
		'--timeline-height': `${mode === 'animate' ? boundedTimelineHeight : SETUP_TIMELINE_HEIGHT}px`,
		'--left-dock-width': `${presentation.layout.leftDockCollapsed ? 34 : presentation.layout.leftDockWidth}px`,
		'--right-dock-width': `${presentation.layout.rightDockCollapsed ? 34 : presentation.layout.rightDockWidth}px`
	} as CSSProperties;
	const activePose = useMemo(() => {
		if (mode !== 'animate' || !activeClip) {
			return undefined;
		}

		return evaluatePose(project, activeClip.id, frameTimeSeconds(activePlayback, activeClip)).pose;
	}, [activeClip?.durationSeconds, activeClip?.fps, activeClip?.id, activeClip?.loop, activePlayback.frameIndex, mode, project]);
	const playbackRef = useRef<Readonly<{ clipId: EntityId; state: PlaybackState }> | undefined>(undefined);
	playbackRef.current = playback;
	const updatePresentation = function updatePresentation(update: (current: ProjectUiPreferences) => ProjectUiPreferences): void {
		setPresentation(update);
	};
	const setSelection = function setSelection(nextSelection: Selection): void {
		setSelectionState(nextSelection);
		setInspectorContext(nextSelection.length > 0 ? { kind: 'entity', selection: nextSelection } : { kind: 'none' });
		const target = nextSelection.at(-1);

		if (!target || target.kind === 'asset') {
			return;
		}

		const model = buildRigTreeViewModel(project, nextSelection, new Set(presentation.rigExpandedIds));
		const expanded = new Set(revealAncestors(model, target.id, new Set(presentation.rigExpandedIds)));

		if (target.kind === 'bone') {
			expanded.add(target.id);
		}

		updatePresentation((current) => ({ ...current, rigExpandedIds: [...expanded] }));
	};
	const projectHasContent = project.assets.length > 0
		|| project.bones.length > 0
		|| project.slots.length > 0
		|| project.attachments.length > 0
		|| project.clips.length > 0;

	useEffect(() => {
		const timer = setTimeout(() => {
			setUiPreferences((current) => {
				const next = updateProjectUiPreferences(current, project.id, () => presentation);

				saveUiPreferences(next);

				return next;
			});
		}, 180);

		return function cleanup(): void {
			clearTimeout(timer);
		};
	}, [presentation, project.id]);
	const replaceProject = function replaceProject(nextProject: Project, nextAssets: ProjectAssetBlobs): void {
		setHistory(createHistory(nextProject));
		setAssetBlobs(nextAssets);
		setPresentation(projectUiPreferencesFor(uiPreferences, nextProject));
		setSelection(createSelection());
		setInspectorContext({ kind: 'none' });
		setSelectionHistory([]);
		selectionHistoryCursorRef.current = -1;
		setInlineRenameId(undefined);
		setActiveClipId(nextProject.clips[0]?.id);
		setPlayback(undefined);
		setPendingAnimationEdits([]);
		setExportSelection(createExportClipSelection(nextProject));
		setCommandError(undefined);
		setPersistenceError(undefined);
		setAssetError(undefined);
		setMode('setup');
		autosave.schedule(nextProject, blobsForProject(nextProject, nextAssets));
	};
	const openExportPanel = function openExportPanel(): void {
		setExportSelection((current) => current.clipIds.length === 0
			? createExportClipSelection(project, current.mode)
			: { ...current, clipIds: normalizeExportClipIds(project, current.clipIds) });
		setExportPanelOpen(true);
	};
	const loadExampleProject = function loadExampleProject(): void {
		if (projectHasContent && !window.confirm('Replace the current project with the built-in example?')) {
			return;
		}

		replaceProject(exampleProject, createExampleAssetBlobs());
	};
	const createNewProject = function createNewProject(): void {
		if (projectHasContent && !window.confirm('Replace the current project with a new empty project?')) {
			return;
		}

		replaceProject(createEmptyProject(), new Map());
	};
	const exportArchive = async function exportArchive(): Promise<void> {
		const bytePairs = await Promise.all(project.assets.map(async (asset): Promise<readonly [EntityId, Uint8Array] | undefined> => {
			const blob = assetBlobs.get(asset.id);

			return blob ? [asset.id, new Uint8Array(await blob.arrayBuffer())] : undefined;
		}));
		const result = await exportProjectArchive(project, new Map(bytePairs.flatMap((pair) => pair ? [pair] : [])));

		if (!result.ok) {
			setPersistenceError(result.error.message);
			return;
		}

		const url = URL.createObjectURL(blobFromBytes(result.value, 'application/zip'));
		const link = document.createElement('a');

		link.href = url;
		link.download = `${project.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'project'}.boneanim`;
		link.click();
		URL.revokeObjectURL(url);
	};
	const importArchive = async function importArchive(bytes: Uint8Array): Promise<void> {
		const result = await importProjectArchive(bytes);

		if (!result.ok) {
			setPersistenceError(result.error.message);
			return;
		}
		if (projectHasContent && !window.confirm('Replace the current project with the imported archive?')) {
			return;
		}

		const nextAssets = new Map(result.value.project.assets.flatMap((asset) => {
			const bytesForAsset = result.value.assets.get(asset.id);

			return bytesForAsset ? [[asset.id, blobFromBytes(bytesForAsset, asset.mimeType)] as const] : [];
		}));

		replaceProject(result.value.project, nextAssets);
	};
	const openRecentProjects = function openRecentProjects(): void {
		void startup.repository.listRecentProjects().then((result) => {
			if (result.ok) {
				setRecentProjects(result.value);
				return;
			}

			setPersistenceError(result.error.message);
		});
	};
	const loadRecentProject = function loadRecentProject(projectId: EntityId): void {
		const recent = recentProjects.find((candidate) => candidate.id === projectId);

		if (!recent) {
			setPersistenceError('That recent project is no longer available.');
			return;
		}

		void (recent.isRecovery ? startup.repository.loadRecovery(projectId) : startup.repository.loadProject(projectId)).then((result) => {
			if (!result.ok) {
				setPersistenceError(result.error.message);
				return;
			}
			if (!result.value) {
				setPersistenceError('The selected recent project could not be loaded.');
				return;
			}
			if (projectHasContent && !window.confirm(`Replace the current project with “${result.value.project.name}”?`)) {
				return;
			}

			replaceProject(result.value.project, result.value.assets);
		});
	};

	useEffect(() => {
		return function cleanup(): void {
			autosave.cancel();
		};
	}, [autosave]);

	useEffect(() => {
		const updateViewportHeight = function updateViewportHeight(): void {
			setViewportWidth(window.innerWidth);
			setViewportHeight(window.innerHeight);
		};

		window.addEventListener('resize', updateViewportHeight);

		return function cleanup(): void {
			window.removeEventListener('resize', updateViewportHeight);
		};
	}, []);

	useEffect(() => {
		setPresentation((current) => ({
			...current,
			layout: clampWorkspaceLayout(current.layout, { width: viewportWidth, height: viewportHeight })
		}));
	}, [viewportHeight, viewportWidth]);

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
			'open-reference': () => setShortcutPanelOpen(true),
			'rename-selection': () => {
				const selected = selection.at(-1);

				if (selected && selected.kind !== 'asset') {
					setInlineRenameId(selected.id);
					window.requestAnimationFrame(() => {
						const input = document.querySelector<HTMLInputElement>('.rig-inline-rename');

						input?.focus();
						input?.select();
					});
					return;
				}

				renameInputRef.current?.focus();
				renameInputRef.current?.select();
			},
			'delete-selection': () => deleteSelected(),
			'key-selection': () => keySelectedProperties(),
			cancel: () => {
				setExportPanelOpen(false);
				setShortcutPanelOpen(false);
				updateCanvasTransform({ x: 0, y: 0 }, 'cancel');
			},
			'select-previous': () => navigateSelectionHistory(-1),
			'select-next': () => navigateSelectionHistory(1),
			'tool-translate': () => setTransformTool('translate'),
			'tool-rotate': () => setTransformTool('rotate'),
			'tool-scale': () => setTransformTool('scale'),
			'tool-shear': () => setTransformTool('shear')
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
	}, [activeClip?.durationSeconds, activeClip?.fps, activeClip?.id, activeClip?.loop, activePlayback.frameIndex, activePlayback.playing, history, mode, selection]);

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

	const updateSharedClipPlayback = function updateSharedClipPlayback(clipId: EntityId, settings: ClipPlaybackSettings): void {
		applyCommand({ kind: 'update-clip-playback', clipId, settings });
	};

	const renameSharedClip = function renameSharedClip(clipId: EntityId, name: string): void {
		applyCommand({ kind: 'rename-clip', clipId, name });
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

	const deleteSharedTrack = function deleteSharedTrack(clipId: EntityId, trackId: EntityId): void {
		if (applyCommand({ kind: 'delete-track', clipId, trackId })) {
			setInspectorContext({ kind: 'none' });
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

	const updateSharedNumberKeys = function updateSharedNumberKeys(
		clipId: EntityId,
		changes: readonly NumberKeyChange[]
	): void {
		const clip = project.clips.find((candidate) => candidate.id === clipId);

		if (!clip || changes.length === 0) {
			return;
		}

		const entries = changes.flatMap((change) => {
			const track = clip.tracks.find((candidate) => candidate.id === change.trackId);

			if (!track || !isNumericTrack(track)) {
				return [];
			}

			const key = track.keys.find((candidate) => candidate.id === change.keyId);

			return key ? [{ change, key }] : [];
		});
		const retimeChanges = entries.flatMap(({ change, key }) => change.timeSeconds !== undefined && change.timeSeconds !== key.timeSeconds
			? [{ trackId: change.trackId, keyId: change.keyId, timeSeconds: change.timeSeconds }]
			: []);
		const valueCommands = entries.flatMap(({ change, key }) => {
			const timeSeconds = change.timeSeconds ?? key.timeSeconds;
			const value = change.value ?? key.value;

			return Object.is(timeSeconds, key.timeSeconds) && Object.is(value, key.value)
				? []
				: [{
					kind: 'set-number-key' as const,
					id: key.id,
					clipId,
					trackId: change.trackId,
					input: { timeSeconds, value, interpolation: key.interpolation, curve: key.curve }
				}];
		});
		const commands: readonly ProjectCommand[] = [
			...(retimeChanges.length > 0 ? [{ kind: 'retime-keys' as const, clipId, changes: retimeChanges }] : []),
			...valueCommands
		];

		applyCommandSequence(commands);
	};

	const updateSharedInterpolation = function updateSharedInterpolation(
		clipId: EntityId,
		changes: readonly NumberKeyChange[],
		input: NumberKeyInterpolationInput
	): void {
		const clip = project.clips.find((candidate) => candidate.id === clipId);

		if (!clip) {
			return;
		}

		const commands = changes.flatMap((change) => {
			const track = clip.tracks.find((candidate) => candidate.id === change.trackId);

			if (!track || !isNumericTrack(track)) {
				return [];
			}

			const key = track.keys.find((candidate) => candidate.id === change.keyId);

			return key
				? [{ kind: 'set-number-key-interpolation' as const, clipId, trackId: track.id, keyId: key.id, input }]
				: [];
		});

		if (commands.length > 0) {
			applyCommandSequence(commands);
		}
	};

	const updateSharedEvent = function updateSharedEvent(clipId: EntityId, eventId: EntityId, input: EventKeyUpdate): void {
		applyCommand({ kind: 'update-event', clipId, eventId, input });
	};

	const moveSharedEvent = function moveSharedEvent(clipId: EntityId, eventId: EntityId, timeSeconds: number): void {
		applyCommand({ kind: 'move-event', clipId, eventId, timeSeconds });
	};

	const deleteSharedEvent = function deleteSharedEvent(clipId: EntityId, eventId: EntityId): void {
		if (applyCommand({ kind: 'delete-event', clipId, eventId })) {
			setInspectorContext({ kind: 'none' });
		}
	};

	const updateSharedAttachmentKey = function updateSharedAttachmentKey(
		clipId: EntityId,
		trackId: EntityId,
		keyId: EntityId,
		value: EntityId | null
	): void {
		applyCommand({ kind: 'set-attachment-key', clipId, trackId, keyId, value });
	};

	const updateSharedDrawOrderKey = function updateSharedDrawOrderKey(
		clipId: EntityId,
		trackId: EntityId,
		keyId: EntityId,
		value: readonly EntityId[]
	): void {
		applyCommand({ kind: 'set-draw-order-key', clipId, trackId, keyId, value });
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

		const plan = planKeyDrag(activeClip, keys, deltaFrames, 1);

		if (!plan.ok) {
			setCommandError(plan.error);
			return;
		}
		if (plan.value.deltaFrames !== 0) {
			applyCommand({ kind: 'retime-keys', clipId: activeClip.id, changes: plan.value.changes });
		}
	};
	const pasteAnimationKeys = function pasteAnimationKeys(clipboard: TimelineClipboard): void {
		if (!activeClip) {
			setCommandError('Create or select an animation clip before pasting keys.');
			return;
		}

		const plan = planPasteTimelineClipboard(activeClip, clipboard, activePlayback.frameIndex, createEntityId, project);

		if (!plan.ok) {
			setCommandError(plan.error);
			return;
		}

		applyCommandSequence(plan.value);
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
			setAssetImportSummary(undefined);
			setAssetError(result.error);
			setPresentation((current) => ({ ...current, rightDockTab: 'assets' }));
			return;
		}

		const existingPaths = new Set(project.assets.map((asset) => asset.relativePath));
		const conflicts = result.value.flatMap((image) => existingPaths.has(image.relativePath) ? [image.relativePath] : []);
		const candidates = result.value.filter((image) => !existingPaths.has(image.relativePath)).map((image) => {
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
		const summary: AssetImportSummary = {
			imported: candidates.length,
			skipped: result.skipped ?? [],
			conflicts
		};

		setAssetImportSummary(summary);
		setPresentation((current) => ({ ...current, rightDockTab: 'assets' }));

		if (candidates.length === 0) {
			setAssetError(undefined);
			return;
		}
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
		setAssetImportSummary(undefined);

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
		setAssetImportSummary(undefined);
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
		const selectedForDrop = selection.at(-1);
		const selectedBoneId = selectedForDrop?.kind === 'bone' ? selectedForDrop.id : undefined;
		const targetBone = selectedBoneId ? project.bones.find((bone) => bone.id === selectedBoneId) : undefined;

		if (!asset) {
			setAssetError('The dragged image is no longer in this project.');
			return;
		}
		if (root && !targetBone) {
			setAssetError('Select a bone before dropping an image on the canvas.');
			return;
		}

		const localPoint = targetBone
			? localPointForBone(evaluateBoneWorldMatrices(project), targetBone.id, point)
			: point;

		if (!localPoint) {
			setAssetError('The root bone transform cannot receive an image at that position.');
			return;
		}

		const targetBoneId: EntityId = targetBone?.id ?? createEntityId();
		const slotId = createEntityId();
		const attachmentId = createEntityId();
		const commands: readonly ProjectCommand[] = [
			...(targetBone ? [] : [{ kind: 'create-bone' as const, id: targetBoneId, input: { name: 'root', parentId: null } }]),
			{
				kind: 'create-slot' as const,
				id: slotId,
				input: { name: asset.name, boneId: targetBoneId }
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

	const recordSelection = function recordSelection(nextSelection: Selection): void {
		setSelection(nextSelection);
		const latest = nextSelection.at(-1);

		if (!latest) {
			return;
		}

		const current = selectionHistory;
		const cursor = selectionHistoryCursorRef.current;
		const previous = current[cursor]?.at(-1);

		if (previous?.kind === latest.kind && previous.id === latest.id) {
			return;
		}

		const nextHistory = [...(cursor >= 0 ? current.slice(0, cursor + 1) : current), nextSelection].slice(-20);

		selectionHistoryCursorRef.current = nextHistory.length - 1;
		setSelectionHistory(nextHistory);
		updatePresentation((currentPresentation) => ({
			...currentPresentation,
			selectionHistory: nextHistory.flatMap((entry) => {
				const last = entry.at(-1);

				return last ? [last.id] : [];
			})
		}));
	};
	const setSelectionFromSurface = function setSelectionFromSurface(nextSelection: Selection): void {
		recordSelection(nextSelection);
	};
	const updateSelection = function updateSelection(entity: SelectableEntity, additive: boolean): void {
		setSelectionFromSurface(selectEntity(selection, entity, additive));
	};

	const selectCanvasPoint = function selectCanvasPoint(point: ViewportPoint, additive: boolean): void {
		const hit = hitTestProject(project, point, hiddenEntityIds);

		if (hit) {
			updateSelection(hit, additive);
			return;
		}

		if (!additive) {
			setSelectionFromSurface(createSelection());
		}
	};

	const selectCanvasMarquee = function selectCanvasMarquee(bounds: Readonly<{ x: number; y: number; w: number; h: number }>, additive: boolean): void {
		setSelectionFromSurface(selectEntities(selection, entitiesInBounds(project, bounds, hiddenEntityIds), additive));
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
	const selectedTransformEntities = selection.flatMap((entity): readonly SelectedTransformEntry[] => {
		if (entity.kind === 'bone') {
			const bone = project.bones.find((candidate) => candidate.id === entity.id);

			return bone ? [{ entity, transform: bone.transform }] : [];
		}
		if (entity.kind === 'attachment') {
			const attachment = project.attachments.find((candidate) => candidate.id === entity.id);

			return attachment ? [{ entity, transform: attachment.transform }] : [];
		}

		return [];
	});
	const selectedAttachments = selection.flatMap((entity): readonly Attachment[] => {
		if (entity.kind !== 'attachment') {
			return [];
		}

		const attachment = project.attachments.find((candidate) => candidate.id === entity.id);

		return attachment ? [attachment] : [];
	});
	const allSelectedTransformable = selection.length > 0 && selectedTransformEntities.length === selection.length;
	const allSelectedImages = selection.length > 0
		&& selectedAttachments.length === selection.length
		&& selectedAttachments.every((attachment) => attachment.kind === 'image');
	const allSelectedRectangles = selection.length > 0
		&& selectedAttachments.length === selection.length
		&& selectedAttachments.every((attachment) => attachment.kind === 'rectangle');
	const selectedTransformValue = function selectedTransformValue(property: BoneTransformProperty): number | undefined {
		return selectedTransformEntities.at(-1)?.transform[property] ?? selectedTransform?.[property];
	};
	const selectedTransformIsMixed = function selectedTransformIsMixed(property: BoneTransformProperty): boolean {
		const values = allSelectedTransformable ? selectedTransformEntities.map((entry) => entry.transform[property]) : [];

		return values.length > 1 && values.some((value) => !Object.is(value, values[0]));
	};
	const selectedAttachmentValue = function selectedAttachmentValue(property: 'opacity' | 'pivotX' | 'pivotY' | 'width' | 'height'): number | undefined {
		const attachment = selectedAttachments.at(-1);

		if (attachment?.kind === 'image' && (property === 'opacity' || property === 'pivotX' || property === 'pivotY')) {
			return attachment[property];
		}
		if (attachment?.kind === 'rectangle' && (property === 'width' || property === 'height')) {
			return attachment[property];
		}

		return undefined;
	};
	const selectedAttachmentIsMixed = function selectedAttachmentIsMixed(property: 'opacity' | 'pivotX' | 'pivotY' | 'width' | 'height'): boolean {
		const values = allSelectedImages && (property === 'opacity' || property === 'pivotX' || property === 'pivotY')
			? selectedAttachments.flatMap((attachment) => attachment.kind === 'image' ? [attachment[property]] : [])
			: allSelectedRectangles && (property === 'width' || property === 'height')
				? selectedAttachments.flatMap((attachment) => attachment.kind === 'rectangle' ? [attachment[property]] : [])
				: [];

		return values.length > 1 && values.some((value) => !Object.is(value, values[0]));
	};
	const assetDropHint = selectedSlot
		? `Drop on ${selectedSlot.name} to add an attachment. Drop on the canvas after selecting a bone to create a new slot.`
		: selectedBone
			? `Drop on the canvas to create a slot and attachment under ${selectedBone.name}. Drop on a slot to add an attachment.`
			: project.bones.length > 0
				? 'Select a bone before dropping on the canvas. Drop on a slot to add an attachment.'
				: 'Drop on the canvas to create a root bone, slot, and attachment.';
	const renameInputRef = useRef<HTMLInputElement>(null);
	const keyablePropertiesFor = function keyablePropertiesFor(entity: SelectableEntity | undefined): readonly KeyableProperty[] {
		if (!entity || entity.kind === 'asset' || entity.kind === 'slot') {
			return [];
		}
		if (entity.kind === 'bone') {
			return animationProperties;
		}

		const attachment = project.attachments.find((candidate) => candidate.id === entity.id);

		return attachment?.kind === 'image'
			? [...animationProperties, 'opacity']
			: attachment?.kind === 'rectangle'
				? [...animationProperties, 'width', 'height']
				: animationProperties;
	};
	const keyStateForProperty = function keyStateForProperty(
		entityId: EntityId,
		property: KeyableProperty
	): 'unkeyed' | 'pending' | 'keyed' | undefined {
		return mode === 'animate' && activeClip
			? propertyKeyState({
				project,
				clip: activeClip,
				targetId: entityId,
				property,
				frameIndex: activePlayback.frameIndex,
				autoKey,
				pendingEdits: pendingAnimationEdits
			})
			: undefined;
	};
	const togglePropertyKey = function togglePropertyKey(property: KeyableProperty): void {
		if (!selectedEntity || (selectedEntity.kind !== 'bone' && selectedEntity.kind !== 'attachment') || !activeClip || mode !== 'animate') {
			return;
		}

		const plan = planPropertyKeyToggle({
			project,
			clip: activeClip,
			targetId: selectedEntity.id,
			property,
			frameIndex: activePlayback.frameIndex,
			autoKey,
			pendingEdits: pendingAnimationEdits
		});

		if (plan.commands.length > 0 && applyCommandSequence(plan.commands)) {
			setPendingAnimationEdits((current) => current.filter((pending) => pending.targetId !== selectedEntity.id || pending.property !== property));
			return;
		}
		if (plan.reason) {
			setCommandError(plan.reason);
		}
	};
	const keySelectedProperties = function keySelectedProperties(): void {
		if (!selectedEntity || !activeClip || mode !== 'animate') {
			return;
		}

		const properties = keyablePropertiesFor(selectedEntity);
		const commands = properties.flatMap((property) => planPropertyKeyToggle({
			project,
			clip: activeClip,
			targetId: selectedEntity.id,
			property,
			frameIndex: activePlayback.frameIndex,
			autoKey,
			pendingEdits: pendingAnimationEdits
		}).commands);

		if (commands.length > 0 && applyCommandSequence(commands)) {
			setPendingAnimationEdits((current) => current.filter((pending) => pending.targetId !== selectedEntity.id));
		}
	};
	const commitDirectProperty = function commitDirectProperty(property: NumericProperty, value: number): string | undefined {
		if (selection.length === 0) {
			return 'Select a bone or attachment before editing properties.';
		}

		const transformProperty = animationProperties.find((candidate) => candidate === property);
		const keyableProperty: KeyableProperty | undefined = transformProperty
			?? (property === 'opacity' || property === 'width' || property === 'height' ? property : undefined);
		const targets = selection.flatMap((entity): readonly DirectPropertyTarget[] => {
			const transform = entity.kind === 'bone'
				? project.bones.find((bone) => bone.id === entity.id)?.transform
				: entity.kind === 'attachment'
					? project.attachments.find((attachment) => attachment.id === entity.id)?.transform
					: undefined;

			if (transformProperty && transform) {
				const nextTransform = { ...transform, [transformProperty]: value };
				const command: ProjectCommand = entity.kind === 'bone'
					? { kind: 'update-bone-transform', boneId: entity.id, transform: nextTransform }
					: { kind: 'update-attachment-transform', attachmentId: entity.id, transform: nextTransform };

				return [{ entity, currentValue: transform[transformProperty], command }];
			}

			const attachment = entity.kind === 'attachment'
				? project.attachments.find((candidate) => candidate.id === entity.id)
				: undefined;

			if (attachment?.kind === 'image') {
				if (property === 'opacity') {
					return [{ entity, currentValue: attachment.opacity, command: { kind: 'update-image-properties', attachmentId: attachment.id, properties: { opacity: value } } }];
				}
				if (property === 'pivotX') {
					return [{ entity, currentValue: attachment.pivotX, command: { kind: 'update-image-properties', attachmentId: attachment.id, properties: { pivotX: value } } }];
				}
				if (property === 'pivotY') {
					return [{ entity, currentValue: attachment.pivotY, command: { kind: 'update-image-properties', attachmentId: attachment.id, properties: { pivotY: value } } }];
				}
			}
			if (attachment?.kind === 'rectangle') {
				if (property === 'width') {
					return [{ entity, currentValue: attachment.width, command: { kind: 'update-rectangle-size', attachmentId: attachment.id, width: value, height: attachment.height } }];
				}
				if (property === 'height') {
					return [{ entity, currentValue: attachment.height, command: { kind: 'update-rectangle-size', attachmentId: attachment.id, width: attachment.width, height: value } }];
				}
			}

			return [];
		});

		if (targets.length !== selection.length) {
			return 'This property is not supported by every selected entity.';
		}

		const changedTargets = targets.filter((target) => !Object.is(target.currentValue, value));

		if (changedTargets.length === 0) {
			return undefined;
		}

		const animationClip = mode === 'animate' ? activeClip : undefined;
		const autoKeys = animationClip && autoKey && keyableProperty
			? changedTargets.flatMap((target) => autoKeyCommandsForProperty(project, animationClip, target.entity.id, keyableProperty, activePlayback.frameIndex, createEntityId, value))
			: [];
		const committed = applyCommandSequence([...changedTargets.map((target) => target.command), ...autoKeys]);

		if (!committed) {
			return 'The property could not be committed.';
		}

		if (animationClip && keyableProperty) {
			setPendingAnimationEdits((current) => {
				const changedIds = new Set(changedTargets.map((target) => target.entity.id));
				const retained = current.filter((pending) => !changedIds.has(pending.targetId) || pending.property !== keyableProperty);

				return autoKey ? retained : [...retained, ...changedTargets.map((target) => ({ targetId: target.entity.id, property: keyableProperty }))];
			});
		}

		return undefined;
	};
	const toggleEditorVisibility = function toggleEditorVisibility(node: RigTreeNode): void {
		if (node.kind === 'slot') {
			return;
		}

		const hidden = new Set(presentation.hiddenEntityIds);

		if (hidden.has(node.id)) {
			hidden.delete(node.id);
		} else {
			hidden.add(node.id);
		}

		updatePresentation((current) => ({ ...current, hiddenEntityIds: [...hidden] }));
	};
	const renameRigNode = function renameRigNode(node: RigTreeNode, name: string): void {
		const command: ProjectCommand = node.kind === 'bone'
			? { kind: 'rename-bone', boneId: node.id, name }
			: node.kind === 'slot'
				? { kind: 'rename-slot', slotId: node.id, name }
				: { kind: 'rename-attachment', attachmentId: node.id, name };

		if (applyCommand(command)) {
			setInlineRenameId(undefined);
		}
	};
	const navigateSelectionHistory = function navigateSelectionHistory(direction: -1 | 1): void {
		const nextIndex = selectionHistoryCursorRef.current + direction;
		const nextEntry = selectionHistory[nextIndex];

		if (!nextEntry) {
			return;
		}

		const validSelection = nextEntry.filter((entity) => entity.kind === 'asset'
			? project.assets.some((asset) => asset.id === entity.id)
			: entity.kind === 'bone'
				? project.bones.some((bone) => bone.id === entity.id)
				: entity.kind === 'slot'
					? project.slots.some((slot) => slot.id === entity.id)
					: project.attachments.some((attachment) => attachment.id === entity.id));

		if (validSelection.length === 0) {
			selectionHistoryCursorRef.current = nextIndex;
			navigateSelectionHistory(direction);
			return;
		}

		selectionHistoryCursorRef.current = nextIndex;
		setSelection(validSelection);
		const model = buildRigTreeViewModel(project, validSelection, new Set(presentation.rigExpandedIds));
		const target = validSelection.at(-1);

		if (target && target.kind !== 'asset') {
			const expanded = revealAncestors(model, target.id, new Set(presentation.rigExpandedIds));

			updatePresentation((current) => ({ ...current, rigExpandedIds: [...expanded] }));
			window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-rig-row-id="${target.id}"]`)?.scrollIntoView({ block: 'nearest' }));
		}
	};
	const currentDrawOrder = function currentDrawOrder(): readonly EntityId[] {
		const track = activeClip?.tracks.find((candidate) => candidate.kind === 'slot-draw-order');
		const key = track?.kind === 'slot-draw-order' && activeClip
			? track.keys.find((candidate) => frameIndexForTime(activeClip, candidate.timeSeconds) === activePlayback.frameIndex)
			: undefined;

		return key?.value ?? project.setupDrawOrder;
	};
	const reorderedDrawOrder = function reorderedDrawOrder(order: readonly EntityId[], slotId: EntityId, targetIndex: number): readonly EntityId[] {
		const without = order.filter((id) => id !== slotId);
		const boundedIndex = Math.max(0, Math.min(without.length, targetIndex));

		return [...without.slice(0, boundedIndex), slotId, ...without.slice(boundedIndex)];
	};
	const reorderDrawOrder = function reorderDrawOrder(slotId: EntityId, targetIndex: number, order: readonly EntityId[]): void {
		const nextOrder = reorderedDrawOrder(order, slotId, targetIndex);

		if (mode === 'setup' || !activeClip) {
			applyCommand({ kind: 'reorder-slot', slotId, targetIndex });
			return;
		}

		const track = activeClip.tracks.find((candidate) => candidate.kind === 'slot-draw-order');
		const key = track?.kind === 'slot-draw-order'
			? track.keys.find((candidate) => frameIndexForTime(activeClip, candidate.timeSeconds) === activePlayback.frameIndex)
			: undefined;

		if (track && key) {
			applyCommand({ kind: 'set-draw-order-key', clipId: activeClip.id, trackId: track.id, keyId: key.id, value: nextOrder });
			return;
		}

		const trackId = track?.id ?? createEntityId();
		const commands: readonly ProjectCommand[] = [
			...(track ? [] : [{ kind: 'create-track' as const, id: trackId, clipId: activeClip.id, definition: { kind: 'slot-draw-order' as const } }]),
			{ kind: 'add-draw-order-key', id: createEntityId(), clipId: activeClip.id, trackId, input: { timeSeconds: activePlayback.frameIndex / activeClip.fps, value: nextOrder } }
		];

		applyCommandSequence(commands);
	};
	const keyCurrentDrawOrder = function keyCurrentDrawOrder(): void {
		if (!activeClip) {
			return;
		}

		const order = currentDrawOrder();
		const track = activeClip.tracks.find((candidate) => candidate.kind === 'slot-draw-order');
		const key = track?.kind === 'slot-draw-order'
			? track.keys.find((candidate) => frameIndexForTime(activeClip, candidate.timeSeconds) === activePlayback.frameIndex)
			: undefined;

		if (track && key) {
			applyCommand({ kind: 'set-draw-order-key', clipId: activeClip.id, trackId: track.id, keyId: key.id, value: order });
			return;
		}

		const trackId = track?.id ?? createEntityId();
		applyCommandSequence([
			...(track ? [] : [{ kind: 'create-track' as const, id: trackId, clipId: activeClip.id, definition: { kind: 'slot-draw-order' as const } }]),
			{ kind: 'add-draw-order-key', id: createEntityId(), clipId: activeClip.id, trackId, input: { timeSeconds: activePlayback.frameIndex / activeClip.fps, value: order } }
		]);
	};
	const beginCanvasTransform = function beginCanvasTransform(point: ViewportPoint, tool: TransformTool, modifiers: TransformModifiers = {}): boolean {
		const transformableSelection = selection.filter((entity) => entity.kind === 'bone' || entity.kind === 'attachment');
		const hit = hitTestProject(project, point, hiddenEntityIds);
		const selectedEntityHit = !!hit && transformableSelection.some((entity) => entity.kind === hit.kind && entity.id === hit.id);
		const handleHit = transformableSelection.length > 0 && isTransformHandleHit(project, transformableSelection, point, tool);

		if (transformableSelection.length === 0 || (!selectedEntityHit && !handleHit)) {
			return false;
		}

		const gesture = createTransformGesture(project, transformableSelection, point, tool, modifiers);

		if (!gesture) {
			return false;
		}

		const started = beginTransaction(history);
		transformSessionRef.current = { gesture, history: started };
		setHistory(started);
		return true;
	};

	const updateCanvasTransform = function updateCanvasTransform(point: ViewportPoint, phase: TransformPhase, modifiers: TransformModifiers = {}): void {
		const session = transformSessionRef.current;

		if (!session) {
			return;
		}
		if (phase === 'cancel') {
			setConstraintStatus(undefined);
			transformSessionRef.current = undefined;
			setHistory(cancelTransaction(session.history));
			return;
		}
		if (phase === 'end') {
			transformSessionRef.current = undefined;
			setConstraintStatus(undefined);
			commitHistory(commitTransaction(session.history));
			return;
		}
		if (modifiers.shiftKey) {
			setConstraintStatus('Shift constraint active');
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

	const renameSelected = function renameSelected(name: string): string | undefined {
		if (!selectedEntity || selectedEntity.kind === 'asset') {
			return 'Select a bone, slot, or attachment before renaming.';
		}
		if (name.trim().length === 0) {
			return 'Name cannot be empty.';
		}

		const command = selectedEntity.kind === 'bone'
			? { kind: 'rename-bone' as const, boneId: selectedEntity.id, name }
			: selectedEntity.kind === 'slot'
				? { kind: 'rename-slot' as const, slotId: selectedEntity.id, name }
			: { kind: 'rename-attachment' as const, attachmentId: selectedEntity.id, name };

		return applyCommand(command) ? undefined : 'The name could not be committed.';
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
		<div className="app-shell" style={shellStyle}>
			<header className="topbar">
				<div className="brand-lockup">
					<span className="brand-mark" aria-hidden="true">BA</span>
					<div>
						<p className="eyebrow">Bone Animation Utility</p>
						<div className="project-title-row"><h1>{project.name}</h1><span className="autosave-status" aria-live="polite">{autosaveStatus === 'saving' || autosaveStatus === 'scheduled' ? 'Saving…' : autosaveStatus === 'saved' ? 'Saved locally' : autosaveStatus === 'error' ? 'Save failed' : ''}</span></div>
					</div>
				</div>
				<ProjectMenu
					canvas={project.logicalCanvas}
					projectName={project.name}
					recentProjects={recentProjects}
					onExportArchive={() => void exportArchive()}
					onImportArchive={(bytes) => void importArchive(bytes)}
					onLoadExample={loadExampleProject}
					onLoadRecent={loadRecentProject}
					onNew={createNewProject}
					onOpenRecent={openRecentProjects}
					onRenameProject={(name) => applyCommand({ kind: 'rename-project', name })}
				/>
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
					<aside className={presentation.layout.leftDockCollapsed ? 'panel left-dock is-collapsed' : 'panel left-dock'} aria-label="Rig and draw order">
						<div className="panel-heading dock-heading">
							<div>
								<p className="eyebrow">Structure</p>
								<h2>{presentation.layout.leftDockCollapsed ? 'Rig' : 'Rig tools'}</h2>
							</div>
							<div className="dock-heading-actions">
								{!presentation.layout.leftDockCollapsed && <MenuButton label="Add" items={[
									{ id: 'root-bone', label: 'Root bone', description: project.bones.length > 0 ? 'A root bone already exists' : 'Create the first bone', disabled: project.bones.length > 0, onSelect: createRootBone },
									{ id: 'child-bone', label: 'Child bone', description: selectedBone ? `Under ${selectedBone.name}` : 'Select a bone first', disabled: !selectedBone, onSelect: addChildBone },
									{ id: 'slot', label: 'Slot', description: selectedBone ? `Under ${selectedBone.name}` : 'Select a bone first', disabled: !selectedBone, onSelect: addSlot },
									{ id: 'point', label: 'Point attachment', description: selectedBone ? 'Gameplay point under the selected bone' : 'Select a bone first', disabled: !selectedBone, onSelect: addPointAttachment },
									{ id: 'rectangle', label: 'Rectangle attachment', description: selectedBone ? 'Gameplay rectangle under the selected bone' : 'Select a bone first', disabled: !selectedBone, onSelect: addRectangleAttachment }
								]} />}
							<button className="icon-button" type="button" aria-label={presentation.layout.leftDockCollapsed ? 'Expand left dock' : 'Collapse left dock'} onClick={() => updatePresentation((current) => ({ ...current, layout: { ...current.layout, leftDockCollapsed: !current.layout.leftDockCollapsed } }))}>{presentation.layout.leftDockCollapsed ? '»' : '«'}</button>
							</div>
						</div>
						{!presentation.layout.leftDockCollapsed && <>
							<Tabs
								label="Left dock"
								options={[{ value: 'rig', label: 'Rig' }, { value: 'draw-order', label: 'Draw Order' }]}
								value={presentation.leftDockTab}
								onChange={(value) => updatePresentation((current) => ({ ...current, leftDockTab: value }))}
							/>
							{presentation.leftDockTab === 'rig' ? (
								<>
									<label className="search-field">
										<span className="sr-only">Search rig</span>
										<input aria-label="Search rig" type="search" placeholder="Search rig" value={rigSearch} onChange={(event) => setRigSearch(event.target.value)} />
									</label>
									{project.bones.length === 0 ? (
										<div className="tree-empty">
											<p>Create a root bone to see the rig.</p>
											<button className="secondary-button" type="button" onClick={createRootBone}>Create root bone</button>
										</div>
									) : (
										<RigTreeView
											assetSlotDropPreview={assetSlotDropPreview}
											boneDropPreview={boneDropPreview}
											expandedIds={new Set(presentation.rigExpandedIds)}
											hiddenIds={new Set(presentation.hiddenEntityIds)}
											renamingId={inlineRenameId}
											project={project}
											searchQuery={rigSearch}
											selection={selection}
											slotOrderDropPreview={slotOrderDropPreview}
											onAssetDragEnd={() => {
												setAssetSlotDropPreview(undefined);
												setSlotOrderDropPreview(undefined);
											}}
											onDragBone={dragBone}
											onDragOverBone={dragOverBone}
											onDragOverSlot={(event, slotId) => {
												dragOverSlot(event, slotId);
												dragOverSlotOrder(event, slotId);
											}}
											onDragSlot={dragSlot}
											onDropBone={dropBone}
											onDropSlot={(event, slotId) => event.dataTransfer.types.includes(SLOT_DRAG_MIME) ? dropSlotOrder(event, slotId) : dropAssetOnSlot(event, slotId)}
											onExpandedChange={(expandedIds) => updatePresentation((current) => ({ ...current, rigExpandedIds: [...expandedIds] }))}
							 onRenameRequest={(node) => {
								setSelectionFromSurface([selectableEntityForRigNode(node)]);
								setInlineRenameId(node.id);
								window.requestAnimationFrame(() => {
									const input = document.querySelector<HTMLInputElement>('.rig-inline-rename');

									input?.focus();
									input?.select();
								});
							}}
											onRenameCancel={() => setInlineRenameId(undefined)}
											onRenameCommit={renameRigNode}
											onSelectionChange={setSelectionFromSurface}
											onToggleVisibility={toggleEditorVisibility}
										/>
									)}
								</>
							) : (
								<DrawOrderPanel
									activeClip={activeClip}
									frameIndex={activePlayback.frameIndex}
									project={project}
									selection={selection}
									onKeyCurrentFrame={mode === 'animate' ? keyCurrentDrawOrder : undefined}
									onReorder={reorderDrawOrder}
									onSelectionChange={(slotId, additive) => updateSelection({ kind: 'slot', id: slotId }, additive)}
								/>
							)}
						</>}
				</aside>
				<DockSplitter dock="left" layout={presentation.layout} viewport={{ width: viewportWidth, height: viewportHeight }} onChange={(layout) => updatePresentation((current) => ({ ...current, layout }))} />

				<section className="viewport-panel" aria-label="Canvas viewport">
					<div className="viewport-toolbar">
						<span className="context-label">{modeLabels[mode]} mode</span>
						{constraintStatus && <span className="constraint-status" role="status">{constraintStatus}</span>}
						<span className="viewport-readout">Canvas {project.logicalCanvas.width} × {project.logicalCanvas.height}</span>
					</div>
					<div className="viewport-body">
						<CanvasWarnings warnings={canvasWarnings} />
						<div className="viewport-stage">
							<div className="canvas-stage-content">
								<div className="canvas-tool-toolbar" aria-label="Transform tools">
									{(['translate', 'rotate', 'scale', 'shear'] as const).map((tool) => (
										<button
											className={transformTool === tool ? 'tool-button is-active' : 'tool-button'}
											key={tool}
											type="button"
											onClick={() => setTransformTool(tool)}
											aria-pressed={transformTool === tool}
											title={transformToolLabels[tool]}
										>
											{transformToolLabels[tool]}
										</button>
									))}
									<Popover label="Grid settings" className="grid-popover">
										<div className="grid-controls" aria-label="Grid controls">
											<label className="grid-toggle">
												<input
													aria-label="Show grid"
													checked={gridSettings.visible}
													type="checkbox"
													onChange={(event) => setGridSettings((current) => ({ ...current, visible: event.target.checked }))}
												/>
												<span>Grid</span>
											</label>
											<label className="grid-spacing-field">
												<span>Spacing</span>
												<input
													aria-label="Grid spacing"
													inputMode="numeric"
													min={1}
													step={1}
													value={gridSpacingInput}
													onChange={(event) => updateGridSpacing(event.target.value)}
													onBlur={commitGridSpacingInput}
													onKeyDown={(event) => {
														if (event.key === 'Enter') {
															event.currentTarget.blur();
														}
												}}
												/>
											</label>
											<label className="grid-toggle">
												<input
													aria-label="Snap to grid"
													checked={gridSettings.snap}
													type="checkbox"
													onChange={(event) => setGridSettings((current) => ({ ...current, snap: event.target.checked }))}
												/>
												<span>Snap</span>
											</label>
										</div>
									</Popover>
								</div>
								<ViewportCanvas
									project={project}
									assets={assetBlobs}
									pose={activePose}
									onAssetDrop={dropAssetOnCanvas}
									onCanvasSelect={selectCanvasPoint}
									onCanvasMarquee={selectCanvasMarquee}
									selection={selection}
									transformTool={transformTool}
									gridVisible={gridSettings.visible}
									gridSpacing={gridSettings.spacing}
									hiddenIds={hiddenEntityIds}
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
						</div>
					</div>
				</section>

				<DockSplitter dock="right" layout={presentation.layout} viewport={{ width: viewportWidth, height: viewportHeight }} onChange={(layout) => updatePresentation((current) => ({ ...current, layout }))} />
				<aside className={presentation.layout.rightDockCollapsed ? 'panel right-dock library-panel inspector-panel is-collapsed' : 'panel right-dock library-panel inspector-panel'} data-right-tab={presentation.rightDockTab} aria-label="Properties and assets">
					<div className="right-dock-heading">
						{!presentation.layout.rightDockCollapsed && <Tabs
							label="Right dock"
							options={[{ value: 'properties', label: 'Properties' }, { value: 'assets', label: 'Assets' }]}
							value={presentation.rightDockTab}
							onChange={(value) => updatePresentation((current) => ({ ...current, rightDockTab: value }))}
						/>}
						<button className="icon-button" type="button" aria-label={presentation.layout.rightDockCollapsed ? 'Expand right dock' : 'Collapse right dock'} onClick={() => updatePresentation((current) => ({ ...current, layout: { ...current.layout, rightDockCollapsed: !current.layout.rightDockCollapsed } }))}>{presentation.layout.rightDockCollapsed ? '«' : '»'}</button>
					</div>
					{!presentation.layout.rightDockCollapsed && <>
					{presentation.rightDockTab === 'properties' && (
						<button className="secondary-button asset-import-shortcut" type="button" disabled={isImporting} onClick={() => void importDirectory()}>
							Import image directory
						</button>
					)}
					{presentation.rightDockTab === 'assets' && <AssetBrowser
										assets={assetBlobs}
										density={presentation.assetDensity}
										importMessage={assetError}
										importSummary={assetImportSummary}
										isImporting={isImporting}
										project={project}
										query={assetQuery}
										selection={selection}
										dropHint={assetDropHint}
						onDensityChange={(density: AssetDensity) => updatePresentation((current) => ({ ...current, assetDensity: density }))}
						onDragEnd={() => setAssetSlotDropPreview(undefined)}
						onDragOver={dragOverLibrary}
						onDragStart={dragAsset}
						onDrop={dropOnLibrary}
						onImport={() => void importDirectory()}
						onQueryChange={setAssetQuery}
						onSelectionChange={(assetId, additive) => updateSelection({ kind: 'asset', id: assetId }, additive)}
					/>}
					{presentation.rightDockTab === 'properties' && <SharedInspector
						context={inspectorContext}
						project={project}
						onRenameClip={renameSharedClip}
						onUpdateClipPlayback={updateSharedClipPlayback}
						onDeleteTrack={deleteSharedTrack}
						onUpdateNumberKeys={updateSharedNumberKeys}
						onUpdateInterpolation={updateSharedInterpolation}
						onUpdateEvent={updateSharedEvent}
						onMoveEvent={moveSharedEvent}
						onDeleteEvent={deleteSharedEvent}
						onUpdateAttachmentKey={updateSharedAttachmentKey}
						onUpdateDrawOrderKey={updateSharedDrawOrderKey}
					/>}
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
											<div className="inspector-form" key={`${selectedEntity.kind}:${selectedEntity.id}:${selectedName ?? ''}`}>
												<DirectNameField
													inputRef={renameInputRef}
													value={selectedName ?? ''}
													name="Selected name"
													onCommit={renameSelected}
												/>
												<div className="inspector-actions">
													<button className="danger-button" type="button" onClick={deleteSelected}>Delete</button>
												</div>
											</div>
											{selectedTransform && (
												<div
													className="inspector-form transform-form"
														key={`${selectedEntity.kind}:${selectedEntity.id}:${selectedTransform.x}:${selectedTransform.y}:${selectedTransform.rotation}:${selectedTransform.scaleX}:${selectedTransform.scaleY}:${selectedTransform.shearX}:${selectedTransform.shearY}`}
													>
								<div className="transform-grid">
									{(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const).map((property) => (
										<DirectNumericField
											ariaLabel={property === 'rotation' ? 'Rotation (deg)' : property === 'shearX' ? 'Shear X (deg)' : property === 'shearY' ? 'Shear Y (deg)' : undefined}
											frameIndex={activePlayback.frameIndex}
											key={`${property}:${selectedTransformValue(property) ?? selectedTransform[property]}`}
											keyState={keyStateForProperty(selectedEntity.id, property)}
											mixed={selectedTransformIsMixed(property)}
											onCommit={commitDirectProperty}
											onToggleKey={() => togglePropertyKey(property)}
											property={property}
											value={selectedTransformValue(property) ?? selectedTransform[property]}
										/>
									))}
								</div>
											{allSelectedImages && selectedAttachmentValue('opacity') !== undefined && (
												<div className="transform-grid compact-grid">
													<DirectNumericField frameIndex={activePlayback.frameIndex} key={`opacity:${selectedAttachmentValue('opacity')}`} keyState={keyStateForProperty(selectedEntity.id, 'opacity')} mixed={selectedAttachmentIsMixed('opacity')} onCommit={commitDirectProperty} onToggleKey={() => togglePropertyKey('opacity')} property="opacity" value={selectedAttachmentValue('opacity') ?? 0} />
													<DirectNumericField key={`pivotX:${selectedAttachmentValue('pivotX')}`} mixed={selectedAttachmentIsMixed('pivotX')} onCommit={commitDirectProperty} property="pivotX" value={selectedAttachmentValue('pivotX') ?? 0} />
													<DirectNumericField key={`pivotY:${selectedAttachmentValue('pivotY')}`} mixed={selectedAttachmentIsMixed('pivotY')} onCommit={commitDirectProperty} property="pivotY" value={selectedAttachmentValue('pivotY') ?? 0} />
												</div>
											)}
											{allSelectedRectangles && selectedAttachmentValue('width') !== undefined && selectedAttachmentValue('height') !== undefined && (
												<div className="transform-grid compact-grid">
													<DirectNumericField frameIndex={activePlayback.frameIndex} key={`width:${selectedAttachmentValue('width')}`} keyState={keyStateForProperty(selectedEntity.id, 'width')} mixed={selectedAttachmentIsMixed('width')} onCommit={commitDirectProperty} onToggleKey={() => togglePropertyKey('width')} property="width" value={selectedAttachmentValue('width') ?? 0} />
													<DirectNumericField frameIndex={activePlayback.frameIndex} key={`height:${selectedAttachmentValue('height')}`} keyState={keyStateForProperty(selectedEntity.id, 'height')} mixed={selectedAttachmentIsMixed('height')} onCommit={commitDirectProperty} onToggleKey={() => togglePropertyKey('height')} property="height" value={selectedAttachmentValue('height') ?? 0} />
												</div>
											)}
													</div>
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
					</>}
				</aside>
			</main>

			<footer className="timeline-panel" data-mode={mode} aria-label="Animation timeline">
				{mode === 'animate' && (
					<TimelineSplitter
						height={boundedTimelineHeight}
						viewportHeight={viewportHeight}
						onHeightChange={(height) => updatePresentation((current) => ({
							...current,
							layout: { ...current.layout, timelineHeight: height }
						}))}
					/>
				)}
				<div className="timeline-panel-content">
					<div className="timeline-main-content" id={mode === 'animate' && project.clips.length === 0 ? 'animation-timeline-pane' : undefined}>
						{mode === 'animate' ? (
							<AnimateTimeline
								project={project}
								activeClip={activeClip}
								playback={activePlayback}
								selection={selection}
								rowMode={presentation.timelineRowMode}
								expandedRowIds={new Set(presentation.timelineExpandedIds)}
								pinnedEntityIds={new Set(presentation.pinnedTimelineEntityIds)}
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
								onPasteKeys={pasteAnimationKeys}
								onSelectEntity={(entity, additive) => updateSelection(entity, additive)}
								onRowModeChange={(nextMode) => updatePresentation((current) => ({ ...current, timelineRowMode: nextMode }))}
								onExpandedRowIdsChange={(ids) => updatePresentation((current) => ({ ...current, timelineExpandedIds: [...ids] }))}
								onTogglePinnedEntity={(entityId) => updatePresentation((current) => ({
									...current,
									pinnedTimelineEntityIds: current.pinnedTimelineEntityIds.includes(entityId)
										? current.pinnedTimelineEntityIds.filter((id) => id !== entityId)
										: [...current.pinnedTimelineEntityIds, entityId]
								}))}
								onClearPinnedEntities={() => updatePresentation((current) => ({ ...current, pinnedTimelineEntityIds: [] }))}
								onContextChange={setInspectorContext}
								onAutoKeyChange={setAutoKey}
								onKeyPendingEdits={keyPendingAnimationEdits}
							/>
						) : (
							<div className="setup-timeline-row">
								<div>
									<p className="eyebrow">Animation</p>
									<h2>Timeline</h2>
								</div>
								<span className="muted-copy">{project.clips.length === 0 ? 'No clips yet' : `${project.clips.length} clip${project.clips.length === 1 ? '' : 's'}`}</span>
								{project.clips.length === 0 && <span className="setup-timeline-guidance">Create an animation clip in Animate mode when the rig is ready.</span>}
							</div>
						)}
					</div>
					<div className="timeline-feedback">
						<ValidationDiagnostics diagnostics={projectDiagnostics} />
						{statusMessage && <div className="status-strip" role="status">{statusMessage}</div>}
					</div>
				</div>
			</footer>
		</div>
	);
};
