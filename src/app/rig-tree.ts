import type { EntityId } from '../domain/ids.ts';
import type { Attachment, Project } from '../domain/model.ts';
import { isSelected, type SelectableEntity, type Selection } from './selection.ts';

export type RigTreeEntityKind = 'bone' | 'slot' | 'image' | 'point' | 'rectangle';

export type RigTreeNode = Readonly<{
	id: EntityId;
	kind: RigTreeEntityKind;
	selectableKind: Extract<SelectableEntity['kind'], 'bone' | 'slot' | 'attachment'>;
	parentId: EntityId | null;
	depth: number;
	name: string;
	children: readonly EntityId[];
	selected: boolean;
	activeAttachment: boolean;
	expandable: boolean;
	typeLabel: string;
	}>;

export type RigTreeViewModel = Readonly<{
	nodes: readonly RigTreeNode[];
	visibleNodes: readonly RigTreeNode[];
	rootIds: readonly EntityId[];
	}>;

export type RigTreeInteraction = Readonly<{
	ctrlOrMeta?: boolean;
	shift?: boolean;
	anchorId?: EntityId;
}>;

const selectableEntityFor = function selectableEntityFor(node: RigTreeNode): SelectableEntity {
	return {
		kind: node.selectableKind,
		id: node.id
	};
};

const attachmentKindFor = function attachmentKindFor(attachment: Attachment): RigTreeEntityKind {
	return attachment.kind;
};

const typeLabelFor = function typeLabelFor(kind: RigTreeEntityKind): string {
	const labels: Readonly<Record<RigTreeEntityKind, string>> = {
		bone: 'Bone',
		slot: 'Slot',
		image: 'Image attachment',
		point: 'Point attachment',
		rectangle: 'Rectangle attachment'
	};

	return labels[kind];
};

const parentIdForAttachment = function parentIdForAttachment(
	project: Project,
	attachment: Attachment
): EntityId | null {
	if (attachment.kind === 'image') {
		return project.slots.some((slot) => slot.id === attachment.slotId) ? attachment.slotId : null;
	}

	return project.bones.some((bone) => bone.id === attachment.boneId) ? attachment.boneId : null;
};

const knownParentId = function knownParentId(
	project: Project,
	kind: RigTreeEntityKind,
	parentId: EntityId | null
): EntityId | null {
	if (!parentId) {
		return null;
	}

	const valid = kind === 'bone'
		? project.bones.some((bone) => bone.id === parentId)
		: kind === 'slot' || kind === 'point' || kind === 'rectangle'
			? project.bones.some((bone) => bone.id === parentId)
			: project.slots.some((slot) => slot.id === parentId);

	return valid ? parentId : null;
};

const uniqueIds = function uniqueIds(ids: readonly EntityId[]): readonly EntityId[] {
	return ids.filter((id, index) => ids.indexOf(id) === index);
};

const nodeIdOrder = function nodeIdOrder(project: Project): readonly EntityId[] {
	const boneIds = project.bones.map((bone) => bone.id);
	const slotIds = project.slots.map((slot) => slot.id);
	const orderedBones = uniqueIds(project.boneOrder.filter((id) => boneIds.includes(id)));
	const missingBones = uniqueIds(boneIds).filter((id) => !orderedBones.includes(id));
	const orderedSlots = uniqueIds(slotIds);
	const missingSlots: readonly EntityId[] = [];
	const attachments = uniqueIds(project.attachments.map((attachment) => attachment.id));

	return [...orderedBones, ...missingBones, ...orderedSlots, ...missingSlots, ...attachments];
};

const cycleBoneIds = function cycleBoneIds(project: Project): ReadonlySet<EntityId> {
	const parentById = new Map(project.bones.map((bone) => [
		bone.id,
		knownParentId(project, 'bone', bone.parentId)
	] as const));
	const cycleFor = function cycleFor(
		id: EntityId,
		path: readonly EntityId[]
	): readonly EntityId[] {
		const cycleStart = path.indexOf(id);

		if (cycleStart >= 0) {
			return path.slice(cycleStart);
		}

		const parentId = parentById.get(id);

		return parentId && parentById.has(parentId)
			? cycleFor(parentId, [...path, id])
			: [];
	};

	return project.bones.reduce<ReadonlySet<EntityId>>(
		(cycles, bone) => new Set([...cycles, ...cycleFor(bone.id, [])]),
		new Set<EntityId>()
	);
};

const boneParentIds = function boneParentIds(project: Project): ReadonlyMap<EntityId, EntityId | null> {
	const cycles = cycleBoneIds(project);

	return new Map(project.bones.map((bone) => [
		bone.id,
		cycles.has(bone.id) ? null : knownParentId(project, 'bone', bone.parentId)
	] as const));
};

