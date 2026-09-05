import { expect, test, type Page } from '@playwright/test';

type AssetDensity = 'list' | 'compact' | 'thumbnail';
type Bounds = Readonly<{ x: number; y: number; width: number; height: number }>;
type AssetUrlEvents = Readonly<{ created: readonly string[]; revoked: readonly string[] }>;

const assetUrlEventCounts = async function assetUrlEventCounts(page: Page): Promise<Readonly<{ created: number; revoked: number }>> {
	return page.evaluate(() => {
		const events = (window as unknown as { __assetObjectUrlEvents?: AssetUrlEvents }).__assetObjectUrlEvents;

		return {
			created: events?.created.length ?? 0,
			revoked: events?.revoked.length ?? 0
		};
	});
};

const overlaps = function overlaps(left: Bounds, right: Bounds): boolean {
	return left.x < right.x + right.width
		&& left.x + left.width > right.x
		&& left.y < right.y + right.height
		&& left.y + left.height > right.y;
};

test('keeps asset density interactions, previews, and object URL lifetime bounded', async ({ page }) => {
	await page.addInitScript(() => {
		const originalCreateObjectURL = URL.createObjectURL.bind(URL);
		const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
		const events: { created: string[]; revoked: string[] } = { created: [], revoked: [] };

		Object.defineProperty(window, '__assetObjectUrlEvents', { configurable: true, value: events });
		Object.defineProperty(URL, 'createObjectURL', {
			configurable: true,
			value: (blob: Blob): string => {
				const url = originalCreateObjectURL(blob);

				events.created.push(url);
				return url;
			}
		});
		Object.defineProperty(URL, 'revokeObjectURL', {
			configurable: true,
			value: (url: string): void => {
				events.revoked.push(url);
				originalRevokeObjectURL(url);
			}
		});
	});
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await page.getByRole('tab', { name: 'Assets', exact: true }).click();

	const browser = page.locator('.asset-browser');
	const row = browser.locator('.asset-row').filter({ hasText: 'body_front.png' });
	const preview = browser.getByRole('region', { name: 'Asset preview' });

	await expect(row).toHaveCount(1);
	await row.click();
	await expect(row).toHaveAttribute('aria-pressed', 'true');
	await expect(preview).toContainText('39 × 31 · PNG');
	await expect(preview).toContainText('example/adventurer/body_front.png');
	await expect(preview).toContainText('Used by body / body front');

	await row.focus();
	await expect(row).toBeFocused();
	await expect(preview).toBeVisible();
	await expect(preview.locator('button, input, select, textarea, a, [tabindex]')).toHaveCount(0);

	const previewBounds = await preview.boundingBox();
	const viewportBounds = await page.locator('.pixi-viewport').boundingBox();

	if (!previewBounds || !viewportBounds) {
		throw new Error('The asset preview or canvas bounds are unavailable.');
	}

	expect(overlaps(previewBounds, viewportBounds)).toBe(false);

	const densities: readonly AssetDensity[] = ['list', 'compact', 'thumbnail'];

	await densities.reduce(async (previous, density) => {
		await previous;
		await browser.getByLabel('Asset density').selectOption(density);
		await expect(browser.locator('.asset-list')).toHaveClass(new RegExp(`asset-density-${density}`));
		await expect(row).toHaveAttribute('aria-pressed', 'true');
		await expect(row).toHaveAttribute('draggable', 'true');

		const dragTypes = await row.evaluate((element) => {
			const dataTransfer = new DataTransfer();
			let types: readonly string[] = [];

			element.ownerDocument.addEventListener('dragstart', (event) => {
				types = [...(event.dataTransfer?.types ?? [])];
			}, { once: true });
			element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));

			return types;
		});

		expect(dragTypes).toContain('application/x-rigatta-asset');

		if (density === 'thumbnail') {
			const thumbnail = row.locator('img.asset-thumbnail');

			await expect(thumbnail).toHaveAttribute('loading', 'lazy');
			await expect(thumbnail).toHaveAttribute('decoding', 'async');
			await expect(thumbnail).toHaveAttribute('draggable', 'false');
			return;
		}

		await expect(row.locator('img.asset-thumbnail')).toHaveCount(0);
	}, Promise.resolve());

	await browser.getByLabel('Search images').fill('adventurer');
	await expect(browser.getByText('▾example', { exact: true })).toBeVisible();
	await expect(row).toBeVisible();

	const createdBeforeUnmount = await assetUrlEventCounts(page);

	await page.getByRole('tab', { name: 'Properties', exact: true }).click();
	await expect(browser).toHaveCount(0);
	await expect.poll(async () => (await assetUrlEventCounts(page)).revoked).toBeGreaterThanOrEqual(createdBeforeUnmount.created);
});

