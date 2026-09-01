import type { IDBPDatabase } from 'idb';
import { isEntityId, type EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';
import { isSupportedImageMimeType } from '../domain/schema.ts';
import { validateImageBytes } from '../assets/images.ts';
import { parseProject } from './project-schema.ts';
import {
	openBoneAnimationDatabase,
	type AssetRecord,
	type BoneAnimationDatabase,
	PROJECT_DATABASE_NAME,
	type ProjectRecord,
	type SnapshotKind
} from './database.ts';

export type PersistenceErrorCode =
	| 'unsupported-browser'
	| 'invalid-id'
	| 'invalid-project'
	| 'missing-asset'
	| 'invalid-asset'
	| 'invalid-record'
	| 'not-found'
	| 'quota-exceeded'
	| 'storage-failure';

export type PersistenceError = Readonly<{
	code: PersistenceErrorCode;
	message: string;
}>;

export type PersistenceResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: PersistenceError }>;

export type ProjectAssetBlobs = ReadonlyMap<EntityId, Blob>;

export type ProjectSnapshot = Readonly<{
	project: Project;
	assets: ProjectAssetBlobs;
	updatedAt: number;
	isRecovery: boolean;
}>;

export type RecentProject = Readonly<{
	id: EntityId;
	name: string;
	updatedAt: number;
	lastOpenedAt: number;
	assetCount: number;
	isRecovery: boolean;
}>;

export type ProjectRepository = Readonly<{
	saveProject: (project: Project, assets: ProjectAssetBlobs) => Promise<PersistenceResult<void>>;
	saveRecovery: (project: Project, assets: ProjectAssetBlobs) => Promise<PersistenceResult<void>>;
	loadProject: (projectId: EntityId) => Promise<PersistenceResult<ProjectSnapshot | null>>;
	loadRecovery: (projectId: EntityId) => Promise<PersistenceResult<ProjectSnapshot | null>>;
	listRecentProjects: (limit?: number) => Promise<PersistenceResult<readonly RecentProject[]>>;
	markProjectOpened: (projectId: EntityId) => Promise<PersistenceResult<void>>;
	clearRecovery: (projectId: EntityId) => Promise<PersistenceResult<void>>;
	deleteProject: (projectId: EntityId) => Promise<PersistenceResult<void>>;
	close: () => void;
}>;

export type OpenProjectRepositoryOptions = Readonly<{
	databaseName?: string;
	now?: () => number;
}>;

const allStores = ['projects', 'assets', 'recoveries'] as const;

const success = function success<TValue>(value: TValue): PersistenceResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(
	code: PersistenceErrorCode,
	message: string
): PersistenceResult<never> {
	return { ok: false, error: { code, message } };
};

const isRecord = function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isTimestamp = function isTimestamp(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
};

const isBlob = function isBlob(value: unknown): value is Blob {
	return typeof globalThis.Blob !== 'undefined' && value instanceof Blob;
};

const storageFailure = function storageFailure(
	action: string,
	error: unknown
): PersistenceResult<never> {
	const message = error instanceof Error ? error.message : 'Unknown IndexedDB failure.';
	const quotaExceeded = typeof globalThis.DOMException !== 'undefined'
		&& error instanceof DOMException
		&& error.name === 'QuotaExceededError';

	return failure(
		quotaExceeded ? 'quota-exceeded' : 'storage-failure',
		`${action}: ${message}`
	);
};

const recordCreatedAt = function recordCreatedAt(
	values: readonly unknown[],
	fallback: number
): number {
	return values.find(isTimestamp) ?? fallback;
};

const snapshotKeyFor = function snapshotKeyFor(
	projectId: EntityId,
	kind: SnapshotKind
): string {
	return `${kind}:${projectId}`;
};

const assetKeyFor = function assetKeyFor(
	projectId: EntityId,
	assetId: EntityId,
	kind: SnapshotKind
): string {
	return `${snapshotKeyFor(projectId, kind)}:${assetId}`;
};

