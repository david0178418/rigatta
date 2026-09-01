import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactElement } from 'react';
import { DEFAULT_LOCAL_TRANSFORM, degreesToRadians, radiansToDegrees, type LocalTransform } from '../domain/coordinates.ts';
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
import type { Project } from '../domain/model.ts';
import { localPointForBone, evaluateBoneWorldMatrices } from '../domain/transforms.ts';
import type { OperationResult } from '../domain/operations.ts';
import { importDroppedItems, pickImageDirectory, type AssetDropItem, type AssetImportResult, type ImportedImage } from '../assets/import.ts';
import { createAutosaveScheduler } from '../persistence/autosave.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import type { ReadyStartup, StartupState } from './startup.ts';
import { loadEditorStartup } from './startup.ts';
import { buildAssetLibraryEntries } from './asset-library.ts';
import { entitiesInBounds, hitTestProject } from './hit-testing.ts';
import { boneDropCommands, dropZoneForClientY, type BoneDropZone } from './hierarchy-dnd.ts';
import { createSelection, isSelected, selectEntities, selectEntity, type SelectableEntity, type Selection } from './selection.ts';
import { createTransformGesture, isTransformHandleHit, transformGestureCommand, type TransformGesture, type TransformPhase, type TransformTool } from './transform-gesture.ts';
import { ViewportCanvas } from './ViewportCanvas.tsx';
import type { ViewportPoint } from './viewport.ts';

type EditorMode = 'setup' | 'animate';

const transformToolLabels: Record<TransformTool, string> = {
	translate: 'Move',
	rotate: 'Rotate',
	scale: 'Scale',
	shear: 'Shear'
};

const BONE_DRAG_MIME = 'application/x-bone-animation-bone';
const ASSET_DRAG_MIME = 'application/x-bone-animation-asset';

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

