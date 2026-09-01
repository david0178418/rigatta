import { describe, expect, test } from 'bun:test';
import { transformPoint } from '../../src/domain/coordinates.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';
import { entitiesInBounds, hitTestProject } from '../../src/app/hit-testing.ts';
import { evaluateBoneWorldMatrices } from '../../src/domain/transforms.ts';

describe('logical canvas hit testing', () => {
	test('hits active image attachments before bones', () => {
		const project = createRigProject();
		const matrix = evaluateBoneWorldMatrices(project).matrices.get(fixtureIds.child);

		if (!matrix) {
			throw new Error('Fixture child matrix is unavailable.');
		}

		const point = transformPoint(matrix, { x: 20, y: 0 });

		expect(hitTestProject(project, point)).toEqual({ kind: 'attachment', id: fixtureIds.image });
	});

	test('returns no hit away from the rig', () => {
		expect(hitTestProject(createRigProject(), { x: 900, y: 900 })).toBeUndefined();
	});

	test('returns visible attachments and bones intersecting a marquee', () => {
		const entities = entitiesInBounds(createRigProject(), { x: 60, y: 20, w: 100, h: 100 });

		expect(entities).toContainEqual({ kind: 'attachment', id: fixtureIds.image });
		expect(entities).toContainEqual({ kind: 'bone', id: fixtureIds.child });
	});

	test('keeps disabled gameplay attachments visible to editor selection', () => {
		const source = createRigProject();
		const project = {
			...source,
			attachments: source.attachments.map((attachment) => attachment.kind === 'point'
				? { ...attachment, enabled: false }
				: attachment)
		};
		const matrix = evaluateBoneWorldMatrices(project).matrices.get(fixtureIds.child);

		if (!matrix) {
			throw new Error('Fixture child matrix is unavailable.');
		}

		const point = transformPoint(matrix, { x: 32, y: 0 });

		expect(hitTestProject(project, point)).toEqual({ kind: 'attachment', id: fixtureIds.point });
		expect(entitiesInBounds(project, { x: point.x - 4, y: point.y - 4, w: 8, h: 8 })).toContainEqual({ kind: 'attachment', id: fixtureIds.point });
	});
});
