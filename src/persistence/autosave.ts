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
	saving: Promise<PersistenceResult<void>> | undefined;
	generation: number;
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
		timer: undefined,
		saving: undefined,
		generation: 0
	};
	const delayMs = normalizeDelay(options.delayMs);
	const callbacks: Readonly<Record<AutosaveStatus, (() => void) | undefined>> = {
		scheduled: options.onScheduled,
		saving: options.onSaving,
		saved: options.onSaved,
		error: undefined
	};
	const reportStatus = function reportStatus(status: AutosaveStatus): void {
		options.onStatus?.(status);
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

	const savePending = async function savePending(
		pending: PendingSave,
		generation: number
	): Promise<PersistenceResult<void>> {
		if (state.generation === generation) {
			reportStatus('saving');
		}

		try {
			const result = await repository.saveRecovery(pending.project, pending.assets);

			if (state.generation === generation) {
				reportError(result);
			}

			return result;
		} catch (error: unknown) {
			const result = failureFromThrownError(error);

			if (state.generation === generation) {
				reportError(result);
			}

			return result;
		}
	};

	const flush = async function flush(): Promise<PersistenceResult<void>> {
		if (state.timer !== undefined) {
			clearTimeout(state.timer);
			state.timer = undefined;
		}
		if (state.saving) {
			const saving = state.saving;
			const result = await saving;

			if (state.saving === saving) {
				state.saving = undefined;
			}

			return state.pending ? flush() : result;
		}

		const pending = state.pending;
		state.pending = undefined;

		if (!pending) {
			return { ok: true, value: undefined };
		}

		const saving = savePending(pending, state.generation);
		state.saving = saving;
		const result = await saving;

		if (state.saving === saving) {
			state.saving = undefined;
		}

		return state.pending ? flush() : result;
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
		state.generation += 1;
	};

	return { schedule, flush, cancel };
};
