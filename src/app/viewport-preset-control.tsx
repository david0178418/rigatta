import type { ReactElement } from 'react';
import { Tooltip } from './ui-primitives.tsx';
import {
	VIEWPORT_PRESET_DEFINITIONS,
	VIEWPORT_PRESET_VALUES,
	type ViewportPreset
} from './viewport-presentation.ts';

export type ViewportPresetControlProps = Readonly<{
	preset: ViewportPreset;
	onChange: (preset: ViewportPreset) => void;
}>;

export const ViewportPresetControl = function ViewportPresetControl({
	preset,
	onChange
}: ViewportPresetControlProps): ReactElement {
	return (
		<div
			aria-label="Viewport presentation presets"
			className="viewport-preset-control"
			data-viewport-control="preset"
			data-viewport-preset={preset}
			data-testid="viewport-preset-control"
			role="group"
		>
			<span className="viewport-preset-label">Presentation</span>
			<div className="viewport-preset-options">
				{VIEWPORT_PRESET_VALUES.map((nextPreset) => {
					const label = VIEWPORT_PRESET_DEFINITIONS[nextPreset].label;
					const selected = nextPreset === preset;

					return (
						<Tooltip key={nextPreset} label={label}>
							<button
								aria-label={label}
								aria-pressed={selected}
								className={selected ? 'viewport-preset-button is-active' : 'viewport-preset-button'}
								data-preset={nextPreset}
								data-selected={String(selected)}
								title={label}
								type="button"
								onClick={() => onChange(nextPreset)}
							>
								{label}
							</button>
						</Tooltip>
					);
				})}
			</div>
		</div>
	);
};
