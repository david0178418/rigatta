import { describe, expect, test } from 'bun:test';
import { DEFAULT_LOCAL_TRANSFORM } from '../../src/domain/coordinates.ts';
import { createEmptyProject } from '../../src/domain/model.ts';
import type { Project } from '../../src/domain/model.ts';
import { isValidProject, validateProject } from '../../src/domain/validation.ts';

const projectId = '123e4567-e89b-42d3-a456-426614174001';
const rootId = '123e4567-e89b-42d3-a456-426614174002';
const slotId = '123e4567-e89b-42d3-a456-426614174003';
const assetId = '123e4567-e89b-42d3-a456-426614174004';
const attachmentId = '123e4567-e89b-42d3-a456-426614174005';
const clipId = '123e4567-e89b-42d3-a456-426614174006';
const trackId = '123e4567-e89b-42d3-a456-426614174007';
const duplicateTrackId = '123e4567-e89b-42d3-a456-426614174008';
const keyId = '123e4567-e89b-42d3-a456-426614174009';
const secondKeyId = '123e4567-e89b-42d3-a456-42661417400a';

const validProject = function validProject(): Project {
	return {
		...createEmptyProject({ id: projectId }),
		assets: [{
			id: assetId,
			name: 'hero.png',
			relativePath: 'characters/hero.png',
			mimeType: 'image/png',
			width: 64,
			height: 64
			}],
			bones: [{
			id: rootId,
			name: 'root',
			parentId: null,
				transform: DEFAULT_LOCAL_TRANSFORM
			}],
			boneOrder: [rootId],
			slots: [{
			id: slotId,
			name: 'body',
			boneId: rootId,
			setupAttachmentId: attachmentId
		}],
		attachments: [{
			id: attachmentId,
			kind: 'image',
			name: 'hero',
			slotId,
			assetId,
			transform: DEFAULT_LOCAL_TRANSFORM,
			opacity: 1,
			pivotX: 0.5,
			pivotY: 0.5
		}],
		setupDrawOrder: [slotId]
	};
};

describe('project validation', () => {
	test('accepts a complete one-root project', () => {
		const project = validProject();

		expect(validateProject(project)).toEqual([]);
		expect(isValidProject(project)).toBe(true);
	});

	test('reports dangling references', () => {
		const project = validProject();
		const invalidProject = {
			...project,
			bones: [{ ...project.bones[0], parentId: '123e4567-e89b-42d3-a456-426614174099' }]
		};

		expect(validateProject(invalidProject).some(({ code }) => code === 'missing-reference')).toBe(true);
	});

	test('reports cycles and multiple roots', () => {
		const project = validProject();
		const childId = '123e4567-e89b-42d3-a456-426614174006';
		const invalidProject = {
			...project,
			bones: [
				{ ...project.bones[0], parentId: childId },
				{ id: childId, name: 'child', parentId: rootId, transform: DEFAULT_LOCAL_TRANSFORM }
			]
		};

		const codes = validateProject(invalidProject).map(({ code }) => code);

		expect(codes).toContain('multiple-roots');
		expect(codes).toContain('bone-cycle');
	});

	test('requires setup draw order to contain every slot once', () => {
		const project = validProject();

		expect(validateProject({ ...project, setupDrawOrder: [] })[0]?.code).toBe('invalid-setup-draw-order');
	});

	test('reports duplicate IDs and invalid attachment ownership', () => {
		const project = validProject();
		const invalidProject = {
			...project,
			slots: [{ ...project.slots[0], id: rootId }],
			attachments: [{ ...project.attachments[0], slotId: attachmentId }]
		};
		const codes = validateProject(invalidProject).map(({ code }) => code);

		expect(codes).toContain('duplicate-id');
		expect(codes).toContain('invalid-attachment');
	});

	test('validates track targets, key order, and duplicate track definitions', () => {
		const project = validProject();
		const invalidProject = {
			...project,
			clips: [{
				id: clipId,
				name: 'walk',
				durationSeconds: 1,
				fps: 12,
				loop: true,
				tracks: [
					{
						id: trackId,
						kind: 'bone-transform' as const,
						targetId: '123e4567-e89b-42d3-a456-426614174099',
						property: 'x' as const,
						keys: [
							{ id: keyId, timeSeconds: 0.75, value: 10, interpolation: 'linear' as const, curve: null },
							{ id: secondKeyId, timeSeconds: 0.25, value: 20, interpolation: 'linear' as const, curve: null }
						]
					},
					{
						id: duplicateTrackId,
						kind: 'bone-transform' as const,
						targetId: '123e4567-e89b-42d3-a456-426614174099',
						property: 'x' as const,
						keys: []
					}
				],
				events: []
			}]
		};
		const codes = validateProject(invalidProject).map(({ code }) => code);

		expect(codes).toContain('invalid-track-target');
		expect(codes).toContain('invalid-key');
		expect(codes).toContain('duplicate-track');
	});
});
