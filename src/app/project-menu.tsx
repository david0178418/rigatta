import { useRef, useState, type ChangeEvent, type ReactElement } from 'react';
import type { EntityId } from '../domain/ids.ts';
import { ARCHIVE_FORMAT } from '../domain/schema.ts';
import type { RecentProject } from '../persistence/repository.ts';
import { Dialog, MenuButton, type MenuItem } from './ui-primitives.tsx';

export const ProjectMenu = function ProjectMenu({
	projectName,
	canvas,
	recentOpen,
	recentProjects,
	recentProjectsLoading,
	onNew,
	onLoadExample,
	onImportArchive,
	onExportArchive,
	onOpenRecent,
	onRecentOpenChange,
	onRenameProject,
	onLoadRecent
}: Readonly<{
	projectName: string;
	canvas: Readonly<{ width: number; height: number }>;
	recentOpen: boolean;
	recentProjects: readonly RecentProject[];
	recentProjectsLoading: boolean;
	onNew: () => void;
	onLoadExample: () => void;
	onImportArchive: (bytes: Uint8Array) => void;
	onExportArchive: () => void;
	onOpenRecent: () => void;
	onRecentOpenChange: (open: boolean) => void;
	onRenameProject: (name: string) => void;
	onLoadRecent: (projectId: EntityId) => void;
}>): ReactElement {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [nameDraft, setNameDraft] = useState(projectName);
	const [nameError, setNameError] = useState<string | undefined>(undefined);
	const importArchive = async function importArchive(event: ChangeEvent<HTMLInputElement>): Promise<void> {
		const input = event.currentTarget;
		const file = input.files?.[0];

		if (!file) {
			return;
		}

		onImportArchive(new Uint8Array(await file.arrayBuffer()));
		input.value = '';
	};
	const items: readonly MenuItem[] = [
		{ id: 'new', label: 'New project', description: 'Start with an empty fixed canvas', onSelect: onNew },
		{ id: 'recent', label: 'Open recent', description: recentProjectsLoading ? 'Loading local projects…' : recentProjects.length > 0 ? `${recentProjects.length} local project${recentProjects.length === 1 ? '' : 's'}` : 'No saved projects yet', onSelect: (): void => {
			onRecentOpenChange(true);
			onOpenRecent();
		} },
		{ id: 'import', label: `Import .${ARCHIVE_FORMAT}`, description: 'Replace the current project after validation', onSelect: () => fileInputRef.current?.click() },
		{ id: 'archive', label: 'Export project archive', description: 'Save editable project data and image assets', onSelect: onExportArchive },
		{ id: 'example', label: 'Load example', description: 'Replace with the bundled sample', onSelect: onLoadExample },
		{ id: 'settings', label: 'Project settings', description: 'Name and fixed logical canvas', onSelect: (): void => {
			setNameDraft(projectName);
			setNameError(undefined);
			setSettingsOpen(true);
		} }
	];

	return (
		<>
			<MenuButton label="Project" items={items} />
			<input ref={fileInputRef} accept={`.${ARCHIVE_FORMAT},application/zip`} className="sr-only" type="file" onChange={(event) => void importArchive(event)} />
			{recentOpen && (
				<Dialog label="Open recent projects" onClose={() => onRecentOpenChange(false)}>
					{recentProjectsLoading && <p className="muted-copy" role="status">Loading recent projects…</p>}
					{!recentProjectsLoading && recentProjects.length === 0 && <p className="muted-copy">No saved projects yet.</p>}
					{!recentProjectsLoading && recentProjects.length > 0 && <div className="recent-project-list">
						{recentProjects.map((recent) => (
							<button className="recent-project-row" key={recent.id} type="button" onClick={() => {
								onLoadRecent(recent.id);
								onRecentOpenChange(false);
							}}>
								<strong>{recent.name}</strong>
								<span>{recent.assetCount} asset{recent.assetCount === 1 ? '' : 's'}{recent.isRecovery ? ' · recovery available' : ''}</span>
							</button>
						))}
					</div>}
				</Dialog>
			)}
			{settingsOpen && (
				<Dialog label="Project settings" onClose={() => setSettingsOpen(false)}>
					<form className="project-settings-form" onSubmit={(event) => {
						event.preventDefault();
						const normalizedName = nameDraft.trim();

						if (normalizedName.length === 0) {
							setNameError('Project name must contain at least one non-whitespace character.');
							return;
						}

						onRenameProject(normalizedName);
						setSettingsOpen(false);
					}}>
						<label><span className="field-label">Project name</span><input aria-describedby={nameError ? 'project-name-error' : undefined} aria-invalid={nameError ? 'true' : undefined} aria-label="Project name" autoComplete="off" value={nameDraft} onChange={(event) => {
							setNameDraft(event.currentTarget.value);
							setNameError(undefined);
						}} /></label>
						{nameError && <p className="field-error" id="project-name-error" role="alert">{nameError}</p>}
						<p className="muted-copy">Logical canvas: {canvas.width} × {canvas.height} px. Canvas bounds are fixed for this MVP.</p>
						<button className="primary-button" type="submit">Save name</button>
					</form>
				</Dialog>
			)}
		</>
	);
};