const freezeNode = function freezeNode(node: RigTreeNode): RigTreeNode {
	return Object.freeze({
		...node,
		children: Object.freeze([...node.children])
	});
};

const createNodes = function createNodes(
	project: Project,
	selection: Selection
): readonly RigTreeNode[] {
	const parents = boneParentIds(project);
	const boneNodes = project.bones.map((bone) => ({
		id: bone.id,
		kind: 'bone' as const,
		selectableKind: 'bone' as const,
		parentId: parents.get(bone.id) ?? null,
		depth: 0,
		name: bone.name,
		children: [],
		selected: isSelected(selection, { kind: 'bone', id: bone.id }),
		activeAttachment: false,
		expandable: false,
		typeLabel: typeLabelFor('bone')
	}));
	const slotNodes = project.slots.map((slot) => ({
		id: slot.id,
		kind: 'slot' as const,
		selectableKind: 'slot' as const,
		parentId: knownParentId(project, 'slot', slot.boneId),
		depth: 0,
		name: slot.name,
		children: [],
		selected: isSelected(selection, { kind: 'slot', id: slot.id }),
		activeAttachment: false,
		expandable: false,
		typeLabel: typeLabelFor('slot')
	}));
const attachmentNodes = project.attachments.map((attachment) => ({
		id: attachment.id,
		kind: attachmentKindFor(attachment),
		selectableKind: 'attachment' as const,
		parentId: parentIdForAttachment(project, attachment),
		depth: 0,
		name: attachment.name,
		children: [],
		selected: isSelected(selection, { kind: 'attachment', id: attachment.id }),
		activeAttachment: attachment.kind === 'image'
			&& project.slots.some((slot) => slot.id === attachment.slotId && slot.setupAttachmentId === attachment.id),
		expandable: false,
		typeLabel: typeLabelFor(attachment.kind)
	}));
	const initialNodes = [...boneNodes, ...slotNodes, ...attachmentNodes]
		.filter((node, index, nodes) => nodes.findIndex((candidate) => candidate.id === node.id) === index);
	const childrenByParent = initialNodes.reduce<ReadonlyMap<EntityId, readonly EntityId[]>>((children, node) => {
		if (!node.parentId) {
			return children;
		}

		const current = children.get(node.parentId) ?? [];

		return new Map([...children, [node.parentId, [...current, node.id]]]);
	}, new Map());
	const orderedIds = nodeIdOrder(project);
	const orderById = new Map(orderedIds.map((id, index) => [id, index] as const));
	const parentById = new Map(initialNodes.map((node) => [node.id, node.parentId] as const));
	const depthFor = function depthFor(id: EntityId, path: ReadonlySet<EntityId>): number {
		const parentId = parentById.get(id);

		if (!parentId || path.has(id) || !parentById.has(parentId)) {
			return 0;
		}

		return depthFor(parentId, new Set([...path, id])) + 1;
	};

	return initialNodes.map((node) => {
		const children = (childrenByParent.get(node.id) ?? []).toSorted((left, right) => (
			(orderById.get(left) ?? Number.MAX_SAFE_INTEGER) - (orderById.get(right) ?? Number.MAX_SAFE_INTEGER)
		));

		return freezeNode({
			...node,
			depth: depthFor(node.id, new Set()),
			children,
			expandable: children.length > 0
		});
	}).toSorted((left, right) => orderedIds.indexOf(left.id) - orderedIds.indexOf(right.id));
};

const flattenVisible = function flattenVisible(
	nodes: readonly RigTreeNode[],
	expandedIds: ReadonlySet<EntityId>
): readonly RigTreeNode[] {
	const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
	const childrenByParent = nodes.reduce<ReadonlyMap<EntityId | null, readonly RigTreeNode[]>>((children, node) => {
		const key = node.parentId;
		const current = children.get(key) ?? [];

		return new Map([...children, [key, [...current, node]]]);
	}, new Map());

	const visit = function visit(
		parentId: EntityId | null,
		depth: number,
		ancestors: ReadonlySet<EntityId>
	): readonly RigTreeNode[] {
		return (childrenByParent.get(parentId) ?? []).flatMap((node) => {
			if (ancestors.has(node.id)) {
				return [];
			}

			const withDepth = freezeNode({ ...node, depth });
			const descendants = node.expandable && expandedIds.has(node.id)
				? visit(node.id, depth + 1, new Set([...ancestors, node.id]))
				: [];

			return [withDepth, ...descendants];
		});
	};
	const reachableFrom = function reachableFrom(
		parentId: EntityId | null,
		ancestors: ReadonlySet<EntityId>
	): readonly EntityId[] {
		return (childrenByParent.get(parentId) ?? []).flatMap((node) => {
			if (ancestors.has(node.id)) {
				return [];
			}

			return [node.id, ...reachableFrom(node.id, new Set([...ancestors, node.id]))];
		});
	};

	const visible = visit(null, 0, new Set()).filter((node) => nodesById.has(node.id));
	const reachableIds = new Set(reachableFrom(null, new Set()));
	const disconnected = nodes
		.filter((node) => !reachableIds.has(node.id))
		.map((node) => freezeNode({ ...node, depth: 0 }));

	return [...visible, ...disconnected];
};

