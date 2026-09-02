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
	type RigTreeEntityKind,
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

const rigIconMarks: Readonly<Record<RigTreeEntityKind, ReactElement>> = {
	bone: <circle cx="8" cy="8" r="3.5" />,
	slot: <path d="M3 2.5v11M3 8h5m0 0 3-3m-3 3 3 3" />,
	image: <>
		<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
		<circle cx="6" cy="6" r="1" />
		<path d="m3.5 11 2.5-2.5 2 2 1.5-1.5 2.5 2.5" />
	</>,
	point: <>
		<circle cx="8" cy="8" r="3" />
		<path d="M8 2v3m0 6v3M2 8h3m6 0h3" />
	</>,
	rectangle: <rect x="3" y="3" width="10" height="10" rx="1" />
};

const RigIcon = function RigIcon({ kind }: Readonly<{ kind: RigTreeEntityKind }>): ReactElement {
	return (
		<svg
			aria-hidden="true"
			className={`rig-icon rig-icon-${kind}`}
			fill="none"
			focusable="false"
			viewBox="0 0 16 16"
			xmlns="http://www.w3.org/2000/svg"
		>
			{rigIconMarks[kind]}
		</svg>
	);
};

const DisclosureIcon = function DisclosureIcon({ expanded }: Readonly<{ expanded: boolean }>): ReactElement {
	return (
		<svg
			aria-hidden="true"
			className="rig-control-icon"
			fill="none"
			focusable="false"
			viewBox="0 0 16 16"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d={expanded ? 'm3.5 6 4.5 4 4.5-4' : 'm6 3.5 4.5 4.5L6 12.5'} />
		</svg>
	);
};

const VisibilityIcon = function VisibilityIcon({ hidden }: Readonly<{ hidden: boolean }>): ReactElement {
	return (
		<svg
			aria-hidden="true"
			className="rig-control-icon"
			fill="none"
			focusable="false"
			viewBox="0 0 16 16"
			xmlns="http://www.w3.org/2000/svg"
		>
			{hidden ? <>
				<path d="M2 8s2.2-3.5 6-3.5S14 8 14 8s-2.2 3.5-6 3.5S2 8 2 8Z" />
				<path d="m3 3 10 10" />
			</> : <>
				<path d="M2 8s2.2-3.5 6-3.5S14 8 14 8s-2.2 3.5-6 3.5S2 8 2 8Z" />
				<circle cx="8" cy="8" r="1.5" />
			</>}
		</svg>
	);
};

