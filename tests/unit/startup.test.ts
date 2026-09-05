import { describe, expect, test } from 'bun:test';
import { deleteDB } from 'idb';
import 'fake-indexeddb/auto';
import { createRigProject, fixtureIds } from '../fixtures.ts';
import { loadEditorStartup } from '../../src/app/startup.ts';
import { openProjectRepository } from '../../src/persistence/repository.ts';

const imageBytes = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x40
]);

const imageBlob = function imageBlob(): Blob {
	const buffer = new ArrayBuffer(imageBytes.byteLength);
	new Uint8Array(buffer).set(imageBytes);

	return new Blob([buffer], { type: 'image/png' });
};

const projectAssets = function projectAssets(): ReadonlyMap<typeof fixtureIds.asset, Blob> {
	return new Map([[fixtureIds.asset, imageBlob()]]);
};

const withDatabase = async function withDatabase<TValue>(
	callback: (databaseName: string) => Promise<TValue>
): Promise<TValue> {
	const databaseName = `rigatta-startup-${crypto.randomUUID()}`;

	try {
		return await callback(databaseName);
	} finally {
		await deleteDB(databaseName);
	}
};

describe('editor startup loading', () => {
	test('opens a new empty project when there are no recent snapshots', async () => {
		await withDatabase(async (databaseName) => {
			const startup = await loadEditorStartup({ databaseName });

			expect(startup.status).toBe('ready');
			if (startup.status === 'ready') {
				expect(startup.source).toBe('new');
				expect(startup.project.bones).toEqual([]);
				startup.repository.close();
			}
		});
	});

	test('loads the newest recovery snapshot for the editor', async () => {
		await withDatabase(async (databaseName) => {
			const repositoryResult = await openProjectRepository({ databaseName, now: () => 100 });

			if (!repositoryResult.ok) {
				throw new Error(repositoryResult.error.message);
			}

			const project = createRigProject();
		const recoveryProject = { ...project, name: 'Interrupted session' };
		await repositoryResult.value.saveProject(project, projectAssets());
		await repositoryResult.value.saveRecovery(recoveryProject, projectAssets());
		repositoryResult.value.close();

			const startup = await loadEditorStartup({ databaseName, now: () => 200 });

			expect(startup.status).toBe('ready');
			if (startup.status === 'ready') {
				expect(startup.source).toBe('recovery');
				expect(startup.project.name).toBe('Interrupted session');
				startup.repository.close();
			}
		});
	});
});
