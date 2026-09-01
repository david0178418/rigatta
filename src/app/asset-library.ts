import type { ImageAsset } from '../domain/model.ts';

export type AssetLibraryEntry =
	| Readonly<{ kind: 'folder'; path: string; name: string; depth: number }>
	| Readonly<{ kind: 'asset'; asset: ImageAsset; depth: number }>;

const pathSegments = function pathSegments(path: string): readonly string[] {
	return path.split('/');
};

const depthOf = function depthOf(path: string): number {
	return Math.max(0, pathSegments(path).length - 1);
};

const parentFolders = function parentFolders(path: string): readonly string[] {
	const segments = pathSegments(path);

	return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
};

const pathName = function pathName(path: string): string {
	return pathSegments(path).at(-1) ?? path;
};

const entryPath = function entryPath(entry: AssetLibraryEntry): string {
	return entry.kind === 'folder' ? entry.path : entry.asset.relativePath;
};

const entryOrder = function entryOrder(left: AssetLibraryEntry, right: AssetLibraryEntry): number {
	const pathComparison = entryPath(left) < entryPath(right) ? -1 : entryPath(left) > entryPath(right) ? 1 : 0;

	return pathComparison !== 0
		? pathComparison
		: left.kind === right.kind
			? 0
			: left.kind === 'folder' ? -1 : 1;
};

export const buildAssetLibraryEntries = function buildAssetLibraryEntries(
	assets: readonly ImageAsset[],
	query: string = ''
): readonly AssetLibraryEntry[] {
	const normalizedQuery = query.trim().toLowerCase();
	const matchingAssets = assets.filter((asset) => asset.relativePath.toLowerCase().includes(normalizedQuery));
	const folders = Array.from(new Set(matchingAssets.flatMap((asset) => parentFolders(asset.relativePath))));
const folderEntries: readonly AssetLibraryEntry[] = folders.map((path) => ({
		kind: 'folder',
		path,
		name: pathName(path),
		depth: depthOf(path)
	}));
	const assetEntries: readonly AssetLibraryEntry[] = matchingAssets.map((asset) => ({
		kind: 'asset',
		asset,
		depth: depthOf(asset.relativePath)
	}));

	return [...folderEntries, ...assetEntries].sort(entryOrder);
};
