import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactElement } from 'react';
import { DEFAULT_LOCAL_TRANSFORM, type LocalTransform } from '../domain/coordinates.ts';
import { createEntityId, type EntityId } from '../domain/ids.ts';
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
import { createEmptyProject, type Attachment, type BoneTransformProperty, type Clip, type Project, type Track } from '../domain/model.ts';
import { evaluatePose } from '../domain/pose.ts';
import { validateProject, type ValidationDiagnostic } from '../domain/validation.ts';
import { canvasWarningsForSetup, type CanvasWarning } from '../domain/canvas-warnings.ts';
import type { DuplicateClipIds, EventKeyInput, EventKeyUpdate, NumberKeyInterpolationInput, TrackDefinition } from '../domain/animation.ts';
import { advancePlayback, createPlaybackState, frameTimeSeconds, seekPlayback, stepPlayback, togglePlayback, type PlaybackDirection, type PlaybackState } from '../domain/playback.ts';
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
import { frameIndexForTime } from './timeline.ts';
import { createTransformGesture, isTransformHandleHit, transformGestureCommands, type TransformGesture, type TransformModifiers, type TransformPhase, type TransformTool } from './transform-gesture.ts';
import { ViewportCanvas } from './ViewportCanvas.tsx';
import type { ViewportPoint } from './viewport.ts';
import { clipIdsForProject, createExportClipSelection, normalizeExportClipIds, setExportOutputMode, toggleExportClip, type ExportClipSelection } from '../export/selection.ts';
import { createExportDiagnostics, formatByteCount } from '../export/diagnostics.ts';
import { createExampleAssetBlobs, exampleProject } from '../examples/example-project.ts';
import { shortcutActionFor, shortcutReference, type ShortcutAction } from './shortcuts.ts';
import { nextAvailableName } from './entity-names.ts';
import { SETUP_TIMELINE_HEIGHT, clampTimelineHeight } from './timeline-layout.ts';
import type { AssetImportSummary } from './asset-browser.tsx';
import { ProjectMenu } from './project-menu.tsx';
import { buildRigTreeViewModel, revealAncestors, selectableEntityForRigNode, type RigTreeNode } from './rig-tree.ts';
import { CanvasToolbar } from './canvas-toolbar.tsx';
import { loadUiPreferences, projectUiPreferencesFor, saveUiPreferences, updateProjectUiPreferences, type ProjectUiPreferences, type UiPreferences } from './ui-preferences.ts';
import { clampWorkspaceLayout } from './workspace-layout.ts';
import { numericPropertySpecs, type NumericProperty } from './property-drafts.ts';
import { autoKeyCommandsForProperty, planPropertyKeyToggle, propertyKeyState, type KeyableProperty, type PropertyKeyState } from './keying.ts';
import { planKeyDrag, planPasteTimelineClipboard, type TimelineClipboard } from './timeline-model.ts';
import type { NumberKeyChange } from './shared-inspector.tsx';
import type { InspectorContext } from './inspector-context.ts';
import { AnimateTimeline, TimelineSplitter, type AnimationKeyInput, type ClipPlaybackSettings } from './animate-timeline.tsx';
import { WorkspaceDocks, type WorkspaceDocksProps } from './workspace-docks.tsx';

type EditorMode = 'setup' | 'animate';

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

