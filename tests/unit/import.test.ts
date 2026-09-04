import { describe, expect, test } from 'bun:test';
import { importDirectoryHandle, importDroppedEntries, importDroppedItems } from '../../src/assets/import.ts';
import type { AssetDropItem, DirectoryHandle } from '../../src/assets/import.ts';

type TestEntry = Readonly<{
	kind: 'file' | 'directory';
	name: string;
	isSameEntry: (other: FileSystemHandle) => Promise<boolean>;
	getFile?: () => Promise<File>;
	values?: () => AsyncIterable<TestEntry>;
}>;

const pngBytes = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x20
]);

const file = function file(name: string): File {
	return new File([pngBytes], name, { type: 'image/png' });
};

const directory = function directory(
	name: string,
	entries: readonly TestEntry[]
): DirectoryHandle {
	return {
		kind: 'directory',
		name,
		isSameEntry: async () => false,
		values: async function* values(): AsyncGenerator<TestEntry> {
			for (const entry of entries) {
				yield entry;
			}
		}
	};
};

const fileHandle = function fileHandle(name: string, contents: File): TestEntry {
	return { kind: 'file', name, isSameEntry: async () => false, getFile: async () => contents };
};

describe('recursive asset import', () => {
	test('traverses nested directory handles and preserves relative folders', async () => {
		const nested = directory('nested', [fileHandle('arm.png', file('arm.png'))]);
		const root = directory('parts', [fileHandle('body.png', file('body.png')), nested]);
		const result = await importDirectoryHandle(root);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.map((image) => image.relativePath)).toEqual(['body.png', 'nested/arm.png']);
			expect(result.value[0]?.width).toBe(16);
		}
	});

	test('imports dropped files and rejects unsafe duplicate paths', async () => {
		const droppedFile: AssetDropItem = { getAsFile: () => file('hero.png') };
		const result = await importDroppedItems([droppedFile]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value[0]?.relativePath).toBe('hero.png');
		}

		const duplicate = await importDirectoryHandle(directory('parts', [
			fileHandle('hero.png', file('hero.png')),
			fileHandle('hero.png', file('hero.png'))
		]));
		const duplicateDroppedFiles = await importDroppedItems([
			{ getAsFile: function getAsFile(): File { return file('hero.png'); } },
			{ getAsFile: function getAsFile(): File { return file('hero.png'); } }
		]);

		expect(duplicate).toMatchObject({ ok: false });
		expect(duplicateDroppedFiles).toMatchObject({ ok: false });
	});

	test('reports unsupported and malformed files as skipped', async () => {
		const result = await importDroppedItems([
			{ getAsFile: function getAsFile(): File { return file('hero.png'); } },
			{ getAsFile: function getAsFile(): File { return new File(['notes'], 'notes.txt', { type: 'text/plain' }); } },
			{ getAsFile: function getAsFile(): File { return new File([Uint8Array.from([1, 2, 3])], 'broken.png', { type: 'image/png' }); } }
		]);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.map((image) => image.relativePath)).toEqual(['hero.png']);
			expect(result.skipped?.map((item) => item.relativePath)).toEqual(['notes.txt', 'broken.png']);
		}
	});

	test('keeps detailed bulk import outcomes distinct by entry', async () => {
		const result = await importDroppedEntries([
			{ getAsFile: function getAsFile(): File { return file('hero.png'); } },
			{ getAsFile: function getAsFile(): File { return new File(['notes'], 'notes.txt', { type: 'text/plain' }); } },
			{ getAsFile: function getAsFile(): File { return new File([Uint8Array.from([1, 2, 3])], 'broken.png', { type: 'image/png' }); } },
			{ relativePath: '../unsafe.png', getAsFile: function getAsFile(): File { return file('unsafe.png'); } },
			{ getAsFile: function getAsFile(): File | null { return null; } }
		]);

		expect(result.entries.map((entry) => entry.kind)).toEqual([
			'imported',
			'unsupported',
			'invalid',
			'invalid',
			'skipped'
		]);
	});
});
