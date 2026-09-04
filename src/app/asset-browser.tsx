import { useEffect, useState, type DragEvent as ReactDragEvent, type ReactElement } from 'react';
import type { EntityId } from '../domain/ids.ts';
import type { ImageAsset, Project } from '../domain/model.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import type { AssetImportSkip } from '../assets/import.ts';
import { buildAssetLibraryEntries, type AssetLibraryEntry } from './asset-library.ts';
import { assetPreviewFor, assetUsageLabelFor } from './asset-browser-model.ts';
import { isSelected, type Selection } from './selection.ts';
import type { AssetDensity } from './ui-preferences.ts';
import { Tooltip } from './ui-primitives.tsx';

const ASSET_DRAG_MIME = 'application/x-bone-animation-asset';

const assetForEntry = function assetForEntry(entry: AssetLibraryEntry): ImageAsset | undefined {
	return entry.kind === 'asset' ? entry.asset : undefined;
};

export type AssetImportSummary = Readonly<{
	imported: number;
	skipped: readonly AssetImportSkip[];
	conflicts: readonly string[];
	invalid: readonly AssetImportSkip[];
	unsupported: readonly AssetImportSkip[];
}>;

const pluralize = function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
};

const importSummaryLabel = function importSummaryLabel(summary: AssetImportSummary): string {
	const parts = [pluralize(summary.imported, 'image')];

	if (summary.skipped.length > 0) {
		parts.push(pluralize(summary.skipped.length, 'skipped file'));
	}
	if (summary.conflicts.length > 0) {
		parts.push(pluralize(summary.conflicts.length, 'conflict'));
	}
	if (summary.invalid.length > 0) {
		parts.push(pluralize(summary.invalid.length, 'invalid file'));
	}
	if (summary.unsupported.length > 0) {
		parts.push(pluralize(summary.unsupported.length, 'unsupported file'));
	}

	return `Imported ${parts.join(' · ')}.`;
};

const IMPORT_DETAIL_LIMIT = 8;

