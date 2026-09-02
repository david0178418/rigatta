import { describe, expect, test } from 'bun:test';
import { strFromU8, unzipSync } from 'fflate';
import { evaluatePose } from '../../src/domain/pose.ts';
import { createHistory, currentProject } from '../../src/domain/history.ts';
import { exportProjectArchive } from '../../src/persistence/archive.ts';
import { exampleExportFixture, EXAMPLE_CLIP_ID, EXAMPLE_ROOT_BONE_ID } from '../../src/examples/example-project.ts';
import { isEditorEntityVisible } from '../../src/app/editor-visibility.ts';
import { entitiesInBounds, hitTestProject } from '../../src/app/hit-testing.ts';
import { transformPoint } from '../../src/domain/coordinates.ts';
import { evaluateBoneWorldMatrices } from '../../src/domain/transforms.ts';
import {
	defaultUiPreferences,
	projectUiPreferencesFor,
	updateProjectUiPreferences
} from '../../src/app/ui-preferences.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

describe('editor-only visibility', () => {
	test('hides a bone and all attached descendants without changing project nodes', () => {
		const project = createRigProject();
		const bones = project.bones;
		const attachments = project.attachments;
		const hiddenIds = new Set([fixtureIds.parentA]);

		expect(isEditorEntityVisible(project, fixtureIds.root, hiddenIds)).toBe(true);
		expect(isEditorEntityVisible(project, fixtureIds.parentA, hiddenIds)).toBe(false);
		expect(isEditorEntityVisible(project, fixtureIds.child, hiddenIds)).toBe(false);
		expect(isEditorEntityVisible(project, fixtureIds.image, hiddenIds)).toBe(false);
		expect(isEditorEntityVisible(project, fixtureIds.point, hiddenIds)).toBe(false);
		expect(isEditorEntityVisible(project, fixtureIds.rectangle, hiddenIds)).toBe(false);
		expect(isEditorEntityVisible(project, fixtureIds.parentB, hiddenIds)).toBe(true);
		expect(project.bones).toBe(bones);
		expect(project.attachments).toBe(attachments);
		expect(project.bones.map((bone) => bone.id)).toEqual([
			fixtureIds.root,
			fixtureIds.parentA,
			fixtureIds.parentB,
			fixtureIds.child
		]);
		expect([...hiddenIds]).toEqual([fixtureIds.parentA]);
	});

	test('hides a single attachment while leaving its bone and sibling attachments visible', () => {
		const project = createRigProject();
		const hiddenIds = new Set([fixtureIds.image]);
		const matrix = evaluateBoneWorldMatrices(project).matrices.get(fixtureIds.child);

		if (!matrix) {
			throw new Error('Fixture child matrix is unavailable.');
		}

		expect(isEditorEntityVisible(project, fixtureIds.child, hiddenIds)).toBe(true);
		expect(isEditorEntityVisible(project, fixtureIds.image, hiddenIds)).toBe(false);
		expect(isEditorEntityVisible(project, fixtureIds.point, hiddenIds)).toBe(true);
		expect(isEditorEntityVisible(project, fixtureIds.rectangle, hiddenIds)).toBe(true);
		expect(hitTestProject(project, transformPoint(matrix, { x: 32, y: 0 }), hiddenIds)).toEqual({
			kind: 'attachment',
			id: fixtureIds.point
		});
	});

	test('excludes hidden parents and their descendants from point and marquee hit testing', () => {
		const project = createRigProject();
		const matrix = evaluateBoneWorldMatrices(project).matrices.get(fixtureIds.child);
		const hiddenIds = new Set([fixtureIds.parentA]);

		if (!matrix) {
			throw new Error('Fixture child matrix is unavailable.');
		}

		const descendantPoint = transformPoint(matrix, { x: 20, y: 0 });
		const selected = entitiesInBounds(project, { x: -1000, y: -1000, w: 2000, h: 2000 }, hiddenIds);

		expect(hitTestProject(project, descendantPoint, hiddenIds)).toBeUndefined();
		expect(selected).not.toContainEqual({ kind: 'bone', id: fixtureIds.parentA });
		expect(selected).not.toContainEqual({ kind: 'bone', id: fixtureIds.child });
		expect(selected).not.toContainEqual({ kind: 'attachment', id: fixtureIds.image });
		expect(selected).not.toContainEqual({ kind: 'attachment', id: fixtureIds.point });
		expect(selected).not.toContainEqual({ kind: 'attachment', id: fixtureIds.rectangle });
	});

	test('returns safe visibility results for dangling and cyclic references', () => {
		const source = createRigProject();
		const malformed = {
			...source,
			bones: source.bones.map((bone) => bone.id === fixtureIds.parentA
				? { ...bone, parentId: fixtureIds.rectangle }
				: bone),
			slots: source.slots.map((slot) => ({ ...slot, boneId: fixtureIds.rectangle })),
			attachments: source.attachments.map((attachment) => attachment.kind === 'image'
				? { ...attachment, slotId: fixtureIds.rectangle }
				: { ...attachment, boneId: fixtureIds.rectangle })
		};
		const cyclic = {
			...source,
			bones: source.bones.map((bone) => bone.id === fixtureIds.root
				? { ...bone, parentId: fixtureIds.child }
				: bone.id === fixtureIds.child
					? { ...bone, parentId: fixtureIds.root }
					: bone)
		};

		expect(isEditorEntityVisible(malformed, fixtureIds.image, new Set())).toBe(true);
		expect(isEditorEntityVisible(malformed, fixtureIds.point, new Set())).toBe(true);
		expect(isEditorEntityVisible(cyclic, fixtureIds.root, new Set())).toBe(true);
		expect(isEditorEntityVisible(cyclic, fixtureIds.child, new Set())).toBe(true);
		expect(isEditorEntityVisible(cyclic, fixtureIds.child, new Set([fixtureIds.root]))).toBe(false);
		expect(() => hitTestProject(malformed, { x: 0, y: 0 })).not.toThrow();
		expect(() => entitiesInBounds(malformed, { x: -10, y: -10, w: 20, h: 20 })).not.toThrow();
	});

	test('keeps hidden IDs project-scoped and outside history, pose evaluation, and archives', async () => {
		const project = exampleExportFixture.project;
		const hiddenPreferences = updateProjectUiPreferences(defaultUiPreferences(), project.id, (current) => ({
			...current,
			hiddenEntityIds: [EXAMPLE_ROOT_BONE_ID]
		}));
		const history = createHistory(project);
		const beforePose = evaluatePose(project, EXAMPLE_CLIP_ID, 0.5);
		const archive = await exportProjectArchive(project, exampleExportFixture.assets);

		expect(projectUiPreferencesFor(hiddenPreferences, project).hiddenEntityIds).toEqual([EXAMPLE_ROOT_BONE_ID]);
		expect(currentProject(history)).toBe(project);
		expect(history.past).toHaveLength(0);
		expect(evaluatePose(project, EXAMPLE_CLIP_ID, 0.5)).toEqual(beforePose);
		expect(archive.ok).toBe(true);

		if (!archive.ok) {
			return;
		}

		const projectEntry = unzipSync(archive.value)['project.json'];

		if (!projectEntry) {
			throw new Error('The archive project entry is missing.');
		}

		const archivedProject = JSON.parse(strFromU8(projectEntry)) as Readonly<Record<string, unknown>>;

		expect(archivedProject).toEqual(project);
		expect(archivedProject).not.toHaveProperty('hiddenEntityIds');
	});
});