const EditorShell = function EditorShell({ startup }: Readonly<{ startup: ReadyStartup }>): ReactElement {
	const [mode, setMode] = useState<EditorMode>('setup');
	const [history, setHistory] = useState<HistoryState>(() => createHistory(startup.project));
	const [persistenceError, setPersistenceError] = useState<string | undefined>(undefined);
	const [commandError, setCommandError] = useState<string | undefined>(undefined);
	const [assetError, setAssetError] = useState<string | undefined>(undefined);
	const [selection, setSelection] = useState<Selection>(createSelection);
	const [transformTool, setTransformTool] = useState<TransformTool>('translate');
	const [boneDropPreview, setBoneDropPreview] = useState<Readonly<{ boneId: EntityId; zone: BoneDropZone }> | undefined>(undefined);
	const [slotDropPreview, setSlotDropPreview] = useState<EntityId | undefined>(undefined);
	const transformSessionRef = useRef<Readonly<{ gesture: TransformGesture; history: HistoryState }> | undefined>(undefined);
	const [isImporting, setIsImporting] = useState(false);
	const [assetQuery, setAssetQuery] = useState('');
	const [assetBlobs, setAssetBlobs] = useState<ProjectAssetBlobs>(startup.assets);
	const autosave = useMemo(() => createAutosaveScheduler(startup.repository, {
		onError: (error) => setPersistenceError(error.message)
	}), [startup.repository]);
	const project = currentProject(history);
	const orderedBones = project.boneOrder.flatMap((boneId) => project.bones.filter((bone) => bone.id === boneId));
	const libraryEntries = buildAssetLibraryEntries(project.assets, assetQuery);

	useEffect(() => {
		return function cleanup(): void {
			autosave.cancel();
		};
	}, [autosave]);

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
		setSlotDropPreview(slotId);
	};

	const dropAssetOnSlot = function dropAssetOnSlot(event: DragEvent<HTMLElement>, slotId: EntityId): void {
		event.preventDefault();
		setSlotDropPreview(undefined);
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

	const beginCanvasTransform = function beginCanvasTransform(point: ViewportPoint, tool: TransformTool): boolean {
		const entity = selection.length === 1 ? selection[0] : undefined;
		const hit = hitTestProject(project, point);
		const selectedEntityHit = !!entity
			&& !!hit
			&& entity.kind === hit.kind
			&& entity.id === hit.id;
		const handleHit = !!entity && isTransformHandleHit(project, entity, point, tool);

		if (!entity || (!selectedEntityHit && !handleHit)) {
			return false;
		}

		const gesture = createTransformGesture(project, entity, point, tool);

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

		const command = transformGestureCommand(session.gesture, point);

		if (!command) {
			return;
		}

		const result = dispatchCommand(session.history, command);

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
			input: { name: 'bone', parentId: selectedBone.id }
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
			input: { name: 'slot', boneId: selectedBone.id }
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
			input: { name: 'point', boneId: selectedBone.id }
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
			input: { name: 'rectangle', boneId: selectedBone.id, width: 64, height: 64 }
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
		const commands: readonly ProjectCommand[] = [
			transformCommand,
			...(imageCommand ? [imageCommand] : []),
			...(rectangleCommand ? [rectangleCommand] : [])
		];

		applyCommandSequence(commands);
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
					<button className="primary-button" type="button" disabled>Export</button>
				</div>
			</header>

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
									onDragEnd={() => setSlotDropPreview(undefined)}
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
					</div>
					<div className="viewport-stage">
						<ViewportCanvas
							project={project}
							assets={assetBlobs}
							onAssetDrop={dropAssetOnCanvas}
							onCanvasSelect={selectCanvasPoint}
							onCanvasMarquee={selectCanvasMarquee}
							selection={selection}
							transformTool={transformTool}
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
												slotDropPreview === slot.id ? 'drop-target' : ''
											].filter(Boolean).join(' ')}
											key={slot.id}
											type="button"
											onClick={(event) => updateSelection({ kind: 'slot', id: slot.id }, event.metaKey || event.ctrlKey)}
											onDragOver={(event) => dragOverSlot(event, slot.id)}
											onDrop={(event) => dropAssetOnSlot(event, slot.id)}
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
													<label><span className="field-label">X</span><input name="x" type="number" step="any" defaultValue={selectedTransform.x} /></label>
													<label><span className="field-label">Y</span><input name="y" type="number" step="any" defaultValue={selectedTransform.y} /></label>
													<label><span className="field-label">Rotation (deg)</span><input name="rotation" type="number" step="any" defaultValue={radiansToDegrees(selectedTransform.rotation)} /></label>
													<label><span className="field-label">Scale X</span><input name="scaleX" type="number" step="any" defaultValue={selectedTransform.scaleX} /></label>
													<label><span className="field-label">Scale Y</span><input name="scaleY" type="number" step="any" defaultValue={selectedTransform.scaleY} /></label>
													<label><span className="field-label">Shear X (deg)</span><input name="shearX" type="number" step="any" defaultValue={radiansToDegrees(selectedTransform.shearX)} /></label>
													<label><span className="field-label">Shear Y (deg)</span><input name="shearY" type="number" step="any" defaultValue={radiansToDegrees(selectedTransform.shearY)} /></label>
												</div>
												{selectedAttachment?.kind === 'image' && (
													<div className="transform-grid compact-grid">
														<label><span className="field-label">Opacity</span><input name="opacity" type="number" min="0" max="1" step="0.01" defaultValue={selectedAttachment.opacity} /></label>
														<label><span className="field-label">Pivot X</span><input name="pivotX" type="number" min="0" max="1" step="0.01" defaultValue={selectedAttachment.pivotX} /></label>
														<label><span className="field-label">Pivot Y</span><input name="pivotY" type="number" min="0" max="1" step="0.01" defaultValue={selectedAttachment.pivotY} /></label>
													</div>
												)}
														{selectedAttachment?.kind === 'rectangle' && (
													<div className="transform-grid compact-grid">
														<label><span className="field-label">Width</span><input name="width" type="number" min="0" step="any" defaultValue={selectedAttachment.width} /></label>
														<label><span className="field-label">Height</span><input name="height" type="number" min="0" step="any" defaultValue={selectedAttachment.height} /></label>
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
				<div className="timeline-header">
					<div>
						<p className="eyebrow">Animation</p>
						<h2>Timeline</h2>
					</div>
					<span className="muted-copy">{project.clips.length === 0 ? 'No clips yet' : `${project.clips.length} clip${project.clips.length === 1 ? '' : 's'}`}</span>
				</div>
				<div className="timeline-empty">Create an animation clip when the rig is ready.</div>
				{statusMessage && <div className="status-strip" role="status">{statusMessage}</div>}
			</footer>
		</div>
	);
};
