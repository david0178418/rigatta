import { describe, expect, test } from 'bun:test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { exportProjectArchive, importProjectArchive } from '../../src/persistence/archive.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const sourceBytes = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x40
]);

describe('rigatta archives', () => {
	test('round trips project metadata and asset bytes', async () => {
		const project = createRigProject();
		const exported = await exportProjectArchive(project, new Map([[fixtureIds.asset, sourceBytes]]));

		expect(exported.ok).toBe(true);
		if (!exported.ok) {
			return;
		}

		const manifestBytes = unzipSync(exported.value)['manifest.json'];

		if (!manifestBytes) {
			throw new Error('Exported archive is missing manifest.json');
		}

		expect(JSON.parse(strFromU8(manifestBytes))).toEqual(expect.objectContaining({ format: 'rigatta' }));

		const imported = await importProjectArchive(exported.value);

		expect(imported.ok).toBe(true);
		if (!imported.ok) {
			return;
		}

		expect(imported.value.project).toEqual(project);
		expect(imported.value.assets.get(fixtureIds.asset)).toEqual(sourceBytes);
	});

	test('rejects missing asset bytes before creating an archive', async () => {
		const result = await exportProjectArchive(createRigProject(), new Map());

		expect(result).toMatchObject({ ok: false, error: { code: 'missing-asset' } });
	});

	test('rejects malformed ZIP data', async () => {
		const result = await importProjectArchive(Uint8Array.from([1, 2, 3, 4]));

		expect(result).toMatchObject({ ok: false, error: { code: 'invalid-archive' } });
	});

	test('rejects undeclared archive files and tampered asset bytes', async () => {
		const project = createRigProject();
		const exported = await exportProjectArchive(project, new Map([[fixtureIds.asset, sourceBytes]]));

		expect(exported.ok).toBe(true);
		if (!exported.ok) {
			return;
		}

		const entries = unzipSync(exported.value);
		const extraFileArchive = zipSync({ ...entries, 'unexpected.txt': strToU8('unexpected') });
		const extraFileResult = await importProjectArchive(extraFileArchive);

		expect(extraFileResult).toMatchObject({ ok: false, error: { code: 'invalid-archive' } });

		const assetPath = `assets/${fixtureIds.asset}.png`;
		const tamperedEntries = { ...entries, [assetPath]: Uint8Array.from([9, 9, 9]) };
		const tamperedResult = await importProjectArchive(zipSync(tamperedEntries));

		expect(tamperedResult).toMatchObject({ ok: false, error: { code: 'integrity-failure' } });
});
});