test('marks every thumbnail for lazy offscreen decoding while retaining folder context', async ({ page }) => {
	await page.addInitScript(() => {
		const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gkBBxAXAvkWQwAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wOS0wMVQwNzoxNjoyMyswMDowMMxohAEAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDktMDFUMDc6MTY6MjMrMDA6MDC9NTy9AAAAKHRFWHRkYXRldGltZXN0YW1wAAAyMDI2LTA5LTAxVDA3OjE2OjIzKzAwOjAw6iAdYgAAAA9JREFUKM9jYBgFo4B8AAACQAABjMWrdwAAAABJRU5ErkJggg=='), (character) => character.charCodeAt(0));
		type MockFileEntry = Readonly<{
			kind: 'file';
			name: string;
			isSameEntry: (other: FileSystemHandle) => Promise<boolean>;
			getFile: () => Promise<File>;
		}>;
		type MockDirectoryEntry = Readonly<{
			kind: 'directory';
			name: string;
			isSameEntry: (other: FileSystemHandle) => Promise<boolean>;
			values: () => AsyncIterable<MockEntry>;
		}>;
		type MockEntry = MockFileEntry | MockDirectoryEntry;
		const sameEntry = async function sameEntry(): Promise<boolean> {
			return false;
		};
		const parts = Array.from({ length: 24 }, (_, index) => {
			const name = `asset-${String(index + 1).padStart(2, '0')}.png`;

			return {
				kind: 'file' as const,
				name,
				isSameEntry: sameEntry,
				getFile: async function getFile(): Promise<File> {
					return new File([pngBytes], name, { type: 'image/png' });
				}
			};
		});
		const values = async function* values(): AsyncGenerator<MockFileEntry> {
			yield* parts;
		};
		const rootValues = async function* rootValues(): AsyncGenerator<MockDirectoryEntry> {
			yield { kind: 'directory', name: 'parts', isSameEntry: sameEntry, values };
		};

		Object.defineProperty(window, 'showDirectoryPicker', {
			configurable: true,
			value: async function showDirectoryPicker(): Promise<MockDirectoryEntry> {
				return { kind: 'directory', name: 'library', isSameEntry: sameEntry, values: rootValues };
			}
		});
	});
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await page.getByRole('region', { name: /Empty 1024 by 1024 canvas/ }).getByRole('button', { name: 'Import image directory', exact: true }).click();

	const browser = page.locator('.asset-browser');
	await expect(browser).toBeVisible();
	await expect(browser.locator('.asset-row')).toHaveCount(24);
	await browser.getByLabel('Asset density').selectOption('thumbnail');

	const thumbnails = browser.locator('img.asset-thumbnail');
	await expect(thumbnails).toHaveCount(24);
	const lazyStates = await thumbnails.evaluateAll((elements) => elements.map((element) => ({
		loading: element.getAttribute('loading'),
		decoding: element.getAttribute('decoding')
	})));

	expect(lazyStates.every((state) => state.loading === 'lazy' && state.decoding === 'async')).toBe(true);
	await expect(browser.locator('.asset-row').last()).toHaveCSS('content-visibility', 'auto');

	await browser.getByLabel('Search images').fill('asset-24');
	await expect(browser.locator('.asset-folder-row')).toContainText('parts');
	await expect(browser.locator('.asset-row')).toHaveCount(1);
	await expect(browser.locator('.asset-row')).toContainText('asset-24.png');
});
