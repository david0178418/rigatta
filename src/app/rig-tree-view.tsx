import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
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
import { Tooltip } from './ui-primitives.tsx';

const BONE_DRAG_MIME = 'application/x-rigatta-bone';
const SLOT_DRAG_MIME = 'application/x-rigatta-slot';
const ASSET_DRAG_MIME = 'application/x-rigatta-asset';

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
	onRenameCommit?: (node: RigTreeNode, name: string) => boolean | void;
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

export type RigTreeFilter = Readonly<{
	matchingIds: ReadonlySet<EntityId>;
	contextIds: ReadonlySet<EntityId>;
	visibleIds: ReadonlySet<EntityId>;
}>;

const searchTermsFor = function searchTermsFor(query: string): readonly string[] {
	return query.trim().toLowerCase().split(/\s+/).filter((term) => term.length > 0);
};

export const rigTreeNodeMatchesQuery = function rigTreeNodeMatchesQuery(node: RigTreeNode, query: string): boolean {
	const terms = searchTermsFor(query);
	const name = node.name.trim().toLowerCase();
	const type = node.typeLabel.trim().toLowerCase();

	return terms.length === 0 || terms.every((term) => name.includes(term) || type.includes(term));
};

export const rigTreeFilterForQuery = function rigTreeFilterForQuery(
	model: ReturnType<typeof buildRigTreeViewModel>,
	query: string
	): RigTreeFilter | undefined {
	if (searchTermsFor(query).length === 0) {
		return undefined;
	}

	const matching = model.nodes.filter((node) => rigTreeNodeMatchesQuery(node, query));
	const matchingIds = new Set<EntityId>(matching.map((node) => node.id));
	const visibleIds = matching.reduce<ReadonlySet<EntityId>>(
		(current, node) => revealAncestors(model, node.id, current),
		matchingIds
	);
	const contextIds = new Set([...visibleIds].filter((id) => !matchingIds.has(id)));

	return Object.freeze({ matchingIds, contextIds, visibleIds });
};