const parseStoredProjectRecord = function parseStoredProjectRecord(
	value: unknown,
	label: string
): PersistenceResult<ProjectRecord> {
	if (!isRecord(value)
		|| !isEntityId(value.id)
		|| !isTimestamp(value.createdAt)
		|| !isTimestamp(value.updatedAt)
		|| !isTimestamp(value.lastOpenedAt)) {
		return failure('invalid-record', `${label} metadata is malformed.`);
	}

	const project = parseProject(value.project);

	if (!project.success || project.project.id !== value.id) {
		return failure('invalid-record', `${label} project data failed schema validation.`);
	}

	return success({
		id: value.id,
		project: project.project,
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
		lastOpenedAt: value.lastOpenedAt
	});
};

const parseStoredAssetRecord = function parseStoredAssetRecord(
	value: unknown,
	projectId: EntityId,
	kind: SnapshotKind
): PersistenceResult<AssetRecord> {
	if (!isRecord(value)
		|| typeof value.key !== 'string'
		|| typeof value.snapshotKey !== 'string'
		|| !isEntityId(value.projectId)
		|| !isEntityId(value.assetId)
		|| typeof value.relativePath !== 'string'
		|| !isSupportedImageMimeType(value.mimeType)
		|| !isTimestamp(value.width)
		|| !isTimestamp(value.height)
		|| !isBlob(value.blob)) {
		return failure('invalid-record', 'An IndexedDB asset record is malformed.');
	}
	if (value.projectId !== projectId
		|| value.snapshotKey !== snapshotKeyFor(projectId, kind)
		|| value.key !== assetKeyFor(projectId, value.assetId, kind)
		|| value.width <= 0
		|| value.height <= 0) {
		return failure('invalid-record', 'An IndexedDB asset record has an invalid ownership key.');
	}

	return success({
		key: value.key,
		snapshotKey: value.snapshotKey,
		projectId: value.projectId,
		assetId: value.assetId,
		relativePath: value.relativePath,
		mimeType: value.mimeType,
		width: value.width,
		height: value.height,
		blob: value.blob
	});
};

const validProject = function validProject(project: Project): PersistenceResult<Project> {
	const parsed = parseProject(project);

	return parsed.success
		? success(parsed.project)
		: failure('invalid-project', 'The project failed schema or reference validation.');
};

const prepareAssetRecords = async function prepareAssetRecords(
	project: Project,
	blobs: ProjectAssetBlobs,
	kind: SnapshotKind
): Promise<PersistenceResult<readonly AssetRecord[]>> {
	if (blobs.size !== project.assets.length) {
		return failure('missing-asset', 'The asset blob set does not match the project asset catalog.');
	}

	const records = await Promise.all(project.assets.map(async (asset): Promise<PersistenceResult<AssetRecord>> => {
		const blob = blobs.get(asset.id);

		if (!isBlob(blob)) {
			return failure('missing-asset', `No blob was supplied for asset ${asset.id}.`);
		}

		const bytes = new Uint8Array(await blob.arrayBuffer());
		const image = validateImageBytes(bytes, asset.mimeType);

		if (!image.ok) {
			return failure('invalid-asset', `${asset.relativePath}: ${image.error}`);
		}
		if (image.value.width !== asset.width || image.value.height !== asset.height) {
			return failure('invalid-asset', `${asset.relativePath}: stored dimensions do not match the project catalog.`);
		}

		const snapshotKey = snapshotKeyFor(project.id, kind);

		return success({
			key: assetKeyFor(project.id, asset.id, kind),
			snapshotKey,
			projectId: project.id,
			assetId: asset.id,
			relativePath: asset.relativePath,
			mimeType: asset.mimeType,
			width: asset.width,
			height: asset.height,
			blob
		});
	}));
	const failed = records.find((record) => !record.ok);

	if (failed && !failed.ok) {
		return failed;
	}

	return success(records.flatMap((record) => record.ok ? [record.value] : []));
};