export const buildRigTreeViewModel = function buildRigTreeViewModel(
	project: Project,
	selection: Selection = [],
	expandedIds: ReadonlySet<EntityId> = new Set(project.bones.map((bone) => bone.id))
): RigTreeViewModel {
	const nodes = createNodes(project, selection);
	const visibleNodes = flattenVisible(nodes, expandedIds);

	return Object.freeze({
		nodes: Object.freeze([...nodes]),
		visibleNodes: Object.freeze([...visibleNodes]),
		rootIds: Object.freeze(visibleNodes.filter((node) => node.depth === 0).map((node) => node.id))
	});
};

export const selectableEntityForRigNode = selectableEntityFor;

export const treeSelectionForClick = function treeSelectionForClick(
	selection: Selection,
	visibleNodes: readonly RigTreeNode[],
	node: RigTreeNode,
	interaction: RigTreeInteraction = {}
): Selection {
	const entity = selectableEntityFor(node);

	if (interaction.shift) {
		const selectedIndex = visibleNodes.findIndex((candidate) => candidate.id === node.id);
		const anchorId = interaction.anchorId ?? selection.at(-1)?.id;
		const anchorIndex = anchorId ? visibleNodes.findIndex((candidate) => candidate.id === anchorId) : -1;

		if (selectedIndex >= 0 && anchorIndex >= 0) {
			const start = Math.min(selectedIndex, anchorIndex);
			const end = Math.max(selectedIndex, anchorIndex);
			const range = visibleNodes.slice(start, end + 1).map(selectableEntityForRigNode);

			return interaction.ctrlOrMeta
				? [...selection, ...range.filter((candidate) => !isSelected(selection, candidate))]
				: range;
		}
	}

	return interaction.ctrlOrMeta
		? selection.some((candidate) => candidate.kind === entity.kind && candidate.id === entity.id)
			? selection.filter((candidate) => candidate.kind !== entity.kind || candidate.id !== entity.id)
			: [...selection, entity]
		: [entity];
};

export const treeNodeAfter = function treeNodeAfter(
	visibleNodes: readonly RigTreeNode[],
	focusedId: EntityId | undefined,
	direction: -1 | 1
): RigTreeNode | undefined {
	if (visibleNodes.length === 0) {
		return undefined;
	}

	const index = focusedId ? visibleNodes.findIndex((node) => node.id === focusedId) : -1;
	const nextIndex = index < 0 ? 0 : Math.max(0, Math.min(visibleNodes.length - 1, index + direction));

	return visibleNodes[nextIndex];
};

export const treeNodeForTypeahead = function treeNodeForTypeahead(
	visibleNodes: readonly RigTreeNode[],
	query: string,
	focusedId?: EntityId
): RigTreeNode | undefined {
	const normalized = query.trim().toLowerCase();

	if (!normalized) {
		return undefined;
	}

	const start = focusedId ? visibleNodes.findIndex((node) => node.id === focusedId) + 1 : 0;
	const ordered = [...visibleNodes.slice(Math.max(0, start)), ...visibleNodes.slice(0, Math.max(0, start))];

	return ordered.find((node) => node.name.toLowerCase().startsWith(normalized));
};

export const revealAncestors = function revealAncestors(
	model: RigTreeViewModel,
	targetId: EntityId,
	expandedIds: ReadonlySet<EntityId>
): ReadonlySet<EntityId> {
	const nodeById = new Map(model.nodes.map((node) => [node.id, node] as const));
	const target = nodeById.get(targetId);

	if (!target) {
		return expandedIds;
	}

	const collect = function collect(
		parentId: EntityId | null,
		ancestors: readonly EntityId[],
		visited: ReadonlySet<EntityId>
	): readonly EntityId[] {
		if (!parentId || visited.has(parentId)) {
			return ancestors;
		}

		return collect(
			nodeById.get(parentId)?.parentId ?? null,
			[...ancestors, parentId],
			new Set([...visited, parentId])
		);
	};
	const ancestors = collect(target.parentId, [], new Set());

	return new Set([...expandedIds, ...ancestors]);
};