export const rigRenameValidationMessageFor = function rigRenameValidationMessageFor(
	project: Project,
	node: RigTreeNode,
	name: string
): string | undefined {
	const normalizedName = name.trim();

	if (normalizedName.length === 0) {
		return 'Name cannot be empty.';
	}

	const names = node.kind === 'bone'
		? project.bones
		: node.kind === 'slot'
			? project.slots
			: project.attachments;
	const duplicate = names.some((candidate) => candidate.id !== node.id && candidate.name.trim() === normalizedName);

	return duplicate ? `A ${node.typeLabel.toLowerCase()} named “${normalizedName}” already exists.` : undefined;
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

type RenameSessionState = 'editing' | 'committing' | 'completed' | 'cancelled';

const focusRigTreeItem = function focusRigTreeItem(id: EntityId): void {
	window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-rig-treeitem-id="${id}"]`)?.focus());
};

const RigInlineRename = function RigInlineRename({
	project,
	node,
	onCommit,
	onCancel
}: Readonly<{
	project: Project;
	node: RigTreeNode;
	onCommit?: (node: RigTreeNode, name: string) => boolean | void;
	onCancel?: () => void;
}>): ReactElement {
	const [draft, setDraft] = useState(node.name);
	const [error, setError] = useState<string | undefined>(undefined);
	const inputRef = useRef<HTMLInputElement>(null);
	const sessionStateRef = useRef<RenameSessionState>('editing');
	const errorId = `rig-rename-error-${node.id}`;
	const descriptionId = `rig-node-description-${node.id}`;

	const refocusInput = function refocusInput(): void {
		window.requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.select();
		});
	};
	const finishAndFocusRow = function finishAndFocusRow(): void {
		focusRigTreeItem(node.id);
	};
	const cancel = function cancel(): void {
		if (sessionStateRef.current !== 'editing') {
			return;
		}

		sessionStateRef.current = 'cancelled';
		onCancel?.();
		finishAndFocusRow();
	};
	const commit = function commit(value: string): void {
		if (sessionStateRef.current !== 'editing') {
			return;
		}

		const normalizedName = value.trim();
		const validationMessage = rigRenameValidationMessageFor(project, node, normalizedName);

		if (validationMessage) {
			setError(validationMessage);
			refocusInput();
			return;
		}
		if (normalizedName === node.name.trim()) {
			sessionStateRef.current = 'completed';
			onCancel?.();
			finishAndFocusRow();
			return;
		}

		sessionStateRef.current = 'committing';
		const committed = onCommit?.(node, normalizedName);

		if (committed === false) {
			sessionStateRef.current = 'editing';
			setError('The name could not be committed.');
			refocusInput();
			return;
		}

		sessionStateRef.current = 'completed';
		finishAndFocusRow();
	};

	return (
		<div className="rig-inline-rename-field">
			<RigIcon kind={node.kind} />
			<input
				aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
				aria-invalid={error ? 'true' : undefined}
				aria-label={`Rename ${node.name}`}
				autoFocus
				className="rig-inline-rename"
				ref={inputRef}
				value={draft}
				onBlur={(event) => commit(event.currentTarget.value)}
				onChange={(event) => {
					setDraft(event.currentTarget.value);
					setError(undefined);
				}}
				onFocus={(event) => event.currentTarget.select()}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						event.stopPropagation();
						commit(event.currentTarget.value);
						return;
					}
					if (event.key === 'Escape') {
						event.preventDefault();
						event.stopPropagation();
						cancel();
					}
				}}
			/>
			{error && <span className="rig-inline-rename-error" id={errorId} role="alert">{error}</span>}
		</div>
	);
};

const setsMatch = function setsMatch(left: ReadonlySet<EntityId>, right: ReadonlySet<EntityId>): boolean {
	return left.size === right.size && [...left].every((id) => right.has(id));
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
	const filterSessionRef = useRef<Readonly<{
		expandedIds: ReadonlySet<EntityId>;
		focusedId: EntityId | undefined;
	}> | undefined>(undefined);
	const filterFocusRestoreIdRef = useRef<EntityId | undefined>(undefined);
	const previousSelectedRigIdRef = useRef<EntityId | undefined>(selection.filter((entity) => entity.kind !== 'asset').at(-1)?.id);
	const baseModel = buildRigTreeViewModel(project, selection, expandedIds);
	const filter = rigTreeFilterForQuery(baseModel, searchQuery);
	const filterExpandedIds = filter
		? [...filter.visibleIds].reduce((current, id) => revealAncestors(baseModel, id, current), expandedIds)
		: expandedIds;
	const model = filter
		? buildRigTreeViewModel(project, selection, filterExpandedIds)
		: baseModel;
	const visibleNodes = model.visibleNodes.filter((node) => !filter || filter.visibleIds.has(node.id));
	const activeFocusedId = focusedId && visibleNodes.some((node) => node.id === focusedId)
		? focusedId
		: visibleNodes[0]?.id;
	const filterActive = filter !== undefined;
	const visibleNodeIds = visibleNodes.map((node) => node.id).join('|');
	const modelNodeIds = model.nodes.map((node) => node.id).join('|');
	const expandedIdKey = [...expandedIds].join('|');
	const selectedRigId = selection.filter((entity) => entity.kind !== 'asset').at(-1)?.id;

	useEffect(() => {
		if (filterActive) {
			if (!filterSessionRef.current) {
				filterSessionRef.current = {
					expandedIds: new Set(expandedIds),
					focusedId
				};
			}

			return;
		}

		const snapshot = filterSessionRef.current;

		if (!snapshot) {
			return;
		}

		filterSessionRef.current = undefined;
		filterFocusRestoreIdRef.current = snapshot.focusedId;

		if (!setsMatch(snapshot.expandedIds, expandedIds)) {
			onExpandedChange(new Set(snapshot.expandedIds));
		}
	}, [expandedIds, filterActive, focusedId, onExpandedChange]);

	useEffect(() => {
		if (filterActive) {
			return;
		}

		const focusId = filterFocusRestoreIdRef.current;

		if (!focusId) {
			return;
		}
		if (!model.nodes.some((node) => node.id === focusId)) {
			filterFocusRestoreIdRef.current = undefined;
			return;
		}
		if (!visibleNodes.some((node) => node.id === focusId)) {
			return;
		}

		filterFocusRestoreIdRef.current = undefined;
		window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-rig-treeitem-id="${focusId}"]`)?.focus());
	}, [filterActive, model.nodes, visibleNodeIds]);

	useEffect(() => {
		const selectionChanged = previousSelectedRigIdRef.current !== selectedRigId;

		previousSelectedRigIdRef.current = selectedRigId;

		if (!selectedRigId || filterActive) {
			return;
		}

		const selectedNode = model.nodes.find((node) => node.id === selectedRigId);

		if (!selectedNode) {
			return;
		}
		if (!visibleNodes.some((node) => node.id === selectedRigId)) {
			if (!selectionChanged) {
				return;
			}

			const revealed = new Set(revealAncestors(model, selectedRigId, expandedIds));

			if (selectedNode.kind === 'bone') {
				revealed.add(selectedNode.id);
			}
			if (!setsMatch(revealed, expandedIds)) {
				onExpandedChange(revealed);
			}

			return;
		}

		window.requestAnimationFrame(() => {
			document.querySelector<HTMLElement>(`[data-rig-treeitem-id="${selectedRigId}"]`)?.scrollIntoView?.({ block: 'nearest' });
		});
	}, [expandedIdKey, filterActive, modelNodeIds, onExpandedChange, selectedRigId, visibleNodeIds]);

	const siblingNodesFor = function siblingNodesFor(node: RigTreeNode): readonly RigTreeNode[] {
		return model.nodes.filter((candidate) => candidate.parentId === node.parentId
			&& (!filter || filter.visibleIds.has(candidate.id)));
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
		if (filterActive) {
			focusNode(node);
			return;
		}

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
		if (event.key.toLowerCase() === 'f2') {
			event.preventDefault();
			event.stopPropagation();
			onRenameRequest?.(node);
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
	const filterStatus = filter
		? filter.matchingIds.size === 0
			? `No rig items match “${searchQuery.trim()}”. Filtered-out branches are hidden; saved collapsed state is unchanged.`
			: `Showing ${filter.matchingIds.size} matching rig ${filter.matchingIds.size === 1 ? 'item' : 'items'}${filter.contextIds.size > 0 ? ` and ${filter.contextIds.size} context ${filter.contextIds.size === 1 ? 'ancestor' : 'ancestors'}` : ''}. Filtered-out branches are hidden; saved collapsed state returns when search clears.`
		: undefined;

	return (
		<div
			aria-describedby={filterStatus ? 'rig-tree-filter-status' : undefined}
			className={filterActive ? 'rig-tree is-filter-active' : 'rig-tree'}
			data-filter-active={filterActive ? 'true' : 'false'}
			role="tree"
			aria-label="Rig hierarchy"
			aria-multiselectable="true"
		>
			{filterStatus && <div className="rig-tree-filter-status" id="rig-tree-filter-status" role="status">{filterStatus}</div>}
			{visibleNodes.length === 0 && <div className="tree-empty">No rig items match “{searchQuery.trim()}”.</div>}
			{visibleNodes.map((node) => {
				const isHidden = hiddenIds.has(node.id);
				const selected = isSelected(selection, selectableEntityForRigNode(node));
				const multiSelected = selected && selection.length > 1;
				const filterState = !filter ? 'none' : filter.matchingIds.has(node.id) ? 'match' : 'context';
				const expandedByFilter = Boolean(filter?.contextIds.has(node.id) && !expandedIds.has(node.id));
				const expanded = expandedByFilter || expandedIds.has(node.id);
				const expansionState = !node.expandable
					? 'leaf'
					: expandedByFilter && !expandedIds.has(node.id)
						? 'filter-expanded'
						: expanded
							? 'expanded'
							: 'collapsed';
				const siblings = siblingNodesFor(node);
				const siblingIndex = siblings.findIndex((candidate) => candidate.id === node.id);
				const relationship = relationshipDescription(node, model.nodes);
				const nodeDescriptionId = `rig-node-description-${node.id}`;
				const filterDescriptionId = `rig-node-filter-description-${node.id}`;
				const nodeDescription = [
					`${node.typeLabel}: ${node.name}.`,
					`${relationship}.`,
					multiSelected ? 'Part of the current multi-selection.' : selected ? 'Selected.' : '',
					node.activeAttachment ? 'Active setup attachment.' : '',
					isHidden ? 'Hidden in the editor.' : '',
					!filter && node.expandable && !expanded ? 'Collapsed.' : ''
				].filter(Boolean).join(' ');
				const filterDescription = filterState === 'context'
					? 'Search context ancestor. This row is shown to reveal a matching descendant and is not itself a search match.'
					: filterState === 'match'
						? 'Matches the active Rig search.'
						: '';
				const expansionDescription = filter && expandedByFilter && !expandedIds.has(node.id) && node.expandable
					? 'Expanded by search to reveal matches. Its saved collapsed state will return when search clears.'
					: '';
				const rowClasses = [
					node.kind === 'bone' ? 'bone-row' : node.kind === 'slot' ? 'slot-row' : 'attachment-row',
					selected ? 'is-selected' : '',
					multiSelected ? 'is-multi-selected' : '',
					node.activeAttachment ? 'is-active-attachment' : '',
					isHidden ? 'is-hidden-editor-item' : '',
					filterState === 'context' ? 'is-filter-context' : '',
					filterState === 'match' ? 'is-filter-match' : '',
					node.kind === 'bone' && boneDropPreview?.boneId === node.id ? `drop-${boneDropPreview.zone}` : '',
					node.kind === 'slot' && assetSlotDropPreview === node.id ? 'drop-target' : '',
					node.kind === 'slot' && slotOrderDropPreview?.slotId === node.id ? `drop-order-${slotOrderDropPreview.zone}` : ''
				].filter(Boolean).join(' ');
				const rowDescriptionIds = [nodeDescriptionId, filterDescription ? filterDescriptionId : ''].filter(Boolean).join(' ');
				const disclosureTitle = filter && expandedByFilter
					? `Expanded to show search matches for ${node.typeLabel.toLowerCase()} ${node.name}; clear search to restore saved expansion.`
					: disclosureLabel(node, expanded);

				return (
					<div
						aria-expanded={node.expandable ? expanded : undefined}
						aria-label={`${node.typeLabel}: ${node.name}`}
						aria-level={node.depth + 1}
						aria-posinset={Math.max(0, siblingIndex) + 1}
						aria-selected={selected}
						aria-setsize={siblings.length}
						aria-describedby={rowDescriptionIds}
						className={`rig-tree-item ${filterState === 'context' ? 'is-filter-context' : ''}`}
						key={node.id}
						role="treeitem"
						data-rig-tree-id={node.id}
						data-rig-treeitem-id={node.id}
						data-selection-state={multiSelected ? 'multi-selected' : selected ? 'selected' : 'unselected'}
						data-active-attachment={node.activeAttachment ? 'true' : 'false'}
						data-filter-state={filterState}
						data-expanded-by-filter={expandedByFilter ? 'true' : 'false'}
						data-expansion-state={expansionState}
						style={{ paddingLeft: `${node.depth * 16}px` }}
						tabIndex={activeFocusedId === node.id ? 0 : -1}
						onFocus={() => setFocusedNode(node)}
						onKeyDown={(event) => onRowKeyDown(event, node)}
					>
						{node.expandable && (
							<Tooltip className="tree-disclosure-tooltip" label={disclosureTitle}>
								<button
									aria-describedby={rowDescriptionIds}
									aria-expanded={expanded}
									aria-label={expanded ? 'Collapse' : 'Expand'}
									className="tree-disclosure"
									data-expanded-by-filter={expandedByFilter ? 'true' : 'false'}
									tabIndex={-1}
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										toggleExpanded(node);
										focusNode(node);
									}}
									onKeyDown={(event) => event.stopPropagation()}
								>
									<DisclosureIcon expanded={expanded} />
								</button>
							</Tooltip>
						)}
						{!node.expandable && <span className="tree-disclosure-placeholder" aria-hidden="true" />}
						{renamingId === node.id ? (
							<RigInlineRename
								node={node}
								onCancel={onRenameCancel}
								onCommit={onRenameCommit}
								project={project}
							/>
						) : <button
								aria-label={node.name}
								aria-pressed={selected}
								aria-describedby={rowDescriptionIds}
								className={rowClasses}
								data-bone-id={node.kind === 'bone' ? node.id : undefined}
								data-parent-id={node.kind === 'bone' ? node.parentId ?? 'root' : undefined}
								data-rig-row-id={node.id}
								data-slot-id={node.kind === 'slot' ? node.id : undefined}
								data-filter-state={filterState}
								data-draw-order-index={node.kind === 'slot' ? project.setupDrawOrder.indexOf(node.id) : undefined}
								draggable={node.kind === 'bone' || node.kind === 'slot'}
								role="button"
								tabIndex={-1}
								title={`${node.typeLabel}: ${node.name} · ${relationship}${node.activeAttachment ? ' · active setup attachment' : ''}${filterState === 'context' ? ' · search context ancestor' : ''}`}
								type="button"
								onMouseDown={(event) => {
									if (event.detail < 2) {
										return;
									}

									event.preventDefault();
									onRenameRequest?.(node);
								}}
								onDoubleClick={(event) => {
									event.preventDefault();
									onRenameRequest?.(node);
								}}
								onClick={(event) => {
									selectNode(node, { ctrlOrMeta: event.metaKey || event.ctrlKey, shift: event.shiftKey });
								}}
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
								{filterState === 'context' && <span className="rig-row-filter-state" aria-hidden="true">context</span>}
								{filterState === 'match' && <span className="rig-row-filter-state is-match" aria-hidden="true">match</span>}
							</button>}
						{onToggleVisibility && node.kind !== 'slot' && (
							<Tooltip className="tree-visibility-tooltip" label={`${isHidden ? 'Show' : 'Hide'} ${node.typeLabel.toLowerCase()} ${node.name}`}>
								<button
									aria-describedby={rowDescriptionIds}
									aria-label={isHidden ? 'Show' : 'Hide'}
									aria-pressed={!isHidden}
									className={isHidden ? 'tree-visibility is-hidden' : 'tree-visibility'}
									tabIndex={-1}
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										onToggleVisibility(node);
										focusNode(node);
									}}
									onKeyDown={(event) => event.stopPropagation()}
								>
									<VisibilityIcon hidden={isHidden} />
								</button>
							</Tooltip>
						)}
						<span className="sr-only" id={nodeDescriptionId}>{nodeDescription}</span>
						{filterDescription && <span className="sr-only" id={filterDescriptionId}>{`${filterDescription} ${expansionDescription}`}</span>}
					</div>
				);
			})}
		</div>
	);
};

export { ASSET_DRAG_MIME, BONE_DRAG_MIME, SLOT_DRAG_MIME };
