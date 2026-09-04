import { describe, expect, test } from 'bun:test';
import { downloadExportZip, type ExportDownloadAnchor, type ExportDownloadEnvironment } from '../../src/export/download.ts';

const downloadFixture = function downloadFixture(click: () => void = () => undefined): Readonly<{
	environment: ExportDownloadEnvironment;
	anchor: ExportDownloadAnchor;
	created: Blob[];
	revoked: string[];
}> {
	const created: Blob[] = [];
	const revoked: string[] = [];
	const anchor: ExportDownloadAnchor = { href: '', download: '', click };

	return {
		environment: {
			createObjectURL: (blob): string => {
				created.push(blob);

				return 'blob:export';
			},
			revokeObjectURL: (url): void => {
				revoked.push(url);
			},
			createAnchor: (): ExportDownloadAnchor => anchor
		},
		anchor,
		created,
		revoked
	};
};

describe('export ZIP download boundary', () => {
	test('clicks exactly once and releases the object URL after success', () => {
		let clicks = 0;
		const fixture = downloadFixture(() => {
			clicks += 1;
		});
		const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' });
		const result = downloadExportZip(blob, 'robot.zip', fixture.environment);

		expect(result).toEqual({ ok: true, value: undefined });
		expect(clicks).toBe(1);
		expect(fixture.created).toEqual([blob]);
		expect(fixture.anchor).toMatchObject({ href: 'blob:export', download: 'robot.zip' });
		expect(fixture.revoked).toEqual(['blob:export']);
	});

	test('releases the object URL when the browser click fails', () => {
		const fixture = downloadFixture(() => {
			throw new Error('Synthetic click failure.');
		});
		const result = downloadExportZip(new Blob(), 'robot.zip', fixture.environment);

		expect(result).toMatchObject({ ok: false, error: { code: 'download-failure', phase: 'packaging' } });
		expect(fixture.revoked).toEqual(['blob:export']);
	});
});