const loadAssetBlobs = async function loadAssetBlobs(
	database: IDBPDatabase<BoneAnimationDatabase>,
	project: Project,
	kind: SnapshotKind
): Promise<PersistenceResult<ProjectAssetBlobs>> {
	const storedRecords = await database.getAllFromIndex(
		'assets',
		'by-snapshot-key',
		snapshotKeyFor(project.id, kind)
	);
	const parsedRecords = storedRecords.map((record) => parseStoredAssetRecord(record, project.id, kind));
	const failedRecord = parsedRecords.find((record) => !record);

	if (failedRecord && !failedRecord.ok) {
		return failedRecord;
	}

	const records = parsedRecords.flatMap((record) => record.ok ? [record.value] : []);
	const recordIds = records.map((record) => record.assetId);

	if (records.length !== project.assets.length || new Set(recordIds).size !== recordIds.length) {
		return failure('invalid-record', 'Stored asset records do not match the project asset catalog.');
	}

	const blobs = await Promise.all(project.assets.map(async (asset): Promise<PersistenceResult<readonly [EntityId, Blob]>> => {
		const record = records.find((candidate) => candidate.assetId === asset.id);

		if (!record) {
			return failure('missing-asset', `Stored asset ${asset.id} is missing.`);
		}
		if (record.relativePath !== asset.relativePath
			|| record.mimeType !== asset.mimeType
			|| record.width !== asset.width
			|| record.height !== asset.height) {
			return failure('invalid-record', `Stored asset ${asset.id} metadata does not match the project.`);
		}

		const bytes = new Uint8Array(await record.blob.arrayBuffer());
		const image = validateImageBytes(bytes, asset.mimeType);

		return image.ok && image.value.width === asset.width && image.value.height === asset.height
			? success([asset.id, record.blob] as const)
			: failure('invalid-asset', `Stored asset ${asset.id} failed image validation.`);
	}));
	const failedBlob = blobs.find((blob) => !blob.ok);

	if (failedBlob && !failedBlob.ok) {
		return failedBlob;
	}

	return success(new Map(blobs.flatMap((blob) => blob.ok ? [blob.value] : [])));
};

const loadSnapshot = async function loadSnapshot(
	database: IDBPDatabase<BoneAnimationDatabase>,
	value: unknown,
	kind: SnapshotKind
): Promise<PersistenceResult<ProjectSnapshot | null>> {
	if (value === undefined) {
		return success(null);
	}

	const stored = parseStoredProjectRecord(value, kind === 'project' ? 'Project' : 'Recovery');

	if (!stored.ok) {
		return stored;
	}

	const assets = await loadAssetBlobs(database, stored.value.project, kind);

	if (!assets.ok) {
		return assets;
	}

	return success({
		project: stored.value.project,
		assets: assets.value,
		updatedAt: stored.value.updatedAt,
		isRecovery: kind === 'recovery'
	});
};

const recentProjectFromRecord = function recentProjectFromRecord(
	record: ProjectRecord,
	isRecovery: boolean
): RecentProject {
	return {
		id: record.id,
		name: record.project.name,
		updatedAt: record.updatedAt,
		lastOpenedAt: record.lastOpenedAt,
		assetCount: record.project.assets.length,
		isRecovery
	};
};

type RecentCandidate = Readonly<{
	record: ProjectRecord;
	isRecovery: boolean;
}>;

const candidateIsNewer = function candidateIsNewer(
	candidate: RecentCandidate,
	existing: RecentCandidate
): boolean {
	if (candidate.record.updatedAt !== existing.record.updatedAt) {
		return candidate.record.updatedAt > existing.record.updatedAt;
	}

	return candidate.isRecovery && !existing.isRecovery;
};

const normalizeLimit = function normalizeLimit(limit: number | undefined): number {
	return limit !== undefined && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
};

