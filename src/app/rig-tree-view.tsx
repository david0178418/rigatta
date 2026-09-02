import { useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import type { EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';
import {
	buildRigTreeViewModel,
	revealAncestors,
	selectableEntityForRigNode,
	treeNodeAfter,
	treeNodeForTypeahead,
	treeSelectionForClick,
	type RigTreeInteraction,
	type RigTreeNode
} from './rig-tree.ts';
import type { BoneDropZone } from './hierarchy-dnd.ts';
import type { SlotDropZone } from './slot-dnd.ts';
import { isSelected, type Selection } from './selection.ts';

const BONE_DRAG_MIME = 'application/x-bone-animation-bone';
const SLOT_DRAG_MIME = 'application/x-bone-animation-slot';
const ASSET_DRAG_MIME = 'application/x-bone-animation-asset';

export type RigTreeViewProps = Readonly<{
	project: Project;
	selection: Selection;
	expandedIds: ReadonlySet<EntityId>;
	searchQuery?: string;
	hiddenIds?: ReadonlySet<EntityId>;
	boneDropPreview?: Readonly<{ boneId: EntityId; zone: BoneDropZone }>;
	assetSlotDropPreview?: EntityId;
	slotOrderDropPreview?: Readonly<{ slotId: EntityId; zone: SlotDropZone }>;
	onSelectionChange: (selection: Selection) => void;
	onExpandedChange: (expandedIds: ReadonlySet<EntityId>) => void;
	onFocusChange?: (node: RigTreeNode) => void;
	onRenameRequest?: (node: RigTreeNode) => void;
	renamingId?: EntityId;
	onRenameCommit?: (node: RigTreeNode, name: string) => void;
	onRenameCancel?: () => void;
	onToggleVisibility?: (node: RigTreeNode) => void;
	onDragBone?: (event: ReactDragEvent<HTMLElement>, boneId: EntityId) => void;
	onDragOverBone?: (event: ReactDragEvent<HTMLElement>, boneId: EntityId) => void;
	onDropBone?: (event: ReactDragEvent<HTMLElement>, boneId: EntityId) => void;
	onDragSlot?: (event: ReactDragEvent<HTMLElement>, slotId: EntityId) => void;
	onDragOverSlot?: (event: ReactDragEvent<HTMLElement>, slotId: EntityId) => void;
	onDropSlot?: (event: ReactDragEvent<HTMLElement>, slotId: EntityId) => void;
	onAssetDragEnd?: () => void;
}>;

const matchesQuery = function matchesQuery(node: RigTreeNode, query: string): boolean {
	const normalized = query.trim().toLowerCase();

	return normalized.length === 0 || `${node.name} ${node.typeLabel}`.toLowerCase().includes(normalized);
};

const idsForFilteredTree = function idsForFilteredTree(
	model: ReturnType<typeof buildRigTreeViewModel>,
	query: string
): ReadonlySet<EntityId> {
	const matching = model.nodes.filter((node) => matchesQuery(node, query));

	return matching.reduce<ReadonlySet<EntityId>>(
		(current, node) => revealAncestors(model, node.id, current),
		new Set<EntityId>(matching.map((node) => node.id))
	);
};

const disclosureLabel = function disclosureLabel(node: RigTreeNode, expanded: boolean): string {
	return `${expanded ? 'Collapse' : 'Expand'} ${node.typeLabel.toLowerCase()} ${node.name}`;
};

export const RigTreeView = function RigTreeView({
	project,
	selection,
	expandedIds,
	searchQuery = '',
	hiddenIds = new Set<EntityId>(),
	boneDropPreview,
	assetSlotDropPreview,
	slotOrderDropPreview,
	onSelectionChange,
	onExpandedChange,
	onFocusChange,
	onRenameRequest,
	renamingId,
	onRenameCommit,
	onRenameCancel,
	onToggleVisibility,
	onDragBone,
	onDragOverBone,
	onDropBone,
	onDragSlot,
	onDragOverSlot,
	onDropSlot,
	onAssetDragEnd
}: RigTreeViewProps): ReactElement {
	const [focusedId, setFocusedId] = useState<EntityId | undefined>(selection.at(-1)?.id);
	const typeaheadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const typeaheadRef = useRef('');
	const anchorIdRef = useRef<EntityId | undefined>(selection.at(-1)?.id);
	const baseModel = buildRigTreeViewModel(project, selection, expandedIds);
	const filteredIds = searchQuery.trim().length > 0 ? idsForFilteredTree(baseModel, searchQuery) : undefined;
	const filterExpandedIds = filteredIds
		? [...filteredIds].reduce((current, id) => revealAncestors(baseModel, id, current), expandedIds)
		: expandedIds;
	const model = filterExpandedIds === expandedIds
		? baseModel
		: buildRigTreeViewModel(project, selection, filterExpandedIds);
	const visibleNodes = model.visibleNodes.filter((node) => !filteredIds || filteredIds.has(node.id));

	const setFocusedNode = function setFocusedNode(node: RigTreeNode | undefined): void {
		if (!node) {
			return;
		}

		setFocusedId(node.id);
		onFocusChange?.(node);
	};
	const focusNode = function focusNode(node: RigTreeNode | undefined): void {
		if (!node) {
			return;
		}

		setFocusedNode(node);
		window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-rig-row-id="${node.id}"]`)?.focus());
	};
	const toggleExpanded = function toggleExpanded(node: RigTreeNode): void {
		const next = new Set(expandedIds);

		if (next.has(node.id)) {
			next.delete(node.id);
		} else {
			next.add(node.id);
		}

		onExpandedChange(next);
	};
	const selectNode = function selectNode(node: RigTreeNode, interaction: RigTreeInteraction): void {
		const anchorId = anchorIdRef.current;

		anchorIdRef.current = node.id;
		setFocusedNode(node);
		onSelectionChange(treeSelectionForClick(selection, visibleNodes, node, {
			...interaction,
			anchorId
		}));
	};
	const onRowKeyDown = function onRowKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, node: RigTreeNode): void {
		const index = visibleNodes.findIndex((candidate) => candidate.id === node.id);
		const parent = node.parentId ? model.nodes.find((candidate) => candidate.id === node.parentId) : undefined;

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			if (node.expandable && !expandedIds.has(node.id)) {
				toggleExpanded(node);
				return;
			}

			focusNode(node.expandable ? visibleNodes[index + 1] : undefined);
			return;
		}
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			if (node.expandable && expandedIds.has(node.id)) {
				toggleExpanded(node);
				return;
			}

			focusNode(parent);
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			focusNode(treeNodeAfter(visibleNodes, node.id, -1));
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			focusNode(treeNodeAfter(visibleNodes, node.id, 1));
			return;
		}
		if (event.key === 'Home') {
			event.preventDefault();
			focusNode(visibleNodes[0]);
			return;
		}
		if (event.key === 'End') {
			event.preventDefault();
			focusNode(visibleNodes.at(-1));
			return;
		}
		if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			selectNode(node, event.key === ' ' ? { ctrlOrMeta: true } : {});
			return;
		}
		if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
			typeaheadRef.current = `${typeaheadRef.current}${event.key}`;
			if (typeaheadTimerRef.current !== undefined) {
				clearTimeout(typeaheadTimerRef.current);
			}
			typeaheadTimerRef.current = setTimeout(() => {
				typeaheadRef.current = '';
				typeaheadTimerRef.current = undefined;
			}, 700);
			focusNode(treeNodeForTypeahead(visibleNodes, typeaheadRef.current, node.id));
		}
	};
	const onInlineRenameKeyDown = function onInlineRenameKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, node: RigTreeNode): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			onRenameCommit?.(node, event.currentTarget.value);
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			onRenameCancel?.();
		}
	};

	return (
		<div className="rig-tree" role="tree" aria-label="Rig hierarchy" aria-multiselectable="true">
			{visibleNodes.length === 0 && <div className="tree-empty">No rig items match “{searchQuery}”.</div>}
			{visibleNodes.map((node, index) => {
				const isHidden = hiddenIds.has(node.id);
				const selected = isSelected(selection, selectableEntityForRigNode(node));
				const expanded = expandedIds.has(node.id) || Boolean(filteredIds?.has(node.id));
				const rowClasses = [
					node.kind === 'bone' ? 'bone-row' : node.kind === 'slot' ? 'slot-row' : 'attachment-row',
					selected ? 'is-selected' : '',
					node.activeAttachment ? 'is-active-attachment' : '',
					isHidden ? 'is-hidden-editor-item' : '',
					node.kind === 'bone' && boneDropPreview?.boneId === node.id ? `drop-${boneDropPreview.zone}` : '',
					node.kind === 'slot' && assetSlotDropPreview === node.id ? 'drop-target' : '',
					node.kind === 'slot' && slotOrderDropPreview?.slotId === node.id ? `drop-order-${slotOrderDropPreview.zone}` : ''
				].filter(Boolean).join(' ');

				return (
					<div
						aria-expanded={node.expandable ? expanded : undefined}
						aria-level={node.depth + 1}
						aria-posinset={index + 1}
						aria-selected={selected}
						className="rig-tree-item"
						key={node.id}
						role="treeitem"
						data-rig-tree-id={node.id}
						style={{ paddingLeft: `${node.depth * 16}px` }}
					>
						{node.expandable && (
							<button
								aria-describedby={`rig-node-description-${node.id}`}
								aria-label={expanded ? 'Collapse' : 'Expand'}
								className="tree-disclosure"
								type="button"
								title={disclosureLabel(node, expanded)}
								onClick={() => toggleExpanded(node)}
							>
								{expanded ? '▾' : '▸'}
							</button>
						)}
						{!node.expandable && <span className="tree-disclosure-placeholder" aria-hidden="true" />}
						{renamingId === node.id ? (
							<input
								aria-label={`Rename ${node.name}`}
								autoFocus
								className="rig-inline-rename"
								defaultValue={node.name}
								key={`rename:${node.id}:${node.name}`}
								onBlur={(event) => onRenameCommit?.(node, event.currentTarget.value)}
								onKeyDown={(event) => onInlineRenameKeyDown(event, node)}
							/>
		) : <button
			aria-label={node.name}
			aria-pressed={selected}
							className={rowClasses}
							data-bone-id={node.kind === 'bone' ? node.id : undefined}
							data-parent-id={node.kind === 'bone' ? node.parentId ?? 'root' : undefined}
							data-rig-row-id={node.id}
							data-slot-id={node.kind === 'slot' ? node.id : undefined}
							data-draw-order-index={node.kind === 'slot' ? project.setupDrawOrder.indexOf(node.id) : undefined}
							draggable={node.kind === 'bone' || node.kind === 'slot'}
							role="button"
							tabIndex={focusedId === node.id || (focusedId === undefined && index === 0) ? 0 : -1}
							title={`${node.typeLabel}: ${node.name}${node.activeAttachment ? ' · setup attachment' : ''}`}
							type="button"
							onClick={(event) => selectNode(node, { ctrlOrMeta: event.metaKey || event.ctrlKey, shift: event.shiftKey })}
							onDoubleClick={() => onRenameRequest?.(node)}
							onFocus={() => setFocusedNode(node)}
							onKeyDown={(event) => onRowKeyDown(event, node)}
							onDragStart={(event) => {
								if (node.kind === 'bone') {
									onDragBone?.(event, node.id);
								}
								if (node.kind === 'slot') {
									onDragSlot?.(event, node.id);
								}
							}}
							onDragEnd={onAssetDragEnd}
							onDragOver={(event) => {
								if (node.kind === 'bone') {
									onDragOverBone?.(event, node.id);
								}
								if (node.kind === 'slot') {
									onDragOverSlot?.(event, node.id);
								}
							}}
							onDrop={(event) => {
								if (node.kind === 'bone') {
									onDropBone?.(event, node.id);
								}
								if (node.kind === 'slot') {
									onDropSlot?.(event, node.id);
								}
							}}
						> 
							<span className={`rig-icon rig-icon-${node.kind}`} aria-hidden="true">{node.kind === 'bone' ? '●' : node.kind === 'slot' ? '↳' : node.kind === 'image' ? '▧' : node.kind === 'point' ? '◇' : '□'}</span>
							<span className="rig-row-name">{node.name}</span>
							<span className="rig-row-type">{node.typeLabel}</span>
						</button>}
		{onToggleVisibility && node.kind !== 'slot' && (
			<button
				aria-describedby={`rig-node-description-${node.id}`}
				aria-label={isHidden ? 'Show' : 'Hide'}
				className={isHidden ? 'tree-visibility is-hidden' : 'tree-visibility'}
				type="button"
				title={`${isHidden ? 'Show' : 'Hide'} ${node.typeLabel.toLowerCase()} ${node.name}`}
				onClick={() => onToggleVisibility(node)}
							>
				{isHidden ? '◌' : '◉'}
			</button>
		)}
		<span className="sr-only" id={`rig-node-description-${node.id}`}>{node.typeLabel}: {node.name}</span>
	</div>
				);
			})}
		</div>
	);
};

export { ASSET_DRAG_MIME, BONE_DRAG_MIME, SLOT_DRAG_MIME };
