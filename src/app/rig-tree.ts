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

const nodeIdOrder = function nodeIdOrder(project: Project): readonly EntityId[] {
	const orderedBones = project.boneOrder.filter((id) => project.bones.some((bone) => bone.id === id));
	const missingBones = project.bones.flatMap((bone) => orderedBones.includes(bone.id) ? [] : [bone.id]);
	const slots = project.slots.map((slot) => slot.id);
	const attachments = project.attachments.map((attachment) => attachment.id);

	return [...orderedBones, ...missingBones, ...slots, ...attachments];
};

const createNodes = function createNodes(
	project: Project,
	selection: Selection
): readonly RigTreeNode[] {
	const boneNodes = project.bones.map((bone) => ({
		id: bone.id,
		kind: 'bone' as const,
		selectableKind: 'bone' as const,
		parentId: knownParentId(project, 'bone', bone.parentId),
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
			&& project.slots.some((slot) => slot.setupAttachmentId === attachment.id),
		expandable: false,
		typeLabel: typeLabelFor(attachment.kind)
}));
const initialNodes = [...boneNodes, ...slotNodes, ...attachmentNodes];
const childrenByParent = initialNodes.reduce<ReadonlyMap<EntityId, readonly EntityId[]>>((children, node) => {
		if (!node.parentId) {
			return children;
		}

		const current = children.get(node.parentId) ?? [];

		return new Map([...children, [node.parentId, [...current, node.id]]]);
	}, new Map());
const orderedIds = nodeIdOrder(project);

	return initialNodes.map((node) => {
		const children = childrenByParent.get(node.id) ?? [];

		return {
			...node,
			children,
			expandable: children.length > 0
		};
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

	const visit = function visit(parentId: EntityId | null, depth: number): readonly RigTreeNode[] {
		return (childrenByParent.get(parentId) ?? []).flatMap((node) => {
			const withDepth = { ...node, depth };
			const descendants = node.expandable && expandedIds.has(node.id)
				? visit(node.id, depth + 1)
				: [];

			return [withDepth, ...descendants];
		});
	};

	return visit(null, 0).filter((node) => nodesById.has(node.id));
};

export const buildRigTreeViewModel = function buildRigTreeViewModel(
	project: Project,
	selection: Selection = [],
	expandedIds: ReadonlySet<EntityId> = new Set(project.bones.map((bone) => bone.id))
): RigTreeViewModel {
	const nodes = createNodes(project, selection);
	const visibleNodes = flattenVisible(nodes, expandedIds);

	return {
		nodes,
		visibleNodes,
		rootIds: nodes.flatMap((node) => node.parentId === null ? [node.id] : [])
	};
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
		const anchor = selection.at(-1);
		const anchorIndex = anchor ? visibleNodes.findIndex((candidate) => candidate.id === anchor.id) : -1;

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

	const ancestors: EntityId[] = [];
	const collect = function collect(parentId: EntityId | null): void {
		if (!parentId) {
			return;
		}

		ancestors.push(parentId);
		collect(nodeById.get(parentId)?.parentId ?? null);
	};
	collect(target.parentId);

	return new Set([...expandedIds, ...ancestors]);
};
