import { describe, expect, test } from 'bun:test';
import {
	adaptDataTransferItems,
	classifyExternalDrop,
	INTERNAL_ASSET_DRAG_MIME
} from '../../src/assets/external-drop.ts';
import type { DataTransferItemLike } from '../../src/assets/external-drop.ts';
import type { DirectoryHandle } from '../../src/assets/import.ts';

const assetId = '123e4567-e89b-42d3-a456-426614174007';

const pngBytes = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x20
]);

const file = function file(name: string, type = 'image/png'): File {
	return new File([pngBytes], name, { type });
};

const fileItem = function fileItem(
	contents: File,
	getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
): DataTransferItemLike {
	return {
		kind: 'file',
		type: contents.type,
		getAsFile: () => contents,
		...(getAsFileSystemHandle ? { getAsFileSystemHandle } : {})
	};
};

const stringItem = function stringItem(type: string, value: string): DataTransferItemLike {
	return {
		kind: 'string',
		type,
		getAsFile: () => null,
		getAsString: (callback) => callback(value)
	};
};

const directory = function directory(name: string): DirectoryHandle {
	return {
		kind: 'directory',
		name,
		isSameEntry: async () => false,
		values: async function* values(): AsyncGenerator<never> {
			yield* [];
		}
	};
};

describe('external drop adapter and classifier', () => {
	test('adapts internal asset IDs, external files, and directory handles at one boundary', async () => {
		const directoryHandle = directory('parts');
		const items = await adaptDataTransferItems([
			stringItem(INTERNAL_ASSET_DRAG_MIME, assetId),
			fileItem(file('hero.png')),
			fileItem(file('parts'), async () => directoryHandle)
		]);

		expect(items).toMatchObject([
			{ kind: 'internal-asset', assetId },
			{ kind: 'external-file', relativePath: 'hero.png', supportedMimeType: 'image/png' },
			{ kind: 'external-directory', name: 'parts', directory: directoryHandle }
		]);
	});

	test('routes the current OS and internal source shapes without reading UI text', async () => {
		const single = classifyExternalDrop(await adaptDataTransferItems([fileItem(file('hero.png'))]));
		const multiple = classifyExternalDrop(await adaptDataTransferItems([
			fileItem(file('hero.png')),
			fileItem(file('arm.png'))
		]));
		const folder = classifyExternalDrop(await adaptDataTransferItems([
			fileItem(file('parts'), async () => directory('parts'))
		]));
		const internal = classifyExternalDrop(await adaptDataTransferItems([
			stringItem(INTERNAL_ASSET_DRAG_MIME, assetId)
		]));

		expect(single.kind).toBe('single-external-import-and-place');
		expect(multiple.kind).toBe('bulk-external-import');
		expect(folder.kind).toBe('bulk-external-import');
		expect(internal).toEqual({ kind: 'internal-placement', assetId });
	});

	test('keeps unsupported, empty, and mixed sources out of placement routes', async () => {
		const unsupported = classifyExternalDrop(await adaptDataTransferItems([
			fileItem(file('notes.txt', 'text/plain'))
		]));
		const mixed = classifyExternalDrop(await adaptDataTransferItems([
			stringItem(INTERNAL_ASSET_DRAG_MIME, assetId),
			fileItem(file('hero.png'))
		]));

		expect(classifyExternalDrop([])).toEqual({ kind: 'empty' });
		expect(unsupported).toMatchObject({ kind: 'unsupported' });
		expect(mixed).toMatchObject({ kind: 'unsupported' });
	});

	test('routes a supported and unsupported file together to bulk import for Assets handling', async () => {
		const route = classifyExternalDrop(await adaptDataTransferItems([
			fileItem(file('hero.png')),
			fileItem(file('notes.txt', 'text/plain'))
		]));

		expect(route).toMatchObject({ kind: 'bulk-external-import' });
		if (route.kind === 'bulk-external-import') {
			expect(route.files.map((entry) => entry.relativePath)).toEqual(['hero.png', 'notes.txt']);
			expect(route.files.find((entry) => entry.relativePath === 'notes.txt')?.supportedMimeType).toBeUndefined();
		}
	});
});
