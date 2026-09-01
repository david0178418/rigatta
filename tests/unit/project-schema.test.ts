import { describe, expect, test } from 'bun:test';
import { parseProject } from '../../src/persistence/project-schema.ts';
import { createRigProject } from '../fixtures.ts';

describe('runtime project schema', () => {
	test('parses a valid version 1 project into project data', () => {
		const result = parseProject(createRigProject());

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.project).toEqual(createRigProject());
		}
	});

	test('rejects structurally malformed and semantically invalid projects', () => {
		const project = createRigProject();
		const malformed = parseProject({ ...project, schemaVersion: 2 });
		const invalid = parseProject({ ...project, setupDrawOrder: [] });

		expect(malformed.success).toBe(false);
		expect(invalid.success).toBe(false);
	});

	test('validates recursive structured event payload values', () => {
		const project = createRigProject();
		const withEvent = {
			...project,
			clips: [{
				id: '123e4567-e89b-42d3-a456-426614174010',
				name: 'walk',
				durationSeconds: 1,
				fps: 12,
				loop: true,
				tracks: [],
				events: [{
					id: '123e4567-e89b-42d3-a456-426614174011',
					timeSeconds: 0.5,
					name: 'impact',
					payload: { damage: 4, tags: ['hit', { heavy: true }] }
				}]
			}]
		};

		expect(parseProject(withEvent).success).toBe(true);
		expect(parseProject({
			...withEvent,
			clips: [{ ...withEvent.clips[0], events: [{ ...withEvent.clips[0].events[0], payload: { invalid: undefined } }] }]
		}).success).toBe(false);
	});
});
