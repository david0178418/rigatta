import type { ReactElement, ReactNode } from 'react';
import type { Project } from '../domain/model.ts';
import { AssetBrowser } from './asset-browser.tsx';
import { DockSplitter } from './dock-splitter.tsx';
import { DrawOrderPanel } from './draw-order-panel.tsx';
import type { RigTreeViewProps } from './rig-tree-view.tsx';
import { RigTreeView } from './rig-tree-view.tsx';
import { MenuButton, Tabs } from './ui-primitives.tsx';
import type { ProjectUiPreferences } from './ui-preferences.ts';
import type { WorkspaceLayout, WorkspaceViewport } from './workspace-layout.ts';
import { PropertiesInspector, type PropertiesInspectorProps } from './properties-inspector.tsx';

type EditorMode = 'setup' | 'animate';
type LeftDockTab = ProjectUiPreferences['leftDockTab'];
type RightDockTab = ProjectUiPreferences['rightDockTab'];
type DrawOrderPanelProps = Parameters<typeof DrawOrderPanel>[0];
type AssetBrowserProps = Parameters<typeof AssetBrowser>[0];

export type WorkspaceDocksProps = Readonly<{
	mode: EditorMode;
	layout: WorkspaceLayout;
	viewport: WorkspaceViewport;
	leftDockTab: LeftDockTab;
	rightDockTab: RightDockTab;
	project: Project;
	rigSearch: string;
	selectedBone?: Project['bones'][number];
	isImporting: boolean;
	onLayoutChange: (layout: WorkspaceLayout) => void;
	onLeftDockTabChange: (tab: LeftDockTab) => void;
	onRightDockTabChange: (tab: RightDockTab) => void;
	onToggleLeftDock: () => void;
	onToggleRightDock: () => void;
	onRigSearchChange: (query: string) => void;
	onCreateRootBone: () => void;
	onAddChildBone: () => void;
	onAddSlot: () => void;
	onAddPointAttachment: () => void;
	onAddRectangleAttachment: () => void;
	onImportDirectory: () => void;
	rigTreeProps: RigTreeViewProps;
	drawOrderProps: DrawOrderPanelProps;
	assetBrowserProps: AssetBrowserProps;
	propertiesProps: PropertiesInspectorProps;
	children: ReactNode;
}>;

export const WorkspaceDocks = function WorkspaceDocks({
	mode,
	layout,
	viewport,
	leftDockTab,
	rightDockTab,
	project,
	rigSearch,
	selectedBone,
	isImporting,
	onLayoutChange,
	onLeftDockTabChange,
	onRightDockTabChange,
	onToggleLeftDock,
	onToggleRightDock,
	onRigSearchChange,
	onCreateRootBone,
	onAddChildBone,
	onAddSlot,
	onAddPointAttachment,
	onAddRectangleAttachment,
	onImportDirectory,
	rigTreeProps,
	drawOrderProps,
	assetBrowserProps,
	propertiesProps,
	children
}: WorkspaceDocksProps): ReactElement {
	return (
	<main className="workspace" data-mode={mode} data-testid="workspace-docks">
		<aside id="left-dock" className={layout.leftDockCollapsed ? 'panel left-dock is-collapsed' : 'panel left-dock'} aria-label="Rig and draw order">
			<div className="panel-heading dock-heading">
				<div>
					<p className="eyebrow">Structure</p>
					<h2>{layout.leftDockCollapsed ? 'Rig' : 'Rig tools'}</h2>
				</div>
				<div className="dock-heading-actions">
					{!layout.leftDockCollapsed && <MenuButton label="Add" items={[
						{ id: 'root-bone', label: 'Root bone', description: project.bones.length > 0 ? 'A root bone already exists' : 'Create the first bone', disabled: project.bones.length > 0, onSelect: onCreateRootBone },
						{ id: 'child-bone', label: 'Child bone', description: selectedBone ? `Under ${selectedBone.name}` : 'Select a bone first', disabled: !selectedBone, onSelect: onAddChildBone },
						{ id: 'slot', label: 'Slot', description: selectedBone ? `Under ${selectedBone.name}` : 'Select a bone first', disabled: !selectedBone, onSelect: onAddSlot },
						{ id: 'point', label: 'Point attachment', description: selectedBone ? 'Gameplay point under the selected bone' : 'Select a bone first', disabled: !selectedBone, onSelect: onAddPointAttachment },
						{ id: 'rectangle', label: 'Rectangle attachment', description: selectedBone ? 'Gameplay rectangle under the selected bone' : 'Select a bone first', disabled: !selectedBone, onSelect: onAddRectangleAttachment }
					]} />}
					<button className="icon-button" type="button" aria-controls="left-dock" aria-expanded={!layout.leftDockCollapsed} aria-label={layout.leftDockCollapsed ? 'Expand left dock' : 'Collapse left dock'} onClick={onToggleLeftDock}>{layout.leftDockCollapsed ? '»' : '«'}</button>
				</div>
			</div>
			{!layout.leftDockCollapsed && <>
				<Tabs
					label="Left dock"
					options={[{ value: 'rig', label: 'Rig' }, { value: 'draw-order', label: 'Draw Order' }]}
					value={leftDockTab}
					onChange={onLeftDockTabChange}
				/>
				{leftDockTab === 'rig' ? (
					<>
						<label className="search-field">
							<span className="sr-only">Search rig</span>
							<input aria-label="Search rig" type="search" placeholder="Search rig" value={rigSearch} onChange={(event) => onRigSearchChange(event.target.value)} />
						</label>
						{project.bones.length === 0 ? (
							<div className="tree-empty">
								<p>Create a root bone to see the rig.</p>
								<button className="secondary-button" type="button" onClick={onCreateRootBone}>Create root bone</button>
							</div>
						) : <RigTreeView {...rigTreeProps} />}
					</>
				) : <DrawOrderPanel {...drawOrderProps} />}
			</>}
		</aside>
		<DockSplitter dock="left" layout={layout} viewport={viewport} onChange={onLayoutChange} />
		{children}
		<DockSplitter dock="right" layout={layout} viewport={viewport} onChange={onLayoutChange} />
		<aside id="right-dock" className={layout.rightDockCollapsed ? 'panel right-dock library-panel inspector-panel is-collapsed' : 'panel right-dock library-panel inspector-panel'} data-right-tab={rightDockTab} aria-label="Properties and assets">
			<div className="right-dock-heading">
				{!layout.rightDockCollapsed && <Tabs
					label="Right dock"
					options={[{ value: 'properties', label: 'Properties' }, { value: 'assets', label: 'Assets' }]}
					value={rightDockTab}
					onChange={onRightDockTabChange}
				/>}
				<button className="icon-button" type="button" aria-controls="right-dock" aria-expanded={!layout.rightDockCollapsed} aria-label={layout.rightDockCollapsed ? 'Expand right dock' : 'Collapse right dock'} onClick={onToggleRightDock}>{layout.rightDockCollapsed ? '«' : '»'}</button>
			</div>
			{!layout.rightDockCollapsed && <>
				{rightDockTab === 'properties' && (
					<button className="secondary-button asset-import-shortcut" type="button" disabled={isImporting} onClick={onImportDirectory}>
						Import image directory
					</button>
				)}
				{rightDockTab === 'assets' && <AssetBrowser {...assetBrowserProps} />}
				<PropertiesInspector {...propertiesProps} showSharedInspector={rightDockTab === 'properties'} />
			</>}
		</aside>
	</main>
	);
};
