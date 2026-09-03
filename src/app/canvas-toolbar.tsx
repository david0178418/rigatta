import type { ReactElement } from 'react';
import type { GridSettings } from './grid.ts';
import { Popover, Tooltip, Toolbar } from './ui-primitives.tsx';
import { shortcutLabelFor, type ShortcutAction } from './shortcuts.ts';
import type { TransformTool } from './transform-gesture.ts';

const transformToolLabels: Readonly<Record<TransformTool, string>> = {
	translate: 'Move',
	rotate: 'Rotate',
	scale: 'Scale',
	shear: 'Shear'
};

const transformToolShortcutActions: Readonly<Record<TransformTool, ShortcutAction>> = {
	translate: 'tool-translate',
	rotate: 'tool-rotate',
	scale: 'tool-scale',
	shear: 'tool-shear'
};

export type CanvasToolbarProps = Readonly<{
	transformTool: TransformTool;
	gridSettings: GridSettings;
	gridSpacingInput: string;
	onTransformToolChange: (tool: TransformTool) => void;
	onGridVisibleChange: (visible: boolean) => void;
	onGridSpacingChange: (value: string) => void;
	onGridSpacingCommit: () => void;
	onGridSnapChange: (snap: boolean) => void;
}>;

export const CanvasToolbar = function CanvasToolbar({
	transformTool,
	gridSettings,
	gridSpacingInput,
	onTransformToolChange,
	onGridVisibleChange,
	onGridSpacingChange,
	onGridSpacingCommit,
	onGridSnapChange
}: CanvasToolbarProps): ReactElement {
	return (
			<Toolbar className="canvas-tool-toolbar" label="Transform tools" orientation="vertical" testId="canvas-toolbar">
				{(['translate', 'rotate', 'scale', 'shear'] as const).map((tool) => (
					<Tooltip key={tool} label={transformToolLabels[tool]} shortcut={shortcutLabelFor(transformToolShortcutActions[tool])}>
						<button
							aria-keyshortcuts={shortcutLabelFor(transformToolShortcutActions[tool])}
							aria-pressed={transformTool === tool}
							className={transformTool === tool ? 'tool-button is-active' : 'tool-button'}
							title={`${transformToolLabels[tool]} · ${shortcutLabelFor(transformToolShortcutActions[tool])}`}
							type="button"
							onClick={() => onTransformToolChange(tool)}
						>
							{transformToolLabels[tool]}
						</button>
					</Tooltip>
				))}
				<Popover label="Grid settings" className="grid-popover">
					<div className="grid-controls" aria-label="Grid controls">
						<label className="grid-toggle">
							<input
								aria-label="Show grid"
								checked={gridSettings.visible}
								type="checkbox"
								onChange={(event) => onGridVisibleChange(event.target.checked)}
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
								onChange={(event) => onGridSpacingChange(event.target.value)}
								onBlur={onGridSpacingCommit}
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
								onChange={(event) => onGridSnapChange(event.target.checked)}
							/>
							<span>Snap</span>
						</label>
					</div>
				</Popover>
			</Toolbar>
	);
};
