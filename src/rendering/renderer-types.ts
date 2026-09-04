import type { EntityId } from '../domain/ids.ts';

export type RendererError = Readonly<{
	code: 'unsupported-browser' | 'invalid-project' | 'invalid-asset' | 'renderer-failure';
	message: string;
}>;

export type RendererResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: RendererError }>;

export type FixedCanvasRenderOptions = Readonly<{
	gridVisible?: boolean;
	gridSpacing?: number;
	showBones?: boolean;
	showGameplay?: boolean;
	showSelectionGuides?: boolean;
	showTransformHandles?: boolean;
	selectedIds?: readonly EntityId[];
	transformTool?: 'translate' | 'rotate' | 'scale' | 'shear';
	hiddenIds?: ReadonlySet<EntityId>;
}>;

export const rendererSuccess = function rendererSuccess<TValue>(value: TValue): RendererResult<TValue> {
	return { ok: true, value };
};

export const rendererFailure = function rendererFailure(
	code: RendererError['code'],
	message: string
): RendererResult<never> {
	return { ok: false, error: { code, message } };
};