const relationshipDescription = function relationshipDescription(
	node: RigTreeNode,
	nodes: readonly RigTreeNode[]
): string {
	if (!node.parentId) {
		return 'Root item';
	}

	const parent = nodes.find((candidate) => candidate.id === node.parentId);

	return parent
		? `Child of ${parent.typeLabel.toLowerCase()} ${parent.name}`
		: 'Parent reference unavailable';
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
	const activeFocusedId = focusedId && visibleNodes.some((node) => node.id === focusedId)
		? focusedId
		: visibleNodes[0]?.id;
	const siblingNodesFor = function siblingNodesFor(node: RigTreeNode): readonly RigTreeNode[] {
		return model.nodes.filter((candidate) => candidate.parentId === node.parentId
			&& (!filteredIds || filteredIds.has(candidate.id)));
	};

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
		window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-rig-treeitem-id="${node.id}"]`)?.focus());
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
		focusNode(node);
		onSelectionChange(treeSelectionForClick(selection, visibleNodes, node, {
			...interaction,
			anchorId
		}));
	};
	const onRowKeyDown = function onRowKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, node: RigTreeNode): void {
		if (event.target instanceof HTMLInputElement
			|| event.target instanceof HTMLTextAreaElement
			|| event.target instanceof HTMLSelectElement) {
			return;
		}

		const parent = node.parentId ? model.nodes.find((candidate) => candidate.id === node.parentId) : undefined;
		const firstChild = visibleNodes.find((candidate) => candidate.parentId === node.id);

		if (event.key === 'ArrowRight') {
			event.preventDefault();
			if (node.expandable && !expandedIds.has(node.id)) {
				toggleExpanded(node);
				return;
			}

			focusNode(node.expandable ? firstChild : undefined);
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
			{visibleNodes.map((node) => {
				const isHidden = hiddenIds.has(node.id);
				const selected = isSelected(selection, selectableEntityForRigNode(node));
				const multiSelected = selected && selection.length > 1;
				const expanded = expandedIds.has(node.id) || Boolean(filteredIds?.has(node.id));
				const siblings = siblingNodesFor(node);
				const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);
				const relationship = relationshipDescription(node, model.nodes);
				const nodeDescription = [
					`${node.typeLabel}: ${node.name}.`,
					`${relationship}.`,
					multiSelected ? 'Part of the current multi-selection.' : selected ? 'Selected.' : '',
					node.activeAttachment ? 'Active setup attachment.' : '',
					isHidden ? 'Hidden in the editor.' : ''
				].filter(Boolean).join(' ');
				const rowClasses = [
					node.kind === 'bone' ? 'bone-row' : node.kind === 'slot' ? 'slot-row' : 'attachment-row',
					selected ? 'is-selected' : '',
					multiSelected ? 'is-multi-selected' : '',
					node.activeAttachment ? 'is-active-attachment' : '',
					isHidden ? 'is-hidden-editor-item' : '',
					node.kind === 'bone' && boneDropPreview?.boneId === node.id ? `drop-${boneDropPreview.zone}` : '',
					node.kind === 'slot' && assetSlotDropPreview === node.id ? 'drop-target' : '',
					node.kind === 'slot' && slotOrderDropPreview?.slotId === node.id ? `drop-order-${slotOrderDropPreview.zone}` : ''
				].filter(Boolean).join(' ');

				return (
					<div
						aria-expanded={node.expandable ? expanded : undefined}
						aria-label={`${node.typeLabel}: ${node.name}`}
						aria-level={node.depth + 1}
						aria-posinset={Math.max(0, siblingIndex) + 1}
						aria-selected={selected}
						aria-setsize={siblings.length}
						aria-describedby={`rig-node-description-${node.id}`}
						className="rig-tree-item"
						key={node.id}
						role="treeitem"
						data-rig-tree-id={node.id}
						data-rig-treeitem-id={node.id}
						data-selection-state={multiSelected ? 'multi-selected' : selected ? 'selected' : 'unselected'}
						data-active-attachment={node.activeAttachment ? 'true' : 'false'}
						style={{ paddingLeft: `${node.depth * 16}px` }}
						tabIndex={activeFocusedId === node.id ? 0 : -1}
						onFocus={() => setFocusedNode(node)}
						onKeyDown={(event) => onRowKeyDown(event, node)}
					>
						{node.expandable && (
							<button
								aria-describedby={`rig-node-description-${node.id}`}
								aria-label={expanded ? 'Collapse' : 'Expand'}
								className="tree-disclosure"
								tabIndex={-1}
								type="button"
								title={disclosureLabel(node, expanded)}
								onClick={(event) => {
									event.stopPropagation();
									toggleExpanded(node);
									focusNode(node);
								}}
								onKeyDown={(event) => event.stopPropagation()}
							>
								<DisclosureIcon expanded={expanded} />
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
								aria-describedby={`rig-node-description-${node.id}`}
								className={rowClasses}
							data-bone-id={node.kind === 'bone' ? node.id : undefined}
							data-parent-id={node.kind === 'bone' ? node.parentId ?? 'root' : undefined}
							data-rig-row-id={node.id}
							data-slot-id={node.kind === 'slot' ? node.id : undefined}
								data-draw-order-index={node.kind === 'slot' ? project.setupDrawOrder.indexOf(node.id) : undefined}
								draggable={node.kind === 'bone' || node.kind === 'slot'}
								role="button"
								tabIndex={-1}
								title={`${node.typeLabel}: ${node.name} · ${relationship}${node.activeAttachment ? ' · active setup attachment' : ''}`}
								type="button"
								onClick={(event) => selectNode(node, { ctrlOrMeta: event.metaKey || event.ctrlKey, shift: event.shiftKey })}
								onDoubleClick={() => onRenameRequest?.(node)}
								onFocus={() => setFocusedNode(node)}
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
							<RigIcon kind={node.kind} />
							<span className="rig-row-name">{node.name}</span>
							<span className="rig-row-type">{node.typeLabel}</span>
						</button>}
		{onToggleVisibility && node.kind !== 'slot' && (
							<button
								aria-describedby={`rig-node-description-${node.id}`}
								aria-label={isHidden ? 'Show' : 'Hide'}
								className={isHidden ? 'tree-visibility is-hidden' : 'tree-visibility'}
								tabIndex={-1}
								type="button"
									 title={`${isHidden ? 'Show' : 'Hide'} ${node.typeLabel.toLowerCase()} ${node.name}`}
								onClick={(event) => {
									event.stopPropagation();
									onToggleVisibility(node);
									focusNode(node);
								}}
								onKeyDown={(event) => event.stopPropagation()}
							>
								<VisibilityIcon hidden={isHidden} />
							</button>
						)}
						<span className="sr-only" id={`rig-node-description-${node.id}`}>{nodeDescription}</span>
	</div>
				);
			})}
		</div>
	);
};

export { ASSET_DRAG_MIME, BONE_DRAG_MIME, SLOT_DRAG_MIME };
