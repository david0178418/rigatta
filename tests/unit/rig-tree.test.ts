import { describe, expect, test } from 'bun:test';
import { validateProject } from '../../src/domain/validation.ts';
import { buildRigTreeViewModel, revealAncestors, type RigTreeNode } from '../../src/app/rig-tree.ts';
import { rigRenameValidationMessageFor, rigTreeFilterForQuery, rigTreeNodeMatchesQuery } from '../../src/app/rig-tree-view.tsx';
import { fixtureIds, createRigProject } from '../fixtures.ts';

const nodeFor = function nodeFor(
	model: ReturnType<typeof buildRigTreeViewModel>,
	id: string
): RigTreeNode {
	const node = model.nodes.find((candidate) => candidate.id === id);

	if (!node) {
		throw new Error(`Rig tree node ${id} is unavailable.`);
	}

	return node;
};

const allExpanded = function allExpanded(project: ReturnType<typeof createRigProject>): ReadonlySet<string> {
	return new Set([
		...project.bones.map((bone) => bone.id),
		...project.slots.map((slot) => slot.id),
		...project.attachments.map((attachment) => attachment.id)
	]);
};

describe('Rig tree view model', () => {
	test('derives ordered immutable nodes for nested bones, slots, and attachments', () => {
		const project = createRigProject();
		const before = JSON.stringify(project);
		const model = buildRigTreeViewModel(project, [
			{ kind: 'bone', id: fixtureIds.child },
			{ kind: 'attachment', id: fixtureIds.image }
		], allExpanded(project));

		const root = nodeFor(model, fixtureIds.root);
		const parent = nodeFor(model, fixtureIds.parentA);
		const child = nodeFor(model, fixtureIds.child);
		const slot = nodeFor(model, fixtureIds.slot);
		const image = nodeFor(model, fixtureIds.image);
		const point = nodeFor(model, fixtureIds.point);
		const rectangle = nodeFor(model, fixtureIds.rectangle);

		expect(root).toMatchObject({ kind: 'bone', selectableKind: 'bone', parentId: null, depth: 0, typeLabel: 'Bone', selected: false, expandable: true });
		expect(root.children).toEqual([fixtureIds.parentA, fixtureIds.parentB]);
		expect(parent).toMatchObject({ parentId: fixtureIds.root, depth: 1, expandable: true });
		expect(parent.children).toEqual([fixtureIds.child]);
		expect(child).toMatchObject({ parentId: fixtureIds.parentA, depth: 2, selected: true, expandable: true });
		expect(child.children).toEqual([fixtureIds.slot, fixtureIds.point, fixtureIds.rectangle]);
		expect(slot).toMatchObject({ kind: 'slot', selectableKind: 'slot', parentId: fixtureIds.child, depth: 3, typeLabel: 'Slot', expandable: true });
		expect(slot.children).toEqual([fixtureIds.image]);
		expect(image).toMatchObject({ kind: 'image', selectableKind: 'attachment', parentId: fixtureIds.slot, depth: 4, selected: true, activeAttachment: true, expandable: false, typeLabel: 'Image attachment' });
		expect(point).toMatchObject({ kind: 'point', parentId: fixtureIds.child, depth: 3, expandable: false, typeLabel: 'Point attachment' });
		expect(rectangle).toMatchObject({ kind: 'rectangle', parentId: fixtureIds.child, depth: 3, expandable: false, typeLabel: 'Rectangle attachment' });
		expect(model.visibleNodes.map((node) => node.id)).toEqual([
		fixtureIds.root,
		fixtureIds.parentA,
		fixtureIds.child,
		fixtureIds.slot,
		fixtureIds.image,
		fixtureIds.point,
		fixtureIds.rectangle,
		fixtureIds.parentB
	]);
		expect(JSON.stringify(project)).toBe(before);
		expect(Object.isFrozen(model)).toBe(true);
		expect(Object.isFrozen(model.nodes)).toBe(true);
		expect(Object.isFrozen(model.visibleNodes)).toBe(true);
		expect(Object.isFrozen(root)).toBe(true);
		expect(Object.isFrozen(root.children)).toBe(true);
	});

	test('keeps empty branches visible and non-expandable', () => {
		const emptyId = '123e4567-e89b-42d3-a456-42661417400b';
		const baseProject = createRigProject();
		const root = baseProject.bones.find((bone) => bone.id === fixtureIds.root);

		if (!root) {
			throw new Error('The fixture root is unavailable.');
		}

		const project = {
			...baseProject,
			bones: [...baseProject.bones, {
				id: emptyId,
				name: 'empty branch',
				parentId: fixtureIds.root,
				transform: root.transform
			}],
			boneOrder: [...baseProject.boneOrder, emptyId]
		};
		const model = buildRigTreeViewModel(project, [], allExpanded(project));
		const empty = nodeFor(model, emptyId);

		expect(empty).toMatchObject({ parentId: fixtureIds.root, depth: 1, children: [], expandable: false });
		expect(model.visibleNodes.some((node) => node.id === emptyId)).toBe(true);
	});

	test('hides descendants when a branch is collapsed without changing its model state', () => {
		const project = createRigProject();
		const model = buildRigTreeViewModel(project, [], new Set([fixtureIds.root]));

		expect(model.visibleNodes.map((node) => node.id)).toEqual([
			fixtureIds.root,
			fixtureIds.parentA,
			fixtureIds.parentB
		]);
		expect(nodeFor(model, fixtureIds.parentA).children).toEqual([fixtureIds.child]);
		expect(nodeFor(model, fixtureIds.child).depth).toBe(2);
	});

	test('retains valid selection state while rejecting invalid active attachment ownership', () => {
		const project = createRigProject();
		const alternateImageId = '123e4567-e89b-42d3-a456-42661417400c';
		const malformedProject = {
			...project,
			attachments: project.attachments.map((attachment) => attachment.kind === 'image'
				? { ...attachment, id: alternateImageId, name: 'wrong slot', slotId: fixtureIds.parentB }
				: attachment)
		};
		const model = buildRigTreeViewModel(malformedProject, [{ kind: 'attachment', id: alternateImageId }], allExpanded(malformedProject));
		const image = nodeFor(model, alternateImageId);

		expect(image).toMatchObject({ parentId: null, selected: true, activeAttachment: false });
		expect(nodeFor(model, fixtureIds.child).selected).toBe(false);
	});

	test('keeps malformed references safe and visible after validation reports them', () => {
		const project = createRigProject();
		const missingId = '123e4567-e89b-42d3-a456-426614174099';
		const malformedProject = {
			...project,
			bones: project.bones.map((bone) => bone.id === fixtureIds.root
				? { ...bone, parentId: fixtureIds.child }
				: bone.id === fixtureIds.parentA
					? { ...bone, parentId: fixtureIds.root }
					: bone.id === fixtureIds.child
						? { ...bone, parentId: fixtureIds.parentA }
						: bone),
			slots: project.slots.map((slot) => ({ ...slot, boneId: missingId })),
			attachments: project.attachments.map((attachment) => attachment.kind === 'image'
				? { ...attachment, slotId: missingId }
				: { ...attachment, boneId: missingId })
		};
		const diagnostics = validateProject(malformedProject);

		expect(diagnostics.some(({ code }) => code === 'invalid-reference')).toBe(true);
		expect(diagnostics.some(({ code }) => code === 'bone-cycle')).toBe(true);
		expect(() => buildRigTreeViewModel(malformedProject, [], allExpanded(malformedProject))).not.toThrow();
		const model = buildRigTreeViewModel(malformedProject, [], allExpanded(malformedProject));

		expect(model.nodes.map((node) => node.id)).toHaveLength(new Set(model.nodes.map((node) => node.id)).size);
		expect(model.visibleNodes).toHaveLength(model.nodes.length);
		expect(model.nodes.every((node) => model.visibleNodes.some((visibleNode) => visibleNode.id === node.id))).toBe(true);
		expect(revealAncestors(model, fixtureIds.root, new Set())).toEqual(new Set());
		expect(model.rootIds).toContain(fixtureIds.root);
	});

	test('matches names and type labels and retains only contextual ancestors', () => {
		const project = createRigProject();
		const model = buildRigTreeViewModel(project, [], allExpanded(project));
		const point = nodeFor(model, fixtureIds.point);
		const filter = rigTreeFilterForQuery(model, 'POINT attachment');

		expect(rigTreeNodeMatchesQuery(point, 'point attachment')).toBe(true);
		expect(rigTreeNodeMatchesQuery(point, 'muzzle')).toBe(true);
		expect(rigTreeNodeMatchesQuery(point, 'rectangle')).toBe(false);
		expect(filter && [...filter.matchingIds]).toEqual([fixtureIds.point]);
		expect(filter && filter.contextIds).toEqual(new Set([fixtureIds.root, fixtureIds.parentA, fixtureIds.child]));
		expect(filter && filter.visibleIds).toEqual(new Set([
			fixtureIds.point,
			fixtureIds.root,
			fixtureIds.parentA,
			fixtureIds.child
		]));
		expect(rigTreeFilterForQuery(model, '   ')).toBeUndefined();
	});

	test('rejects empty and duplicate inline names within the node collection', () => {
		const project = createRigProject();
		const model = buildRigTreeViewModel(project, [], allExpanded(project));
		const root = nodeFor(model, fixtureIds.root);
		const child = nodeFor(model, fixtureIds.child);
		const point = nodeFor(model, fixtureIds.point);

		expect(rigRenameValidationMessageFor(project, root, '   ')).toBe('Name cannot be empty.');
		expect(rigRenameValidationMessageFor(project, root, 'parent A')).toBe('A bone named “parent A” already exists.');
		expect(rigRenameValidationMessageFor(project, root, ' root ')).toBeUndefined();
		expect(rigRenameValidationMessageFor(project, child, 'body')).toBeUndefined();
		expect(rigRenameValidationMessageFor(project, point, 'hitbox')).toBe('A point attachment named “hitbox” already exists.');
	});
});
