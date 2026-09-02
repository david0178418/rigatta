import type { ReactElement } from 'react';
import type { GridSettings } from './grid.ts';
import { Popover } from './ui-primitives.tsx';
import type { TransformTool } from './transform-gesture.ts';

const transformToolLabels: Readonly<Record<TransformTool, string>> = {
	translate: 'Move',
	rotate: 'Rotate',
	scale: 'Scale',
	shear: 'Shear'
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
			<div className="canvas-tool-toolbar" data-testid="canvas-toolbar" aria-label="Transform tools">
				{(['translate', 'rotate', 'scale', 'shear'] as const).map((tool) => (
					<button
						className={transformTool === tool ? 'tool-button is-active' : 'tool-button'}
						key={tool}
						type="button"
						onClick={() => onTransformToolChange(tool)}
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
			</div>
	);
};
