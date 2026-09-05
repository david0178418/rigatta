import { describe, expect, test } from 'bun:test';
import { deleteDB } from 'idb';
import 'fake-indexeddb/auto';
import { fixtureIds, createRigProject } from '../fixtures.ts';
import { openRigattaDatabase } from '../../src/persistence/database.ts';
import { openProjectRepository, type ProjectRepository } from '../../src/persistence/repository.ts';

const imageBytes = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x40
]);

const blobFromBytes = function blobFromBytes(bytes: Uint8Array): Blob {
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);

	return new Blob([buffer], { type: 'image/png' });
};

const blobsForProject = function blobsForProject(): ReadonlyMap<typeof fixtureIds.asset, Blob> {
	return new Map([[fixtureIds.asset, blobFromBytes(imageBytes)]]);
};

const withRepository = async function withRepository<TValue>(
	callback: (repository: ProjectRepository) => Promise<TValue>
): Promise<TValue> {
	const databaseName = `rigatta-test-${crypto.randomUUID()}`;
	const opened = await openProjectRepository({ databaseName, now: () => 100 });

	if (!opened.ok) {
		throw new Error(opened.error.message);
	}

	try {
		return await callback(opened.value);
	} finally {
		opened.value.close();
		await deleteDB(databaseName);
	}
};

describe('IndexedDB project repository', () => {
	test('creates the versioned stores and indexes through the migration', async () => {
		const databaseName = `rigatta-migration-${crypto.randomUUID()}`;
		const database = await openRigattaDatabase(databaseName);

		expect(database.objectStoreNames.contains('projects')).toBe(true);
		expect(database.objectStoreNames.contains('assets')).toBe(true);
		expect(database.objectStoreNames.contains('recoveries')).toBe(true);

		database.close();
		await deleteDB(databaseName);
	});

	test('round trips validated project metadata and image blobs separately', async () => {
		await withRepository(async (repository) => {
			const project = createRigProject();
			const saved = await repository.saveProject(project, blobsForProject());
			const loaded = await repository.loadProject(project.id);

			expect(saved).toEqual({ ok: true, value: undefined });
			expect(loaded.ok).toBe(true);

			if (!loaded.ok || !loaded.value) {
				return;
			}

			expect(loaded.value.project).toEqual(project);
			expect(loaded.value.isRecovery).toBe(false);
			expect(loaded.value.assets.get(fixtureIds.asset)?.size).toBe(imageBytes.length);
		});
	});

	test('lists a newer recovery snapshot and clears it after a stable save', async () => {
		await withRepository(async (repository) => {
			const project = createRigProject();
			const recoveryProject = { ...project, name: 'Recovered work' };

			expect((await repository.saveProject(project, blobsForProject())).ok).toBe(true);
			expect((await repository.saveRecovery(recoveryProject, blobsForProject())).ok).toBe(true);

			const recent = await repository.listRecentProjects();
			expect(recent.ok).toBe(true);
			if (recent.ok) {
				expect(recent.value[0]).toMatchObject({
					id: project.id,
					name: 'Recovered work',
					isRecovery: true
				});
			}

			const recovery = await repository.loadRecovery(project.id);
			expect(recovery.ok).toBe(true);
			if (recovery.ok) {
				expect(recovery.value?.project.name).toBe('Recovered work');
			}

			expect((await repository.saveProject(recoveryProject, blobsForProject())).ok).toBe(true);
			const clearedRecovery = await repository.loadRecovery(project.id);
			expect(clearedRecovery.ok).toBe(true);
			if (clearedRecovery.ok) {
				expect(clearedRecovery.value).toBeNull();
			}
		});
	});

	test('rejects missing and invalid image blobs before writing', async () => {
		await withRepository(async (repository) => {
			const project = createRigProject();
			const missing = await repository.saveProject(project, new Map());
			const invalid = await repository.saveProject(project, new Map([[fixtureIds.asset, blobFromBytes(Uint8Array.from([1, 2, 3]))]]));

			expect(missing).toMatchObject({ ok: false, error: { code: 'missing-asset' } });
			expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-asset' } });
			const loaded = await repository.loadProject(project.id);
			expect(loaded.ok).toBe(true);
			if (loaded.ok) {
				expect(loaded.value).toBeNull();
			}
		});
	});

	test('deletes stable and recovery metadata with both asset snapshots', async () => {
		await withRepository(async (repository) => {
			const project = createRigProject();

			expect((await repository.saveProject(project, blobsForProject())).ok).toBe(true);
			expect((await repository.saveRecovery(project, blobsForProject())).ok).toBe(true);
			expect((await repository.deleteProject(project.id)).ok).toBe(true);
			const loadedProject = await repository.loadProject(project.id);
			const loadedRecovery = await repository.loadRecovery(project.id);
			const recent = await repository.listRecentProjects();
			expect(loadedProject.ok).toBe(true);
			expect(loadedRecovery.ok).toBe(true);
			expect(recent.ok).toBe(true);
			if (loadedProject.ok) {
				expect(loadedProject.value).toBeNull();
			}
			if (loadedRecovery.ok) {
				expect(loadedRecovery.value).toBeNull();
			}
			if (recent.ok) {
				expect(recent.value).toEqual([]);
			}
			expect(await repository.deleteProject(project.id)).toMatchObject({ ok: false, error: { code: 'not-found' } });
		});
	});
});
