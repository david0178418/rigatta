import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { Project } from '../domain/model.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import type { FixedCanvasRenderer } from '../rendering/fixed-canvas.ts';
import { createFixedCanvasRenderer } from '../rendering/fixed-canvas.ts';

export const ViewportCanvas = function ViewportCanvas({
	project,
	assets
}: Readonly<{ project: Project; assets: ProjectAssetBlobs }>): ReactElement {
	const hostRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | undefined>(undefined);

	useEffect(() => {
		const host = hostRef.current;

		if (!host) {
			return function cleanup(): void {};
		}

		const lifecycle: {
			cancelled: boolean;
			renderer: FixedCanvasRenderer | undefined;
		} = {
			cancelled: false,
			renderer: undefined
		};

		setError(undefined);
		void createFixedCanvasRenderer(host, project.logicalCanvas)
			.then(async (created) => {
				if (!created.ok) {
					setError(created.error.message);
					return;
				}
				if (lifecycle.cancelled) {
					created.value.destroy();
					return;
				}

				const renderer = created.value;
				lifecycle.renderer = renderer;
				const rendered = await renderer.renderSetup(project, assets);

				if (!rendered.ok && !lifecycle.cancelled) {
					setError(rendered.error.message);
				}
			})
			.catch((reason: unknown) => {
				if (!lifecycle.cancelled) {
					setError(reason instanceof Error ? reason.message : 'Canvas rendering failed.');
				}
			});

		return function cleanup(): void {
			lifecycle.cancelled = true;
			lifecycle.renderer?.destroy();
		};
	}, [assets, project]);

	return (
		<div className="pixi-viewport" aria-label="Pixi fixed logical canvas">
			<div className="pixi-host" ref={hostRef} />
			{error && <div className="renderer-error" role="alert">{error}</div>}
		</div>
	);
};
