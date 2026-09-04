import type { EntityId } from '../domain/ids.ts';

export type ExportPhase = 'validation' | 'rendering' | 'composition' | 'packaging' | 'cleanup';

export type ExportErrorCode =
	| 'invalid-request'
	| 'invalid-project'
	| 'invalid-selection'
	| 'missing-asset'
	| 'unsupported-browser'
	| 'sampling-failure'
	| 'render-failure'
	| 'capture-failure'
	| 'fully-transparent-frame'
	| 'frame-too-large'
	| 'composition-failure'
	| 'packaging-failure'
	| 'cancelled'
	| 'cleanup-failure'
	| 'unexpected-failure';

export type ExportError = Readonly<{
	code: ExportErrorCode;
	phase: ExportPhase;
	message: string;
	clipId?: EntityId;
	frameIndex?: number;
	path?: string;
	cause?: string;
}>;

export type ExportResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: ExportError }>;

export const exportSuccess = function exportSuccess<TValue>(value: TValue): ExportResult<TValue> {
	return { ok: true, value };
};

export const exportFailure = function exportFailure(
	error: ExportError
): ExportResult<never> {
	return { ok: false, error };
};

export const exportError = function exportError(
	code: ExportErrorCode,
	phase: ExportPhase,
	message: string,
	context: Readonly<{
		clipId?: EntityId;
		frameIndex?: number;
		path?: string;
		cause?: string;
	}> = {}
): ExportError {
	return { code, phase, message, ...context };
};

export const cancelledExport = function cancelledExport(
	context: Readonly<{
		clipId?: EntityId;
		frameIndex?: number;
	}> = {}
): ExportResult<never> {
	return exportFailure(exportError('cancelled', 'rendering', 'Export was cancelled.', context));
};
