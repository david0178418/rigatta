import { createEmptyProject, type Project } from '../domain/model.ts';
import {
	openProjectRepository,
	type OpenProjectRepositoryOptions,
	type ProjectAssetBlobs,
	type ProjectRepository
} from '../persistence/repository.ts';

export type ReadyStartup = Readonly<{
	status: 'ready';
	project: Project;
	assets: ProjectAssetBlobs;
	repository: ProjectRepository;
	source: 'new' | 'project' | 'recovery';
}>;

export type ResolvedStartupState =
	| ReadyStartup
	| Readonly<{ status: 'unsupported'; message: string }>
	| Readonly<{ status: 'fatal'; message: string }>;

export type StartupState = Readonly<{ status: 'loading' }> | ResolvedStartupState;

const failureState = function failureState(
	status: 'unsupported' | 'fatal',
	message: string
): ResolvedStartupState {
	return { status, message };
};

const closeAndFail = function closeAndFail(
	repository: ProjectRepository,
	message: string
): ResolvedStartupState {
	repository.close();

	return failureState('fatal', message);
};

export const loadEditorStartup = async function loadEditorStartup(
	options: OpenProjectRepositoryOptions = {}
): Promise<ResolvedStartupState> {
	const opened = await openProjectRepository(options);

	if (!opened.ok) {
		return failureState(opened.error.code === 'unsupported-browser' ? 'unsupported' : 'fatal', opened.error.message);
	}

	const repository = opened.value;
	const recent = await repository.listRecentProjects();

	if (!recent.ok) {
		return closeAndFail(repository, recent.error.message);
	}

	const mostRecent = recent.value.at(0);

	if (!mostRecent) {
		return {
			status: 'ready',
			project: createEmptyProject(),
			assets: new Map(),
			repository,
			source: 'new'
		};
	}

	const loaded = mostRecent.isRecovery
		? await repository.loadRecovery(mostRecent.id)
		: await repository.loadProject(mostRecent.id);

	if (!loaded.ok) {
		return closeAndFail(repository, loaded.error.message);
	}
	if (!loaded.value) {
		return closeAndFail(repository, 'The most recent project could not be reloaded.');
	}

	const openedProject = await repository.markProjectOpened(mostRecent.id);

	if (!openedProject.ok) {
		return closeAndFail(repository, openedProject.error.message);
	}

	return {
		status: 'ready',
		project: loaded.value.project,
		assets: loaded.value.assets,
		repository,
		source: mostRecent.isRecovery ? 'recovery' : 'project'
	};
};
