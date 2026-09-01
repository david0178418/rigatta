import { reduceProject, type ProjectCommand } from './commands.ts';
import type { Project } from './model.ts';
import type { OperationError, OperationResult } from './operations.ts';

export type HistoryTransaction = Readonly<{
	baseProject: Project;
	draftProject: Project;
}>;

export type HistoryState = Readonly<{
	past: readonly Project[];
	present: Project;
	future: readonly Project[];
	maxEntries: number;
	transaction: HistoryTransaction | undefined;
}>;

const success = function success<TValue>(value: TValue): OperationResult<TValue> {
	return { ok: true, value };
};

const normalizeLimit = function normalizeLimit(maxEntries: number): number {
	return Number.isFinite(maxEntries) && maxEntries > 0 ? Math.max(1, Math.floor(maxEntries)) : 100;
};

export const createHistory = function createHistory(
	project: Project,
	maxEntries: number = 100
): HistoryState {
	return {
		past: [],
		present: project,
		future: [],
		maxEntries: normalizeLimit(maxEntries),
		transaction: undefined
	};
};

export const currentProject = function currentProject(history: HistoryState): Project {
	return history.transaction?.draftProject ?? history.present;
};

const commitSnapshot = function commitSnapshot(
	history: HistoryState,
	project: Project
): HistoryState {
	return {
		...history,
		past: [...history.past, history.present].slice(-history.maxEntries),
		present: project,
		future: [],
		transaction: undefined
	};
};

export const beginTransaction = function beginTransaction(history: HistoryState): HistoryState {
	if (history.transaction) {
		return history;
	}

	const project = currentProject(history);

	return {
		...history,
		transaction: { baseProject: project, draftProject: project }
	};
};

export const updateTransaction = function updateTransaction(
	history: HistoryState,
	project: Project
): HistoryState {
	return history.transaction
		? { ...history, transaction: { ...history.transaction, draftProject: project } }
		: history;
};

export const commitTransaction = function commitTransaction(history: HistoryState): HistoryState {
	const transaction = history.transaction;

	if (!transaction) {
		return history;
	}
	if (transaction.draftProject === transaction.baseProject) {
		return { ...history, transaction: undefined };
	}

	return commitSnapshot({ ...history, present: transaction.baseProject }, transaction.draftProject);
};

export const cancelTransaction = function cancelTransaction(history: HistoryState): HistoryState {
	return history.transaction ? { ...history, transaction: undefined } : history;
};

export const undo = function undo(history: HistoryState): HistoryState {
	if (history.transaction) {
		return history;
	}

	const previous = history.past.at(-1);

	if (!previous) {
		return history;
	}

	return {
		...history,
		past: history.past.slice(0, -1),
		present: previous,
		future: [history.present, ...history.future]
	};
};

export const redo = function redo(history: HistoryState): HistoryState {
	if (history.transaction) {
		return history;
	}

	const next = history.future[0];

	if (!next) {
		return history;
	}

	return {
		...history,
		past: [...history.past, history.present].slice(-history.maxEntries),
		present: next,
		future: history.future.slice(1)
	};
};

export const dispatchCommand = function dispatchCommand(
	history: HistoryState,
	command: ProjectCommand
): OperationResult<HistoryState> {
	const result = reduceProject(currentProject(history), command);

	if (!result.ok) {
		const error: OperationError = result.error;
		return { ok: false, error };
	}

	return success(history.transaction
		? updateTransaction(history, result.value)
		: commitSnapshot(history, result.value));
};

export const canUndo = function canUndo(history: HistoryState): boolean {
	return history.past.length > 0 && !history.transaction;
};

export const canRedo = function canRedo(history: HistoryState): boolean {
	return history.future.length > 0 && !history.transaction;
};