const createRepository = function createRepository(
	database: IDBPDatabase<BoneAnimationDatabase>,
	now: () => number
): ProjectRepository {
	const saveProject = async function saveProject(
		project: Project,
		blobs: ProjectAssetBlobs
	): Promise<PersistenceResult<void>> {
		try {
			const parsedProject = validProject(project);

			if (!parsedProject.ok) {
				return parsedProject;
			}

			const preparedAssets = await prepareAssetRecords(parsedProject.value, blobs, 'project');

			if (!preparedAssets.ok) {
				return preparedAssets;
			}

			const timestamp = now();

			if (!isTimestamp(timestamp)) {
				return failure('storage-failure', 'The persistence clock returned an invalid timestamp.');
			}

			const transaction = database.transaction(allStores, 'readwrite');
			const projectStore = transaction.objectStore('projects');
			const recoveryStore = transaction.objectStore('recoveries');
			const [previousProject, previousProjectAssets, previousRecoveryAssets] = await Promise.all([
				projectStore.get(parsedProject.value.id),
				transaction.objectStore('assets').index('by-snapshot-key').getAll(snapshotKeyFor(parsedProject.value.id, 'project')),
				transaction.objectStore('assets').index('by-snapshot-key').getAll(snapshotKeyFor(parsedProject.value.id, 'recovery'))
			]);
			const record: ProjectRecord = {
				id: parsedProject.value.id,
				project: parsedProject.value,
				createdAt: recordCreatedAt([previousProject?.createdAt], timestamp),
				updatedAt: timestamp,
				lastOpenedAt: timestamp
			};
			const assetStore = transaction.objectStore('assets');

			await Promise.all([
				...previousProjectAssets.map((asset) => assetStore.delete(asset.key)),
				...previousRecoveryAssets.map((asset) => assetStore.delete(asset.key)),
				...preparedAssets.value.map((asset) => assetStore.put(asset)),
				projectStore.put(record),
				recoveryStore.delete(parsedProject.value.id)
			]);
			await transaction.done;

			return success(undefined);
		} catch (error: unknown) {
			return storageFailure('Could not save the project', error);
		}
	};

	const saveRecovery = async function saveRecovery(
		project: Project,
		blobs: ProjectAssetBlobs
	): Promise<PersistenceResult<void>> {
		try {
			const parsedProject = validProject(project);

			if (!parsedProject.ok) {
				return parsedProject;
			}

			const preparedAssets = await prepareAssetRecords(parsedProject.value, blobs, 'recovery');

			if (!preparedAssets.ok) {
				return preparedAssets;
			}

			const timestamp = now();

			if (!isTimestamp(timestamp)) {
				return failure('storage-failure', 'The persistence clock returned an invalid timestamp.');
			}

			const transaction = database.transaction(allStores, 'readwrite');
			const recoveryStore = transaction.objectStore('recoveries');
			const projectStore = transaction.objectStore('projects');
			const assetStore = transaction.objectStore('assets');
			const [previousRecovery, previousProject, previousAssets] = await Promise.all([
				recoveryStore.get(parsedProject.value.id),
				projectStore.get(parsedProject.value.id),
				assetStore.index('by-snapshot-key').getAll(snapshotKeyFor(parsedProject.value.id, 'recovery'))
			]);
			const record: ProjectRecord = {
				id: parsedProject.value.id,
				project: parsedProject.value,
				createdAt: recordCreatedAt([previousRecovery?.createdAt, previousProject?.createdAt], timestamp),
				updatedAt: timestamp,
				lastOpenedAt: recordCreatedAt([previousRecovery?.lastOpenedAt], timestamp)
			};

			await Promise.all([
				...previousAssets.map((asset) => assetStore.delete(asset.key)),
				...preparedAssets.value.map((asset) => assetStore.put(asset)),
				recoveryStore.put(record)
			]);
			await transaction.done;

			return success(undefined);
		} catch (error: unknown) {
			return storageFailure('Could not save the recovery snapshot', error);
		}
	};

	const loadProject = async function loadProject(
		projectId: EntityId
	): Promise<PersistenceResult<ProjectSnapshot | null>> {
		if (!isEntityId(projectId)) {
			return failure('invalid-id', 'Project ID must be a lower-case UUID v4.');
		}

		try {
			return loadSnapshot(database, await database.get('projects', projectId), 'project');
		} catch (error: unknown) {
			return storageFailure('Could not load the project', error);
		}
	};

	const loadRecovery = async function loadRecovery(
		projectId: EntityId
	): Promise<PersistenceResult<ProjectSnapshot | null>> {
		if (!isEntityId(projectId)) {
			return failure('invalid-id', 'Project ID must be a lower-case UUID v4.');
		}

		try {
			return loadSnapshot(database, await database.get('recoveries', projectId), 'recovery');
		} catch (error: unknown) {
			return storageFailure('Could not load the recovery snapshot', error);
		}
	};

	const listRecentProjects = async function listRecentProjects(
		limit?: number
	): Promise<PersistenceResult<readonly RecentProject[]>> {
		try {
			const [storedProjects, storedRecoveries] = await Promise.all([
				database.getAll('projects'),
				database.getAll('recoveries')
			]);
			const projects = storedProjects.map((record) => parseStoredProjectRecord(record, 'Project'));
			const recoveries = storedRecoveries.map((record) => parseStoredProjectRecord(record, 'Recovery'));
			const failedProject = projects.find((record) => !record.ok);
			const failedRecovery = recoveries.find((record) => !record.ok);

			if (failedProject && !failedProject.ok) {
				return failedProject;
			}
			if (failedRecovery && !failedRecovery.ok) {
				return failedRecovery;
			}

			const candidates: readonly RecentCandidate[] = [
				...projects.flatMap((record) => record.ok ? [{ record: record.value, isRecovery: false }] : []),
				...recoveries.flatMap((record) => record.ok ? [{ record: record.value, isRecovery: true }] : [])
			];
			const selected = candidates.reduce<ReadonlyMap<EntityId, RecentCandidate>>((records, candidate) => {
				const existing = records.get(candidate.record.id);

				return !existing || candidateIsNewer(candidate, existing)
					? new Map([...records, [candidate.record.id, candidate]])
					: records;
			}, new Map());
			const recent = [...selected.values()]
				.map((candidate) => recentProjectFromRecord(candidate.record, candidate.isRecovery))
				.toSorted((left, right) => right.updatedAt - left.updatedAt || right.lastOpenedAt - left.lastOpenedAt || left.name.localeCompare(right.name));

			return success(recent.slice(0, normalizeLimit(limit)));
		} catch (error: unknown) {
			return storageFailure('Could not list recent projects', error);
		}
	};

	const markProjectOpened = async function markProjectOpened(
		projectId: EntityId
	): Promise<PersistenceResult<void>> {
		if (!isEntityId(projectId)) {
			return failure('invalid-id', 'Project ID must be a lower-case UUID v4.');
		}

		try {
			const timestamp = now();

			if (!isTimestamp(timestamp)) {
				return failure('storage-failure', 'The persistence clock returned an invalid timestamp.');
			}

			const transaction = database.transaction(allStores, 'readwrite');
			const projectStore = transaction.objectStore('projects');
			const recoveryStore = transaction.objectStore('recoveries');
			const [rawProject, rawRecovery] = await Promise.all([
				projectStore.get(projectId),
				recoveryStore.get(projectId)
			]);
			const project = rawProject ? parseStoredProjectRecord(rawProject, 'Project') : success(null);
			const recovery = rawRecovery ? parseStoredProjectRecord(rawRecovery, 'Recovery') : success(null);

			if (!project.ok) {
				return project;
			}
			if (!recovery.ok) {
				return recovery;
			}
			if (!project.value && !recovery.value) {
				return failure('not-found', `Project ${projectId} was not found.`);
			}

			const selected = recovery.value && (!project.value || recovery.value.updatedAt >= project.value.updatedAt)
				? { record: recovery.value, isRecovery: true }
				: project.value ? { record: project.value, isRecovery: false } : undefined;

			if (!selected) {
				return failure('not-found', `Project ${projectId} was not found.`);
			}

			const updated = { ...selected.record, lastOpenedAt: timestamp };

			await (selected.isRecovery ? recoveryStore.put(updated) : projectStore.put(updated));
			await transaction.done;

			return success(undefined);
		} catch (error: unknown) {
			return storageFailure('Could not mark the project as opened', error);
		}
	};

	const clearRecovery = async function clearRecovery(
		projectId: EntityId
	): Promise<PersistenceResult<void>> {
		if (!isEntityId(projectId)) {
			return failure('invalid-id', 'Project ID must be a lower-case UUID v4.');
		}

		try {
			const transaction = database.transaction(allStores, 'readwrite');
			const assetStore = transaction.objectStore('assets');
			const recoveryStore = transaction.objectStore('recoveries');
			const recoveryAssets = await assetStore.index('by-snapshot-key').getAll(snapshotKeyFor(projectId, 'recovery'));

			await Promise.all([
				...recoveryAssets.map((asset) => assetStore.delete(asset.key)),
				recoveryStore.delete(projectId)
			]);
			await transaction.done;

			return success(undefined);
		} catch (error: unknown) {
			return storageFailure('Could not clear the recovery snapshot', error);
		}
	};

	const deleteProject = async function deleteProject(
		projectId: EntityId
	): Promise<PersistenceResult<void>> {
		if (!isEntityId(projectId)) {
			return failure('invalid-id', 'Project ID must be a lower-case UUID v4.');
		}

		try {
			const transaction = database.transaction(allStores, 'readwrite');
			const projectStore = transaction.objectStore('projects');
			const recoveryStore = transaction.objectStore('recoveries');
			const assetStore = transaction.objectStore('assets');
			const [project, recovery, projectAssets, recoveryAssets] = await Promise.all([
				projectStore.get(projectId),
				recoveryStore.get(projectId),
				assetStore.index('by-snapshot-key').getAll(snapshotKeyFor(projectId, 'project')),
				assetStore.index('by-snapshot-key').getAll(snapshotKeyFor(projectId, 'recovery'))
			]);

			if (!project && !recovery && projectAssets.length === 0 && recoveryAssets.length === 0) {
				return failure('not-found', `Project ${projectId} was not found.`);
			}

			await Promise.all([
				...projectAssets.map((asset) => assetStore.delete(asset.key)),
				...recoveryAssets.map((asset) => assetStore.delete(asset.key)),
				projectStore.delete(projectId),
				recoveryStore.delete(projectId)
			]);
			await transaction.done;

			return success(undefined);
		} catch (error: unknown) {
			return storageFailure('Could not delete the project', error);
		}
	};

	const close = function close(): void {
		database.close();
	};

	return {
		saveProject,
		saveRecovery,
		loadProject,
		loadRecovery,
		listRecentProjects,
		markProjectOpened,
		clearRecovery,
		deleteProject,
		close
	};
};

export const openProjectRepository = async function openProjectRepository(
	options: OpenProjectRepositoryOptions = {}
): Promise<PersistenceResult<ProjectRepository>> {
	if (typeof globalThis.indexedDB === 'undefined') {
		return failure('unsupported-browser', 'This browser does not provide IndexedDB.');
	}

	try {
		const database = await openBoneAnimationDatabase(options.databaseName ?? PROJECT_DATABASE_NAME);
		const defaultNow = function defaultNow(): number {
			return Date.now();
		};
		const now = options.now ?? defaultNow;

		return success(createRepository(database, now));
	} catch (error: unknown) {
		return storageFailure('Could not open the project database', error);
	}
};
