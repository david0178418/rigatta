import { useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import type { EntityId } from '../domain/ids.ts';
import type { RecentProject } from '../persistence/repository.ts';
import { Dialog, MenuButton, type MenuItem } from './ui-primitives.tsx';

export const ProjectMenu = function ProjectMenu({
	projectName,
	canvas,
	recentProjects,
	onNew,
	onLoadExample,
	onImportArchive,
	onExportArchive,
	onOpenRecent,
	onRenameProject,
	onLoadRecent
}: Readonly<{
	projectName: string;
	canvas: Readonly<{ width: number; height: number }>;
	recentProjects: readonly RecentProject[];
	onNew: () => void;
	onLoadExample: () => void;
	onImportArchive: (bytes: Uint8Array) => void;
	onExportArchive: () => void;
	onOpenRecent: () => void;
	onRenameProject: (name: string) => void;
	onLoadRecent: (projectId: EntityId) => void;
}>): ReactElement {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [recentOpen, setRecentOpen] = useState(false);
	const [nameDraft, setNameDraft] = useState(projectName);
	const importArchive = async function importArchive(event: ChangeEvent<HTMLInputElement>): Promise<void> {
		const file = event.currentTarget.files?.[0];

		if (!file) {
			return;
		}

		onImportArchive(new Uint8Array(await file.arrayBuffer()));
		event.currentTarget.value = '';
	};
	const items: readonly MenuItem[] = [
		{ id: 'new', label: 'New project', description: 'Start with an empty fixed canvas', onSelect: onNew },
		{ id: 'recent', label: 'Open recent', description: recentProjects.length > 0 ? `${recentProjects.length} local project${recentProjects.length === 1 ? '' : 's'}` : 'No saved projects yet', disabled: recentProjects.length === 0, onSelect: () => {
			onOpenRecent();
			setRecentOpen(true);
		} },
		{ id: 'import', label: 'Import .boneanim', description: 'Replace the current project after validation', onSelect: () => fileInputRef.current?.click() },
		{ id: 'archive', label: 'Export project archive', description: 'Save editable project data and image assets', onSelect: onExportArchive },
		{ id: 'example', label: 'Load example', description: 'Replace with the bundled sample', onSelect: onLoadExample },
		{ id: 'settings', label: 'Project settings', description: 'Name and fixed logical canvas', onSelect: () => {
			setNameDraft(projectName);
			setSettingsOpen(true);
		} }
	];

	return (
		<>
			<MenuButton label="Project" items={items} />
			<input ref={fileInputRef} accept=".boneanim,application/zip" className="sr-only" type="file" onChange={(event) => void importArchive(event)} />
			{recentOpen && (
				<Dialog label="Open recent projects" onClose={() => setRecentOpen(false)}>
					<div className="recent-project-list">
						{recentProjects.map((recent) => (
							<button className="recent-project-row" key={recent.id} type="button" onClick={() => {
								onLoadRecent(recent.id);
								setRecentOpen(false);
							}}>
								<strong>{recent.name}</strong>
								<span>{recent.assetCount} asset{recent.assetCount === 1 ? '' : 's'}{recent.isRecovery ? ' · recovery available' : ''}</span>
							</button>
						))}
					</div>
				</Dialog>
			)}
			{settingsOpen && (
				<Dialog label="Project settings" onClose={() => setSettingsOpen(false)}>
					<form className="project-settings-form" onSubmit={(event) => {
						event.preventDefault();
						onRenameProject(nameDraft);
						setSettingsOpen(false);
					}}>
						<label><span className="field-label">Project name</span><input aria-label="Project name" value={nameDraft} onChange={(event) => setNameDraft(event.currentTarget.value)} /></label>
						<p className="muted-copy">Logical canvas: {canvas.width} × {canvas.height} px. Canvas bounds are fixed for this MVP.</p>
						<button className="primary-button" type="submit">Save name</button>
					</form>
				</Dialog>
			)}
		</>
	);
};