export const AssetBrowser = function AssetBrowser({
	project,
	assets,
	selection,
	query,
	density,
	isImporting,
	importMessage,
	dropHint,
	importSummary,
	onQueryChange,
	onDensityChange,
	onImport,
	onSelectionChange,
	onDragStart,
	onDragEnd,
	onDrop,
	onDragOver
}: Readonly<{
	project: Project;
	assets: ProjectAssetBlobs;
	selection: Selection;
	query: string;
	density: AssetDensity;
	isImporting: boolean;
	importMessage?: string;
	dropHint?: string;
	importSummary?: AssetImportSummary;
	onQueryChange: (query: string) => void;
	onDensityChange: (density: AssetDensity) => void;
	onImport: () => void;
	onSelectionChange: (assetId: EntityId, additive: boolean) => void;
	onDragStart: (event: ReactDragEvent<HTMLElement>, assetId: EntityId) => void;
	onDragEnd: () => void;
	onDrop: (event: ReactDragEvent<HTMLElement>) => void;
	onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
}>): ReactElement {
	const [hoveredAssetId, setHoveredAssetId] = useState<EntityId | undefined>(undefined);
	const entries = buildAssetLibraryEntries(project.assets, query);
	const visibleAssets = entries.flatMap((entry) => {
		const asset = assetForEntry(entry);

		return asset ? [asset] : [];
	});
	const selectedAssetId = hoveredAssetId ?? selection.find((entity) => entity.kind === 'asset')?.id;
	const selectedAsset = assetPreviewFor(project, selectedAssetId);
	const objectUrlAssetKey = Array.from(new Set([
		...(density === 'thumbnail' ? visibleAssets.map((asset) => asset.id) : []),
		...(selectedAsset ? [selectedAsset.asset.id] : [])
	])).join('|');
	const [objectUrls, setObjectUrls] = useState<ReadonlyMap<EntityId, string>>(new Map());

	useEffect(() => {
		const urls = new Map<EntityId, string>();

		objectUrlAssetKey.split('|').filter(Boolean).forEach((assetId) => {
			const blob = assets.get(assetId as EntityId);

			if (blob) {
				urls.set(assetId as EntityId, URL.createObjectURL(blob));
			}
		});
		setObjectUrls(urls);

		return function cleanup(): void {
			urls.forEach((url) => URL.revokeObjectURL(url));
		};
	}, [assets, objectUrlAssetKey]);
	const onDragStartWithAsset = function onDragStartWithAsset(event: ReactDragEvent<HTMLElement>, assetId: EntityId): void {
		event.dataTransfer.effectAllowed = 'copy';
		event.dataTransfer.setData(ASSET_DRAG_MIME, assetId);
		onDragStart(event, assetId);
	};

	return (
		<section className="asset-browser" aria-label="Assets" onDragOver={onDragOver} onDrop={onDrop}>
			<div className="panel-heading">
				<div>
					<p className="eyebrow">Sources</p>
					<h2>Image library</h2>
				</div>
				<Tooltip label="Import image directory">
					<button className="icon-button" type="button" aria-label="Import image directory" disabled={isImporting} onClick={onImport}>+</button>
				</Tooltip>
			</div>
			<div className="asset-browser-controls">
				<label className="search-field">
					<span className="sr-only">Search images</span>
					<input aria-label="Search images" type="search" placeholder="Search images" value={query} disabled={project.assets.length === 0} onChange={(event) => onQueryChange(event.target.value)} />
				</label>
				<label className="asset-density-field">
					<span className="field-label">Density</span>
					<select aria-label="Asset density" value={density} onChange={(event) => {
						const next = event.target.value;

						if (next === 'list' || next === 'compact' || next === 'thumbnail') {
							onDensityChange(next);
						}
					}}>
						<option value="list">List</option>
						<option value="compact">Compact</option>
						<option value="thumbnail">Thumbnail</option>
					</select>
				</label>
			</div>
			{dropHint && <p className="asset-drop-hint" role="status">{dropHint}</p>}
			{project.assets.length === 0 ? (
				<div className="empty-state compact-state">
					<span className="empty-glyph" aria-hidden="true">◇</span>
					<p>No images imported</p>
					<span>Drop a folder here to begin.</span>
				</div>
			) : entries.length === 0 ? (
				<div className="tree-empty">No images match “{query}”.</div>
			) : (
				<div className={`asset-list asset-density-${density}`} aria-label="Imported images">
					{entries.map((entry) => entry.kind === 'folder' ? (
						<div className="asset-folder-row" key={`folder:${entry.path}`} style={{ paddingLeft: `${8 + entry.depth * 12}px` }}>
							<span className="asset-glyph" aria-hidden="true">▾</span>
							<span>{entry.name}</span>
						</div>
					) : (
						<button
							aria-pressed={isSelected(selection, { kind: 'asset', id: entry.asset.id })}
							className="asset-row"
							draggable
							key={entry.asset.id}
							type="button"
							onClick={(event) => onSelectionChange(entry.asset.id, event.metaKey || event.ctrlKey)}
							onDragEnd={onDragEnd}
							onDragStart={(event) => onDragStartWithAsset(event, entry.asset.id)}
							onBlur={() => setHoveredAssetId(undefined)}
							onFocus={() => setHoveredAssetId(entry.asset.id)}
							onMouseEnter={() => setHoveredAssetId(entry.asset.id)}
							onMouseLeave={() => setHoveredAssetId(undefined)}
							style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
							title={`Image: ${entry.asset.relativePath} · Drag to the canvas or a slot`}
						>
							{density === 'thumbnail' && objectUrls.get(entry.asset.id) && <img alt="" className="asset-thumbnail" decoding="async" draggable={false} loading="lazy" src={objectUrls.get(entry.asset.id)} />}
							{density !== 'thumbnail' && <span className="asset-glyph" aria-hidden="true">▧</span>}
							<span>{entry.asset.name}<small>{density === 'compact' ? `${entry.asset.width} × ${entry.asset.height}` : entry.asset.relativePath}</small></span>
						</button>
					))}
				</div>
			)}
			{selectedAsset && (
				<section className="asset-preview" aria-label="Asset preview">
					<div className="asset-preview-image">
						{objectUrls.get(selectedAsset.asset.id) ? <img alt={`${selectedAsset.asset.name} preview`} decoding="async" draggable={false} src={objectUrls.get(selectedAsset.asset.id)} /> : <span aria-hidden="true">▧</span>}
					</div>
					<div>
						<strong>{selectedAsset.asset.name}</strong>
						<span>{selectedAsset.asset.width} × {selectedAsset.asset.height} · {selectedAsset.format}</span>
						<span>{selectedAsset.asset.relativePath}</span>
						<span>{selectedAsset.usage.length > 0 ? `Used by ${selectedAsset.usage.map(assetUsageLabelFor).join(', ')}` : 'Not used by a slot or attachment yet'}</span>
					</div>
				</section>
			)}
			{importSummary && (
				<section className="asset-import-summary" aria-label="Asset import summary" aria-live="polite" role="status">
					<strong>{importSummaryLabel(importSummary)}</strong>
					{(importSummary.skipped.length > 0 || importSummary.conflicts.length > 0 || importSummary.invalid.length > 0 || importSummary.unsupported.length > 0) && (
						<details>
							<summary>Show import details</summary>
							<ul>
								{importSummary.skipped.slice(0, IMPORT_DETAIL_LIMIT).map((item) => <li key={`skipped:${item.relativePath}`}><span>Skipped</span> {item.relativePath}: {item.reason}</li>)}
								{importSummary.conflicts.slice(0, Math.max(0, IMPORT_DETAIL_LIMIT - importSummary.skipped.length)).map((path) => <li key={`conflict:${path}`}><span>Conflict</span> {path}: an image with this path is already imported.</li>)}
								{importSummary.invalid.slice(0, Math.max(0, IMPORT_DETAIL_LIMIT - importSummary.skipped.length - importSummary.conflicts.length)).map((item) => <li key={`invalid:${item.relativePath}`}><span>Invalid</span> {item.relativePath}: {item.reason}</li>)}
								{importSummary.unsupported.slice(0, Math.max(0, IMPORT_DETAIL_LIMIT - importSummary.skipped.length - importSummary.conflicts.length - importSummary.invalid.length)).map((item) => <li key={`unsupported:${item.relativePath}`}><span>Unsupported</span> {item.relativePath}: {item.reason}</li>)}
							</ul>
							{importSummary.skipped.length + importSummary.conflicts.length + importSummary.invalid.length + importSummary.unsupported.length > IMPORT_DETAIL_LIMIT && <small>Showing the first {IMPORT_DETAIL_LIMIT} details.</small>}
						</details>
					)}
				</section>
			)}
			{(importMessage || isImporting) && <p className="muted-copy asset-import-status" aria-live="polite">{isImporting ? 'Importing images…' : importMessage}</p>}
		</section>
	);
};

export { ASSET_DRAG_MIME };
