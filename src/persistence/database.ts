import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import type { EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';
import type { SupportedImageMimeType } from '../domain/schema.ts';

export const PROJECT_DATABASE_NAME = 'rigatta-projects';
export const PROJECT_DATABASE_VERSION = 1;

export type SnapshotKind = 'project' | 'recovery';

export type ProjectRecord = Readonly<{
	id: EntityId;
	project: Project;
	createdAt: number;
	updatedAt: number;
	lastOpenedAt: number;
}>;

export type RecoveryRecord = ProjectRecord;

export type AssetRecord = Readonly<{
	key: string;
	snapshotKey: string;
	projectId: EntityId;
	assetId: EntityId;
	relativePath: string;
	mimeType: SupportedImageMimeType;
	width: number;
	height: number;
	blob: Blob;
}>;

export interface RigattaDatabase extends DBSchema {
	projects: {
		key: EntityId;
		value: ProjectRecord;
		indexes: {
			'by-updated-at': number;
		};
	};
	assets: {
		key: string;
		value: AssetRecord;
		indexes: {
			'by-snapshot-key': string;
		};
	};
	recoveries: {
		key: EntityId;
		value: RecoveryRecord;
		indexes: {
			'by-updated-at': number;
		};
	};
}

const migrateDatabase = function migrateDatabase(
	database: IDBPDatabase<RigattaDatabase>,
	oldVersion: number,
	_newVersion: number | null,
	transaction: IDBPTransaction<RigattaDatabase, StoreNames<RigattaDatabase>[], 'versionchange'>
): void {
	if (oldVersion < 1 && !database.objectStoreNames.contains('projects')) {
		database.createObjectStore('projects', { keyPath: 'id' });
	}
	if (oldVersion < 1 && !database.objectStoreNames.contains('assets')) {
		database.createObjectStore('assets', { keyPath: 'key' });
	}
	if (oldVersion < 1 && !database.objectStoreNames.contains('recoveries')) {
		database.createObjectStore('recoveries', { keyPath: 'id' });
	}

	const projectStore = transaction.objectStore('projects');
	const assetStore = transaction.objectStore('assets');
	const recoveryStore = transaction.objectStore('recoveries');

	if (!projectStore.indexNames.contains('by-updated-at')) {
		projectStore.createIndex('by-updated-at', 'updatedAt');
	}
	if (!assetStore.indexNames.contains('by-snapshot-key')) {
		assetStore.createIndex('by-snapshot-key', 'snapshotKey');
	}
	if (!recoveryStore.indexNames.contains('by-updated-at')) {
		recoveryStore.createIndex('by-updated-at', 'updatedAt');
	}
};

export const openRigattaDatabase = async function openRigattaDatabase(
	databaseName: string = PROJECT_DATABASE_NAME
): Promise<IDBPDatabase<RigattaDatabase>> {
	if (typeof globalThis.indexedDB === 'undefined') {
		throw new Error('IndexedDB is not available in this browser.');
	}

	return openDB<RigattaDatabase>(databaseName, PROJECT_DATABASE_VERSION, {
		upgrade: migrateDatabase
	});
};
