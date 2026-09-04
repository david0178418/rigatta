import { describe, expect, test } from 'bun:test';
import { DEFAULT_LOCAL_TRANSFORM, transformPoint } from '../../src/domain/coordinates.ts';
import { reduceProject, type ProjectCommand } from '../../src/domain/commands.ts';
import { createEmptyProject, type Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import {
	beginTransaction,
	commitTransaction,
	createHistory,
	dispatchCommand
} from '../../src/domain/history.ts';
import { evaluateBoneWorldMatrices } from '../../src/domain/transforms.ts';
import {
	planBulkImport,
	planSingleImageImportAndPlace
} from '../../src/assets/import-planner.ts';
import type { AssetImportEntriesResult, ImportedImage } from '../../src/assets/import.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const pngBytes = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x20
]);

const importedImage = function importedImage(relativePath: string): ImportedImage {
	return {
		bytes: pngBytes,
		mimeType: 'image/png',
		width: 16,
		height: 32,
		name: relativePath.split('/').at(-1) ?? relativePath,
		relativePath
	};
};

const idFactoryFor = function idFactoryFor(ids: readonly string[]): () => string {
	const iterator = ids[Symbol.iterator]();

	return function nextId(): string {
		const result = iterator.next();

		if (result.done) {
			throw new Error('The test ID factory was exhausted.');
		}

		return result.value;
	};
};

