import { useEffect, useMemo, useState, type DragEvent, type ReactElement } from 'react';
import { DEFAULT_LOCAL_TRANSFORM } from '../domain/coordinates.ts';
import { createEntityId, type EntityId } from '../domain/ids.ts';
import {
	canRedo,
	canUndo,
	beginTransaction,
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
import { ViewportCanvas } from './ViewportCanvas.tsx';
import type { ViewportPoint } from './viewport.ts';

type EditorMode = 'setup' | 'animate';

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

	const applyCommand = function applyCommand(command: ProjectCommand): void {
		const result = dispatchCommand(history, command);

		if (!result.ok) {
			setCommandError(result.error.message);
			return;
		}

		commitHistory(result.value);
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

	const dragAsset = function dragAsset(event: DragEvent<HTMLDivElement>, assetId: string): void {
		event.dataTransfer.effectAllowed = 'copy';
		event.dataTransfer.setData('application/x-bone-animation-asset', assetId);
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
	): void {
		const started = beginTransaction(history);
		const result = commands.reduce<OperationResult<HistoryState>>(
			(current, command) => current.ok ? dispatchCommand(current.value, command) : current,
			{ ok: true, value: started }
		);

		if (!result.ok) {
			setCommandError(result.error.message);
			return;
		}

		commitHistory(commitTransaction(result.value), nextAssets);
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
								<div
									className="asset-row"
									draggable
									key={entry.asset.id}
									onDragStart={(event) => dragAsset(event, entry.asset.id)}
									style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
									title={`Drag ${entry.asset.relativePath} into the canvas`}
								>
									<span className="asset-glyph" aria-hidden="true">▧</span>
									<span>{entry.asset.name}<small>{entry.asset.relativePath}</small></span>
								</div>
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
						<ViewportCanvas project={project} assets={assetBlobs} onAssetDrop={dropAssetOnCanvas} />
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
								{orderedBones.map((bone) => <div className="bone-row" key={bone.id}><span className="bone-dot" aria-hidden="true" />{bone.name}</div>)}
							</div>
						)}
					</section>
					<section className="panel-section inspector-section">
						<p className="eyebrow">Inspector</p>
						<h2>Nothing selected</h2>
						<p className="muted-copy">Select a bone, slot, or attachment to edit its properties.</p>
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