const keyingAnnouncementFor = function keyingAnnouncementFor(
	property: KeyableProperty,
	state: PropertyKeyState,
	frameIndex: number
): string {
	const stateLabel: Readonly<Record<PropertyKeyState, string>> = {
		unkeyed: 'unkeyed',
		pending: 'pending',
		keyed: 'keyed'
	};

	return `${numericPropertySpecs[property].label} ${stateLabel[state]} at frame ${frameIndex + 1}.`;
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
					{shortcutReference.map((shortcut) => (
						<div data-shortcut-scope={shortcut.scope} key={shortcut.id}>
							<dt><kbd>{shortcut.keys}</kbd></dt>
							<dd>{shortcut.action} · {shortcut.description}</dd>
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
	const [loadedUiPreferences] = useState<UiPreferences>(loadUiPreferences);
	const [presentation, setPresentation] = useState<ProjectUiPreferences>(() => {
		const projectPreferences = projectUiPreferencesFor(loadedUiPreferences, startup.project);

		return {
			...projectPreferences,
			layout: clampWorkspaceLayout(projectPreferences.layout, { width: window.innerWidth, height: window.innerHeight })
		};
	});
	const uiPreferencesRef = useRef(loadedUiPreferences);
	const presentationRef = useRef(presentation);
	presentationRef.current = presentation;
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
	const [keyingAnnouncement, setKeyingAnnouncement] = useState<string | undefined>(undefined);
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
		onScheduled: () => {
			setAutosaveStatus('scheduled');
			setPersistenceError(undefined);
		},
		onSaving: () => setAutosaveStatus('saving'),
		onSaved: () => {
			setAutosaveStatus('saved');
			setPersistenceError(undefined);
		},
		onError: (error) => {
			setAutosaveStatus('error');
			setPersistenceError(error.message);
		}
	}), [startup.repository]);
	const project = currentProject(history);
	const hiddenEntityIds = useMemo(() => new Set(presentation.hiddenEntityIds), [presentation.hiddenEntityIds]);
	const collapsedInspectorSections = useMemo(() => new Set(presentation.collapsedInspectorSections), [presentation.collapsedInspectorSections]);
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
		const nextPresentation = update(presentationRef.current);
		const nextPreferences = updateProjectUiPreferences(uiPreferencesRef.current, project.id, () => nextPresentation);

		presentationRef.current = nextPresentation;
		uiPreferencesRef.current = nextPreferences;
		setPresentation(nextPresentation);
	};
	const toggleInspectorSection = function toggleInspectorSection(sectionId: string): void {
		updatePresentation((current) => ({
			...current,
			collapsedInspectorSections: current.collapsedInspectorSections.includes(sectionId)
				? current.collapsedInspectorSections.filter((id) => id !== sectionId)
				: [...current.collapsedInspectorSections, sectionId]
		}));
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
			const next = updateProjectUiPreferences(uiPreferencesRef.current, project.id, () => presentation);

			uiPreferencesRef.current = next;
			saveUiPreferences(next);
		}, 180);

		return function cleanup(): void {
			clearTimeout(timer);
		};
	}, [presentation, project.id]);
	const replaceProject = function replaceProject(nextProject: Project, nextAssets: ProjectAssetBlobs): void {
		const nextPresentation = projectUiPreferencesFor(uiPreferencesRef.current, nextProject);

		setHistory(createHistory(nextProject));
		setAssetBlobs(nextAssets);
		presentationRef.current = nextPresentation;
		setPresentation(nextPresentation);
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
		const flushAutosave = function flushAutosave(): void {
			void autosave.flush();
		};

		window.addEventListener('pagehide', flushAutosave);

		return function cleanup(): void {
			window.removeEventListener('pagehide', flushAutosave);
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
		updatePresentation((current) => ({
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
			'key-selection': () => keyPendingAnimationEdits(),
			cancel: () => {
				const contextualSurfaceWasOpen = exportPanelOpen || shortcutPanelOpen;

				setExportPanelOpen(false);
				setShortcutPanelOpen(false);
				updateCanvasTransform({ x: 0, y: 0 }, 'cancel');

				if (!contextualSurfaceWasOpen) {
					setSelectionFromSurface(createSelection());
				}
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
	}, [activeClip?.durationSeconds, activeClip?.fps, activeClip?.id, activeClip?.loop, activePlayback.frameIndex, activePlayback.playing, exportPanelOpen, history, mode, pendingAnimationEdits, selection, selectionHistory, shortcutPanelOpen]);

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
			updatePresentation((current) => ({ ...current, rightDockTab: 'assets' }));
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
		updatePresentation((current) => ({ ...current, rightDockTab: 'assets' }));

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
	const openImageAttachmentWorkflow = function openImageAttachmentWorkflow(): void {
		setAssetError(undefined);
		updatePresentation((current) => ({ ...current, rightDockTab: 'assets' }));
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
			setKeyingAnnouncement(keyingAnnouncementFor(property, plan.state === 'keyed' ? 'unkeyed' : 'keyed', activePlayback.frameIndex));
			return;
		}
		if (plan.reason) {
			setCommandError(plan.reason);
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
			setKeyingAnnouncement(keyingAnnouncementFor(keyableProperty, autoKey ? 'keyed' : 'pending', activePlayback.frameIndex));
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
	const canNavigateSelectionHistory = function canNavigateSelectionHistory(direction: -1 | 1): boolean {
		const nextIndex = selectionHistoryCursorRef.current + direction;

		return nextIndex >= 0 && nextIndex < selectionHistory.length;
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
			const count = pendingAnimationEdits.length;
			setKeyingAnnouncement(`Keyed ${count} pending propert${count === 1 ? 'y' : 'ies'} at frame ${activePlayback.frameIndex + 1}.`);
		}
	};
	const workspaceViewport = { width: viewportWidth, height: viewportHeight };
	const rigTreeProps: WorkspaceDocksProps['rigTreeProps'] = {
		assetSlotDropPreview,
		boneDropPreview,
		expandedIds: new Set(presentation.rigExpandedIds),
		hiddenIds: hiddenEntityIds,
		renamingId: inlineRenameId,
		project,
		searchQuery: rigSearch,
		selection,
		slotOrderDropPreview,
		onAssetDragEnd: () => {
			setAssetSlotDropPreview(undefined);
			setSlotOrderDropPreview(undefined);
		},
		onDragBone: dragBone,
		onDragOverBone: dragOverBone,
		onDragOverSlot: (event, slotId) => {
			dragOverSlot(event, slotId);
			dragOverSlotOrder(event, slotId);
		},
		onDragSlot: dragSlot,
		onDropBone: dropBone,
		onDropSlot: (event, slotId) => event.dataTransfer.types.includes(SLOT_DRAG_MIME) ? dropSlotOrder(event, slotId) : dropAssetOnSlot(event, slotId),
		onExpandedChange: (expandedIds) => updatePresentation((current) => ({ ...current, rigExpandedIds: [...expandedIds] })),
		onRenameRequest: (node) => {
			setSelectionFromSurface([selectableEntityForRigNode(node)]);
			setInlineRenameId(node.id);
			window.requestAnimationFrame(() => {
				const input = document.querySelector<HTMLInputElement>('.rig-inline-rename');

				input?.focus();
				input?.select();
			});
		},
		onRenameCancel: () => setInlineRenameId(undefined),
		onRenameCommit: renameRigNode,
		onSelectionChange: setSelectionFromSurface,
		onToggleVisibility: toggleEditorVisibility
	};
	const drawOrderProps: WorkspaceDocksProps['drawOrderProps'] = {
		activeClip,
		frameIndex: activePlayback.frameIndex,
		project,
		selection,
		onKeyCurrentFrame: mode === 'animate' ? keyCurrentDrawOrder : undefined,
		onReorder: reorderDrawOrder,
		onSelectionChange: (slotId, additive) => updateSelection({ kind: 'slot', id: slotId }, additive)
	};
	const assetBrowserProps: WorkspaceDocksProps['assetBrowserProps'] = {
		assets: assetBlobs,
		density: presentation.assetDensity,
		importMessage: assetError,
		importSummary: assetImportSummary,
		isImporting,
		project,
		query: assetQuery,
		selection,
		dropHint: assetDropHint,
		onDensityChange: (density) => updatePresentation((current) => ({ ...current, assetDensity: density })),
		onDragEnd: () => setAssetSlotDropPreview(undefined),
		onDragOver: dragOverLibrary,
		onDragStart: dragAsset,
		onDrop: dropOnLibrary,
		onImport: () => void importDirectory(),
		onQueryChange: setAssetQuery,
		onSelectionChange: (assetId, additive) => updateSelection({ kind: 'asset', id: assetId }, additive)
	};
	const propertiesProps: WorkspaceDocksProps['propertiesProps'] = {
		activeFrameIndex: activePlayback.frameIndex,
		allSelectedImages,
		allSelectedRectangles,
		collapsedSections: collapsedInspectorSections,
		keyingAnnouncement,
		keyStateForProperty,
		onCommitDirectProperty: commitDirectProperty,
		onDeleteSelected: deleteSelected,
		onRenameSelected: renameSelected,
		onTogglePropertyKey: togglePropertyKey,
		onUpdateSlotAttachment: updateSlotAttachment,
		project,
		renameInputRef,
		selectedAttachmentIsMixed,
		selectedAttachmentValue,
		selectedEntity,
		selectedName,
		selectedSlot,
		selectedTransform,
		selectedTransformIsMixed,
		selectedTransformValue,
		selection,
		sharedInspector: {
			context: inspectorContext,
			collapsedSections: collapsedInspectorSections,
			onDeleteEvent: deleteSharedEvent,
			onDeleteTrack: deleteSharedTrack,
			onMoveEvent: moveSharedEvent,
			onRenameClip: renameSharedClip,
			onToggleSection: toggleInspectorSection,
			onUpdateAttachmentKey: updateSharedAttachmentKey,
			onUpdateClipPlayback: updateSharedClipPlayback,
			onUpdateDrawOrderKey: updateSharedDrawOrderKey,
			onUpdateEvent: updateSharedEvent,
			onUpdateInterpolation: updateSharedInterpolation,
			onUpdateNumberKeys: updateSharedNumberKeys,
			project
		},
		showSharedInspector: presentation.rightDockTab === 'properties'
	};
	const statusMessage = commandError ?? persistenceError ?? assetError;

	return (
		<div className="app-shell" style={shellStyle}>
			<header className="topbar">
				<div className="brand-lockup">
					<span className="brand-mark" aria-hidden="true">BA</span>
					<div>
						<p className="eyebrow">Bone Animation Utility</p>
						<div className="project-title-row"><h1>{project.name}</h1><span className="autosave-status" aria-live="polite">{autosaveStatus === 'saving' || autosaveStatus === 'scheduled' ? 'Saving...' : autosaveStatus === 'saved' ? 'Saved locally' : autosaveStatus === 'error' ? 'Save failed' : ''}</span></div>
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
					<button className="quiet-button" type="button" aria-keyshortcuts="Control+Z Meta+Z" disabled={!canUndo(history)} onClick={() => stepHistory(undo(history))} title="Undo · Ctrl/Cmd + Z">Undo</button>
					<button className="quiet-button" type="button" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y Meta+Y" disabled={!canRedo(history)} onClick={() => stepHistory(redo(history))} title="Redo · Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y">Redo</button>
					<button className="quiet-button" type="button" aria-label="Previous selection" aria-keyshortcuts="PageUp" disabled={!canNavigateSelectionHistory(-1)} onClick={() => navigateSelectionHistory(-1)} title="Previous selection · Page Up">Previous</button>
					<button className="quiet-button" type="button" aria-label="Next selection" aria-keyshortcuts="PageDown" disabled={!canNavigateSelectionHistory(1)} onClick={() => navigateSelectionHistory(1)} title="Next selection · Page Down">Next</button>
					<button className="quiet-button" type="button" onClick={loadExampleProject}>Load example</button>
					<button className="quiet-button" type="button" aria-label="Keyboard shortcuts" aria-keyshortcuts="?" onClick={() => setShortcutPanelOpen(true)} title="Keyboard shortcuts · ?">?</button>
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

<WorkspaceDocks
	assetBrowserProps={assetBrowserProps}
	drawOrderProps={drawOrderProps}
					isImporting={isImporting}
					leftDockTab={presentation.leftDockTab}
					layout={presentation.layout}
					mode={mode}
					onAddChildBone={addChildBone}
					onAddPointAttachment={addPointAttachment}
					onAddRectangleAttachment={addRectangleAttachment}
					onAddSlot={addSlot}
					onCreateRootBone={createRootBone}
					onOpenImageAttachmentWorkflow={openImageAttachmentWorkflow}
					onImportDirectory={() => void importDirectory()}
					onLayoutChange={(layout) => updatePresentation((current) => ({ ...current, layout }))}
					onLeftDockTabChange={(leftDockTab) => updatePresentation((current) => ({ ...current, leftDockTab }))}
					onRigSearchChange={setRigSearch}
					onRightDockTabChange={(rightDockTab) => updatePresentation((current) => ({ ...current, rightDockTab }))}
					onToggleLeftDock={() => updatePresentation((current) => ({ ...current, layout: { ...current.layout, leftDockCollapsed: !current.layout.leftDockCollapsed } }))}
					onToggleRightDock={() => updatePresentation((current) => ({ ...current, layout: { ...current.layout, rightDockCollapsed: !current.layout.rightDockCollapsed } }))}
					propertiesProps={propertiesProps}
					project={project}
					rigSearch={rigSearch}
					rigTreeProps={rigTreeProps}
					selectedBone={selectedBone}
					selectedSlot={selectedSlot}
					viewport={workspaceViewport}
					rightDockTab={presentation.rightDockTab}
				>
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
									<CanvasToolbar
										gridSettings={gridSettings}
										gridSpacingInput={gridSpacingInput}
										onGridSnapChange={(snap) => setGridSettings((current) => ({ ...current, snap }))}
										onGridSpacingChange={updateGridSpacing}
										onGridSpacingCommit={commitGridSpacingInput}
										onGridVisibleChange={(visible) => setGridSettings((current) => ({ ...current, visible }))}
										onTransformToolChange={setTransformTool}
										transformTool={transformTool}
									/>
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
				</WorkspaceDocks>

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
								onSelectTransformTool={setTransformTool}
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
