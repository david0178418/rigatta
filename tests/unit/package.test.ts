import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { createExportZip } from '../../src/export/package.ts';

const files = [
	{ path: 'animations.json', bytes: Uint8Array.from([2]) },
	{ path: 'atlas-0.png', bytes: Uint8Array.from([1]) },
	{ path: 'boneanim-metadata.json', bytes: Uint8Array.from([3]) }
] as const;

describe('export ZIP packaging', () => {
	test('sorts files and creates deterministic ZIP bytes', () => {
		const first = createExportZip(files);
		const second = createExportZip([...files].reverse());

		if (!first.ok || !second.ok) {
			throw new Error('The valid export files should be packaged.');
		}

		expect(first.value).toEqual(second.value);
		expect(Object.keys(unzipSync(first.value))).toEqual(['animations.json', 'atlas-0.png', 'boneanim-metadata.json']);
	});

	test('rejects duplicate and unsafe paths', () => {
		expect(createExportZip([{ path: 'frame.png', bytes: new Uint8Array() }, { path: 'frame.png', bytes: new Uint8Array() }])).toMatchObject({ ok: false });
		expect(createExportZip([{ path: '../frame.png', bytes: new Uint8Array() }])).toMatchObject({ ok: false });
		expect(createExportZip([{ path: 'folder\\frame.png', bytes: new Uint8Array() }])).toMatchObject({ ok: false });
	});
});