const applyCommands = function applyCommands(
	project: Project,
	commands: readonly ProjectCommand[]
): Project {
	const result = commands.reduce<OperationResult<Project>>(
		(current, command) => current.ok ? reduceProject(current.value, command) : current,
		{ ok: true, value: project }
	);

	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

describe('single-image import and placement planning', () => {
	test('creates the root, asset, slot, and attachment in one immutable command plan', () => {
		const project = createEmptyProject({ id: fixtureIds.project });
		const before = structuredClone(project);
		const plan = planSingleImageImportAndPlace(
			project,
			importedImage('hero.png'),
			{ x: 240, y: 180 },
			undefined,
			idFactoryFor([
				'123e4567-e89b-42d3-a456-426614174010',
				'123e4567-e89b-42d3-a456-426614174011',
				'123e4567-e89b-42d3-a456-426614174012',
				'123e4567-e89b-42d3-a456-426614174013'
			])
		);

		expect(plan.ok).toBe(true);
		if (!plan.ok) {
			throw new Error(plan.error.message);
		}

		expect(plan.value.commands.map((command) => command.kind)).toEqual([
			'add-image-assets',
			'create-bone',
			'create-slot',
			'create-image-attachment',
			'assign-slot-attachment'
		]);
		expect(plan.value.rootBoneId).toBe('123e4567-e89b-42d3-a456-426614174011');

		const next = applyCommands(project, plan.value.commands);

		expect(next.assets.map((asset) => asset.relativePath)).toEqual(['hero.png']);
		expect(next.bones.map((bone) => bone.name)).toEqual(['root']);
		expect(next.slots[0]?.setupAttachmentId).toBe(plan.value.attachmentId);
		expect(next.attachments[0]?.transform).toEqual({ ...DEFAULT_LOCAL_TRANSFORM, x: 240, y: 180 });
		expect(project).toEqual(before);

		const history = createHistory(project);
		const started = beginTransaction(history);
		const dispatched = plan.value.commands.reduce<OperationResult<typeof started>>(
			(current, command) => current.ok ? dispatchCommand(current.value, command) : current,
			{ ok: true, value: started }
		);

		expect(dispatched.ok).toBe(true);
		if (dispatched.ok) {
			const committed = commitTransaction(dispatched.value);

			expect(committed.past).toHaveLength(1);
			expect(committed.present.attachments).toHaveLength(1);
		}
	});

	test('converts a logical drop point into selected bone-local coordinates', () => {
		const project = createRigProject();
		const evaluation = evaluateBoneWorldMatrices(project);
		const childMatrix = evaluation.matrices.get(fixtureIds.child);

		if (!childMatrix) {
			throw new Error('The fixture child bone did not evaluate.');
		}

		const logicalPoint = transformPoint(childMatrix, { x: 7, y: -4 });
		const plan = planSingleImageImportAndPlace(
			project,
			importedImage('new.png'),
			logicalPoint,
			fixtureIds.child,
			idFactoryFor([
				'123e4567-e89b-42d3-a456-426614174010',
				'123e4567-e89b-42d3-a456-426614174011',
				'123e4567-e89b-42d3-a456-426614174012'
			])
		);

		expect(plan.ok).toBe(true);
		if (!plan.ok) {
			throw new Error(plan.error.message);
		}

		expect(plan.value.localPoint.x).toBeCloseTo(7, 10);
		expect(plan.value.localPoint.y).toBeCloseTo(-4, 10);
		const attachmentCommand = plan.value.commands.find((command) => command.kind === 'create-image-attachment');

		if (!attachmentCommand || attachmentCommand.kind !== 'create-image-attachment') {
			throw new Error('The placement plan did not create an image attachment.');
		}

		const transform = attachmentCommand.input.transform;

		if (!transform) {
			throw new Error('The placement plan did not include an attachment transform.');
		}

		expect(transform.x).toBeCloseTo(7, 10);
		expect(transform.y).toBeCloseTo(-4, 10);
	});

	test('rejects missing and stale selected bones before allocating IDs', () => {
		const project = createRigProject();
		const before = structuredClone(project);
		const failIfCalled = function failIfCalled(): string {
			throw new Error('The planner allocated an ID for an invalid target.');
		};

		const missing = planSingleImageImportAndPlace(project, importedImage('new.png'), { x: 2, y: 3 }, undefined, failIfCalled);
		const stale = planSingleImageImportAndPlace(project, importedImage('new.png'), { x: 2, y: 3 }, fixtureIds.asset, failIfCalled);

		expect(missing).toMatchObject({ ok: false, error: { code: 'invalid-reference' } });
		expect(stale).toMatchObject({ ok: false, error: { code: 'not-found' } });
		expect(project).toEqual(before);
	});
});

describe('bulk import result planning', () => {
	test('models every entry outcome and emits only one asset command', () => {
		const project = createRigProject();
		const input: AssetImportEntriesResult = {
			entries: [
				{ kind: 'imported', image: importedImage('new.png') },
				{ kind: 'imported', image: importedImage('characters/hero.png') },
				{ kind: 'skipped', relativePath: 'unreadable.png', reason: 'File read failed.' },
				{ kind: 'invalid', relativePath: 'broken.png', reason: 'Image dimensions could not be decoded.' },
				{ kind: 'unsupported', relativePath: 'notes.txt', reason: 'Unsupported image type.' }
			]
		};
		const newAssetId = '123e4567-e89b-42d3-a456-426614174010';
		const plan = planBulkImport(project, input, idFactoryFor([newAssetId]));

		expect(plan.ok).toBe(true);
		if (!plan.ok) {
			throw new Error(plan.error.message);
		}

		expect(plan.value.imported.map((entry) => entry.image.relativePath)).toEqual(['new.png']);
		expect(plan.value.conflicting).toMatchObject([{
		image: { relativePath: 'characters/hero.png' },
		existingAssetId: fixtureIds.asset
	}]);
		expect(plan.value.skipped).toEqual([{ relativePath: 'unreadable.png', reason: 'File read failed.' }]);
		expect(plan.value.invalid).toEqual([{ relativePath: 'broken.png', reason: 'Image dimensions could not be decoded.' }]);
		expect(plan.value.unsupported).toEqual([{ relativePath: 'notes.txt', reason: 'Unsupported image type.' }]);
		expect(plan.value.eligibleAssetIds).toEqual([newAssetId]);
		expect(plan.value.commands).toHaveLength(1);
		expect(plan.value.commands.every((command) => command.kind === 'add-image-assets')).toBe(true);

		const next = applyCommands(project, plan.value.commands);

		expect(next.assets.map((asset) => asset.relativePath)).toEqual(['characters/hero.png', 'new.png']);
		expect(next.slots).toEqual(project.slots);
		expect(next.attachments).toEqual(project.attachments);
	});

	test('does not allocate or emit a command when every imported path conflicts', () => {
		const project = createRigProject();
		const failIfCalled = function failIfCalled(): string {
			throw new Error('The planner allocated an ID for a conflicting asset.');
		};
		const result = planBulkImport(project, {
			entries: [{ kind: 'imported', image: importedImage('characters/hero.png') }]
		}, failIfCalled);

		expect(result).toMatchObject({ ok: true, value: { commands: [], imported: [], eligibleAssetIds: [] } });
	});
});
