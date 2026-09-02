import type { Project } from '../domain/model.ts';
import type {
	PersistenceError,
	PersistenceResult,
	ProjectAssetBlobs,
	ProjectRepository
} from './repository.ts';

export type AutosaveOptions = Readonly<{
	delayMs?: number;
	onStatus?: (status: AutosaveStatus) => void;
	onScheduled?: () => void;
	onSaving?: () => void;
	onSaved?: () => void;
	onError?: (error: PersistenceError) => void;
}>;

export type AutosaveStatus = 'scheduled' | 'saving' | 'saved' | 'error';

export type AutosaveScheduler = Readonly<{
	schedule: (project: Project, assets: ProjectAssetBlobs) => void;
	flush: () => Promise<PersistenceResult<void>>;
	cancel: () => void;
}>;

type PendingSave = Readonly<{
	project: Project;
	assets: ProjectAssetBlobs;
}>;

type AutosaveState = {
	pending: PendingSave | undefined;
	timer: ReturnType<typeof setTimeout> | undefined;
};

const DEFAULT_DELAY_MS = 500;

const normalizeDelay = function normalizeDelay(delayMs: number | undefined): number {
	return delayMs !== undefined && Number.isFinite(delayMs) && delayMs >= 0
		? Math.floor(delayMs)
		: DEFAULT_DELAY_MS;
};

const failureFromThrownError = function failureFromThrownError(error: unknown): PersistenceResult<never> {
	return {
		ok: false,
		error: {
			code: 'storage-failure',
			message: error instanceof Error ? error.message : 'Unknown autosave failure.'
		}
	};
};

export const createAutosaveScheduler = function createAutosaveScheduler(
	repository: Pick<ProjectRepository, 'saveRecovery'>,
	options: AutosaveOptions = {}
): AutosaveScheduler {
	const state: AutosaveState = {
		pending: undefined,
		timer: undefined
	};
	const delayMs = normalizeDelay(options.delayMs);
	const reportStatus = function reportStatus(status: AutosaveStatus): void {
		options.onStatus?.(status);
		const callbacks: Readonly<Record<AutosaveStatus, (() => void) | undefined>> = {
			scheduled: options.onScheduled,
			saving: options.onSaving,
			saved: options.onSaved,
			error: undefined
		};

		callbacks[status]?.();
	};
	const reportError = function reportError(result: PersistenceResult<void>): void {
		if (result.ok) {
			reportStatus('saved');
			return;
		}

		reportStatus('error');
		options.onError?.(result.error);
	};

	const flush = async function flush(): Promise<PersistenceResult<void>> {
		if (state.timer !== undefined) {
			clearTimeout(state.timer);
			state.timer = undefined;
		}

		const pending = state.pending;
		state.pending = undefined;

		if (!pending) {
			return { ok: true, value: undefined };
		}

		reportStatus('saving');

		try {
			const result = await repository.saveRecovery(pending.project, pending.assets);

			reportError(result);

			return result;
		} catch (error: unknown) {
			const result = failureFromThrownError(error);

			reportError(result);

			return result;
		}
	};

	const schedule = function schedule(project: Project, assets: ProjectAssetBlobs): void {
		state.pending = { project, assets };
		reportStatus('scheduled');

		if (state.timer !== undefined) {
			clearTimeout(state.timer);
		}

		state.timer = setTimeout(() => {
			state.timer = undefined;
			void flush();
		}, delayMs);
	};

	const cancel = function cancel(): void {
		if (state.timer !== undefined) {
			clearTimeout(state.timer);
			state.timer = undefined;
		}

		state.pending = undefined;
	};

	return { schedule, flush, cancel };
};
