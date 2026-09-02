import { describe, expect, test } from 'bun:test';
import { assetPreviewFor, assetUsageFor, assetUsageLabelFor, imageFormatFor } from '../../src/app/asset-browser-model.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

describe('asset browser metadata', () => {
	test('formats supported image MIME types for the preview', () => {
		expect(imageFormatFor('image/png')).toBe('PNG');
		expect(imageFormatFor('image/jpeg')).toBe('JPEG');
		expect(imageFormatFor('image/webp')).toBe('WEBP');
	});

	test('reports both slots and attachments using an image asset', () => {
		const project = createRigProject();
		const usage = assetUsageFor(project, fixtureIds.asset);

		expect(usage).toEqual([{ slotName: 'body', attachmentName: 'hero' }]);
		expect(usage.map(assetUsageLabelFor)).toEqual(['body / hero']);
		expect(assetPreviewFor(project, fixtureIds.asset)).toMatchObject({
		asset: { id: fixtureIds.asset, width: 64, height: 64 },
		format: 'PNG',
		usage
		});
	});

	test('keeps preview metadata available for stale slot references and missing selections', () => {
		const project = createRigProject();
		const staleSlotProject = {
			...project,
			slots: project.slots.map((slot) => ({ ...slot, id: fixtureIds.parentB }))
		};

		expect(assetUsageFor(staleSlotProject, fixtureIds.asset)).toEqual([{ slotName: 'Unknown slot', attachmentName: 'hero' }]);
		expect(assetPreviewFor(project, undefined)).toBeUndefined();
		expect(assetPreviewFor(project, fixtureIds.child)).toBeUndefined();
	});
});
