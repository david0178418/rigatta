import { describe, expect, test } from 'bun:test';
import { buildAssetLibraryEntries } from '../../src/app/asset-library.ts';

const assets = [
	{
		id: '123e4567-e89b-42d3-a456-426614174001',
		name: 'body.png',
		relativePath: 'characters/body.png',
		mimeType: 'image/png' as const,
		width: 64,
		height: 64
	},
	{
		id: '123e4567-e89b-42d3-a456-426614174002',
		name: 'arm.png',
		relativePath: 'characters/arms/arm.png',
		mimeType: 'image/png' as const,
		width: 32,
		height: 32
	},
	{
		id: '123e4567-e89b-42d3-a456-426614174003',
		name: 'background.png',
		relativePath: 'background.png',
		mimeType: 'image/png' as const,
		width: 128,
		height: 128
	}
] as const;

describe('asset library entries', () => {
	test('builds deterministic nested folder entries', () => {
		const entries = buildAssetLibraryEntries(assets);

		expect(entries.map((entry) => entry.kind === 'folder' ? `${entry.kind}:${entry.path}` : `${entry.kind}:${entry.asset.relativePath}`)).toEqual([
			'asset:background.png',
			'folder:characters',
			'folder:characters/arms',
			'asset:characters/arms/arm.png',
			'asset:characters/body.png'
		]);
	});

	test('keeps matching folders visible when searching by asset path', () => {
		const entries = buildAssetLibraryEntries(assets, 'ARM');

		expect(entries).toEqual([
			{ kind: 'folder', path: 'characters', name: 'characters', depth: 0 },
			{ kind: 'folder', path: 'characters/arms', name: 'arms', depth: 1 },
			{ kind: 'asset', asset: assets[1], depth: 2 }
		]);
	});
});
