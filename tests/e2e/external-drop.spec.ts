import { expect, test, type Page } from '@playwright/test';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gkBBxAXAvkWQwAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wOS0wMVQwNzoxNjoyMyswMDowMMxohAEAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDktMDFUMDc6MTY6MjMrMDA6MDC9NTy9AAAAKHRFWHRkYXRldGltZXN0YW1wAAAyMDI2LTA5LTAxVDA3OjE2OjIzKzAwOjAw6iAdYgAAAA9JREFUKM9jYBgFo4B8AAACQAABjMWrdwAAAABJRU5ErkJggg==';

type FixtureFile = Readonly<{
	name: string;
	mimeType: string;
	base64?: string;
	text?: string;
}>;

type LogicalPoint = Readonly<{ x: number; y: number }>;
type ScreenPoint = Readonly<{ x: number; y: number }>;
type DropEventName = 'dragover' | 'drop';
type FolderDataTransfer = Readonly<{
	dropEffect: string;
	effectAllowed: string;
	files: readonly File[];
	items: readonly Readonly<{
		kind: 'file';
		type: string;
		getAsFile: () => File;
		getAsFileSystemHandle: () => Promise<FileSystemHandle>;
		webkitGetAsEntry: () => Readonly<{ isDirectory: true }>;
	}>[];
	types: readonly string[];
	getData: () => string;
}>;

const pngFile = function pngFile(name: string): FixtureFile {
	return { name, mimeType: 'image/png', base64: PNG_BASE64 };
};

const brokenImageFile = function brokenImageFile(name: string): FixtureFile {
	return { name, mimeType: 'image/png', text: 'not a decodable PNG' };
};

const unsupportedFile = function unsupportedFile(name: string): FixtureFile {
	return { name, mimeType: 'text/plain', text: 'not an image' };
};

const screenPointForLogical = async function screenPointForLogical(
	page: Page,
	point: LogicalPoint
): Promise<ScreenPoint> {
	const viewport = page.locator('.pixi-viewport');
	const bounds = await viewport.boundingBox();

	if (!bounds) {
		throw new Error('The viewport bounds are unavailable.');
	}

	const camera = await viewport.evaluate((element) => {
		const scale = Number(element.getAttribute('data-camera-scale'));
		const offsetX = Number(element.getAttribute('data-camera-offset-x'));
		const offsetY = Number(element.getAttribute('data-camera-offset-y'));

		if (!Number.isFinite(scale) || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
			throw new Error('The viewport camera data is unavailable.');
		}

		return { scale, offsetX, offsetY };
	});

	return {
		x: bounds.x + bounds.width / 2 + camera.offsetX + (point.x - 512) * camera.scale,
		y: bounds.y + bounds.height / 2 + camera.offsetY + (point.y - 512) * camera.scale
	};
};

const dispatchViewportDrag = async function dispatchViewportDrag(
	page: Page,
	eventName: DropEventName,
	files: readonly FixtureFile[],
	options: Readonly<{ point?: ScreenPoint; logicalPoint?: LogicalPoint; folder?: boolean }> = {}
): Promise<void> {
	await page.locator('.pixi-viewport').evaluate((element, payload) => {
		const dataTransfer = new DataTransfer();
		const bytesFor = function bytesFor(file: FixtureFile): ArrayBuffer {
			const bytes = file.base64
				? Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0))
				: new TextEncoder().encode(file.text ?? '');
			const buffer = new ArrayBuffer(bytes.byteLength);

			new Uint8Array(buffer).set(bytes);
			return buffer;
		};

		payload.files.forEach((file) => {
			dataTransfer.items.add(new File([bytesFor(file)], file.name, { type: file.mimeType }));
		});

		const folderDataTransfer = payload.folder ? ((): FolderDataTransfer => {
			const fixture = payload.files.at(0);

			if (!fixture) {
				throw new Error('The folder fixture could not create a transfer item.');
			}

			type MockFileEntry = Readonly<{
				kind: 'file';
				name: string;
				isSameEntry: (other: FileSystemHandle) => Promise<boolean>;
				getFile: () => Promise<File>;
			}>;
			const directoryFile = new File([bytesFor(fixture)], fixture.name, { type: fixture.mimeType });
			const sameEntry = async function sameEntry(): Promise<boolean> {
				return false;
			};
			const values = async function* values(): AsyncGenerator<MockFileEntry> {
				yield {
					kind: 'file',
					name: fixture.name,
					isSameEntry: sameEntry,
					getFile: async function getFile(): Promise<File> {
						return directoryFile;
					}
				};
			};
			const directory = {
				kind: 'directory' as const,
				name: 'parts',
				isSameEntry: sameEntry,
				values
			};
			const item = {
				kind: 'file' as const,
				type: fixture.mimeType,
				getAsFile: function getAsFile(): File {
					return directoryFile;
				},
				getAsFileSystemHandle: async function getAsFileSystemHandle(): Promise<FileSystemHandle> {
					return directory;
				},
				webkitGetAsEntry: function webkitGetAsEntry(): Readonly<{ isDirectory: true }> {
					return { isDirectory: true };
				}
			};

			return {
				dropEffect: 'copy',
				effectAllowed: 'copy',
				files: [directoryFile],
				items: [item],
				types: ['Files'],
				getData: function getData(): string {
					return '';
				}
			};
		})() : undefined;

		const bounds = element.getBoundingClientRect();
		const scale = Number(element.getAttribute('data-camera-scale'));
		const offsetX = Number(element.getAttribute('data-camera-offset-x'));
		const offsetY = Number(element.getAttribute('data-camera-offset-y'));
		const point = payload.logicalPoint
			? {
				x: bounds.left + bounds.width / 2 + offsetX + (payload.logicalPoint.x - 512) * scale,
				y: bounds.top + bounds.height / 2 + offsetY + (payload.logicalPoint.y - 512) * scale
			}
			: payload.point ?? {
				x: bounds.left + bounds.width / 2,
				y: bounds.top + bounds.height / 2
			};

		const dragEvent = new DragEvent(payload.eventName, {
			bubbles: true,
			cancelable: true,
			clientX: point.x,
			clientY: point.y,
			dataTransfer
		});

		if (folderDataTransfer) {
			Object.defineProperty(dragEvent, 'dataTransfer', { configurable: true, value: folderDataTransfer });
		}

		element.dispatchEvent(dragEvent);
	}, { eventName, files, folder: options.folder ?? false, logicalPoint: options.logicalPoint ?? null, point: options.point ?? null });
};

const revealRootAttachments = async function revealRootAttachments(page: Page): Promise<void> {
	const expandRoot = page.getByRole('button', { name: 'Expand', exact: true });

	if (await expandRoot.count() > 0) {
		await expandRoot.first().click();
	}

	const expandSlot = page.getByRole('button', { name: 'Expand', exact: true });

	if (await expandSlot.count() > 0) {
		await expandSlot.first().click();
	}
};

const expectSavedLocally = async function expectSavedLocally(page: Page): Promise<void> {
	await expect(page.getByText('Saved locally', { exact: true })).toBeVisible({ timeout: 5000 });
};

const installDirectoryPicker = async function installDirectoryPicker(page: Page): Promise<void> {
	await page.addInitScript(({ base64 }) => {
		const pngBytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
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
			values: () => AsyncIterable<MockFileEntry>;
		}>;
		const sameEntry = async function sameEntry(): Promise<boolean> {
			return false;
		};
		const values = async function* values(): AsyncGenerator<MockFileEntry> {
			yield {
				kind: 'file',
				name: 'keyboard.png',
				isSameEntry: sameEntry,
				getFile: async function getFile(): Promise<File> {
					return new File([pngBytes], 'keyboard.png', { type: 'image/png' });
				}
			};
		};

		Object.defineProperty(window, 'showDirectoryPicker', {
			configurable: true,
			writable: true,
			value: async function showDirectoryPicker(): Promise<MockDirectoryEntry> {
				return { kind: 'directory', name: 'parts', isSameEntry: sameEntry, values };
			}
		});
	}, { base64: PNG_BASE64 });
};

	test('places one external PNG at its logical point in one undo entry and recovers after reload', async ({ page }) => {
		await page.goto('/');
		const logicalPoint = { x: 640, y: 384 } as const;
		const viewport = page.locator('.pixi-viewport');

		await dispatchViewportDrag(page, 'dragover', [pngFile('hero.png')], { logicalPoint });
		await expect(viewport).toHaveAttribute('data-drop-mode', 'single-image');
		await dispatchViewportDrag(page, 'drop', [pngFile('hero.png')], { logicalPoint });

		await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();
		await revealRootAttachments(page);
		await expect(page.locator('.attachment-row')).toHaveCount(1);
		await expect(page.getByText(/Imported and placed hero\.png at \d+, 384\./, { exact: true })).toBeVisible();
		const xValue = Number(await page.locator('input[name="x"]').inputValue());
		const yValue = Number(await page.getByRole('spinbutton', { name: 'Y', exact: true }).inputValue());
		expect(xValue).toBeGreaterThan(logicalPoint.x - 1);
		expect(xValue).toBeLessThan(logicalPoint.x + 1);
		expect(yValue).toBeGreaterThan(logicalPoint.y - 1);
		expect(yValue).toBeLessThan(logicalPoint.y + 1);
		await expectSavedLocally(page);

		const undo = page.getByRole('button', { name: 'Undo', exact: true });
		await expect(undo).toBeEnabled();
		await undo.click();
		await expect(page.getByRole('button', { name: 'root', exact: true })).toHaveCount(0);
		await expect(page.locator('.attachment-row')).toHaveCount(0);
		await expectSavedLocally(page);
		await expect(undo).toBeDisabled();

		await page.getByRole('tab', { name: 'Assets', exact: true }).click();
		await expect(page.locator('.asset-browser .asset-row')).toHaveCount(0);
		await page.getByRole('button', { name: 'Redo', exact: true }).click();
		await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();
		await revealRootAttachments(page);
		await expect(page.locator('.attachment-row')).toHaveCount(1);
		await expectSavedLocally(page);

		await page.reload();
		await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();
		await revealRootAttachments(page);
		await expect(page.locator('.attachment-row')).toHaveCount(1);
		await page.getByRole('tab', { name: 'Assets', exact: true }).click();
		await expect(page.locator('.asset-browser .asset-row')).toHaveCount(1);
});

test('imports multiple external files into Assets without placing attachments', async ({ page }) => {
		await page.goto('/');
		const viewport = page.locator('.pixi-viewport');

		await dispatchViewportDrag(page, 'dragover', [pngFile('hero.png'), pngFile('alt.png')]);
		await expect(viewport).toHaveAttribute('data-drop-mode', 'bulk-import');
		await dispatchViewportDrag(page, 'drop', [pngFile('hero.png'), pngFile('alt.png')]);

		const browser = page.locator('.asset-browser');
		await expect(browser).toBeVisible();
		await expect(browser.locator('.asset-row')).toHaveCount(2);
		await expect(browser.locator('.asset-row[aria-pressed="true"]')).toHaveCount(2);
		await expect(page.locator('.attachment-row')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'root', exact: true })).toHaveCount(0);
		await expect(page.getByText('Drag an imported image from Assets onto this canvas to create the root, slot, and attachment.', { exact: true })).toBeVisible();
		await expect(page.getByTestId('workspace-docks').getByText('Imported 2 images into Assets. Drag an imported image onto a selected bone or slot to place it.', { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Undo', exact: true }).click();
		await expect(browser.locator('.asset-row')).toHaveCount(0);
		await expect(page.locator('.attachment-row')).toHaveCount(0);
});

test('imports an external folder into Assets without automatic placement', async ({ page }) => {
		await page.goto('/');

		await dispatchViewportDrag(page, 'dragover', [pngFile('folder.png')], { folder: true });
		await dispatchViewportDrag(page, 'drop', [pngFile('folder.png')], { folder: true });
		await page.getByRole('tab', { name: 'Assets', exact: true }).click();

		const browser = page.locator('.asset-browser');
		await expect(browser.locator('.asset-row')).toHaveCount(1);
		await expect(browser.locator('.asset-row')).toContainText('folder.png');
		await expect(page.locator('.attachment-row')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'root', exact: true })).toHaveCount(0);
		await expect(page.getByText('Drag an imported image from Assets onto this canvas to create the root, slot, and attachment.', { exact: true })).toBeVisible();
		await expect(page.getByRole('status', { name: 'Asset import summary', exact: true })).toContainText('Imported 1 image.');
});

test('reports unsupported-only external drops without changing the project', async ({ page }) => {
		await page.goto('/');
		await dispatchViewportDrag(page, 'drop', [unsupportedFile('notes.txt')]);

		await expect(page.getByRole('status', { name: 'Asset import summary', exact: true })).toContainText('Imported 0 images · 1 unsupported file.');
		await expect(page.getByTestId('workspace-docks').getByText('The dropped file is not a supported image.', { exact: true })).toBeVisible();
		await expect(page.locator('.asset-browser .asset-row')).toHaveCount(0);
		await expect(page.locator('.attachment-row')).toHaveCount(0);
});

test('reports mixed valid and decode-invalid files while keeping only the valid Asset', async ({ page }) => {
		await page.goto('/');
		await dispatchViewportDrag(page, 'drop', [pngFile('good.png'), brokenImageFile('broken.png')]);

		const browser = page.locator('.asset-browser');
		await expect(browser.locator('.asset-row')).toHaveCount(1);
		await expect(browser.locator('.asset-row')).toContainText('good.png');
		await expect(page.getByRole('status', { name: 'Asset import summary', exact: true })).toContainText('Imported 1 image · 1 invalid file.');
		await page.getByText('Show import details', { exact: true }).click();
		await expect(page.getByText('Invalid', { exact: true })).toBeVisible();
		await expect(page.getByText(/broken\.png.*Image signature does not match its MIME type/)).toBeVisible();
		await expect(page.locator('.attachment-row')).toHaveCount(0);
});

test('reports a single decode failure and duplicate paths without mutation', async ({ page }) => {
		await page.goto('/');
		await dispatchViewportDrag(page, 'drop', [brokenImageFile('broken.png')]);

		await expect(page.getByTestId('workspace-docks').getByText('The dropped file could not be decoded as a supported image.', { exact: true })).toBeVisible();
		await expect(page.getByRole('status', { name: 'Asset import summary', exact: true })).toContainText('Imported 0 images · 1 invalid file.');
		await expect(page.locator('.asset-browser .asset-row')).toHaveCount(0);
		await expect(page.locator('.attachment-row')).toHaveCount(0);

		await page.reload();
		await dispatchViewportDrag(page, 'drop', [pngFile('same.png'), pngFile('same.png')]);
		await expect(page.getByRole('status', { name: 'Asset import summary', exact: true })).toContainText('Imported 0 images · 2 invalid files.');
		await expect(page.locator('.asset-browser .asset-row')).toHaveCount(0);
		await expect(page.locator('.attachment-row')).toHaveCount(0);
});

test('requires a selected bone when a rig already exists', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Create root bone', exact: true }).click();

		const emptyPoint = await screenPointForLogical(page, { x: 900, y: 900 });
		await page.mouse.click(emptyPoint.x, emptyPoint.y);
		await dispatchViewportDrag(page, 'drop', [pngFile('needs-bone.png')]);

		await expect(page.getByText('Select a bone before dropping an image on the canvas.', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'root', exact: true })).toBeVisible();
		await expect(page.locator('.attachment-row')).toHaveCount(0);
		await page.getByRole('tab', { name: 'Assets', exact: true }).click();
		await expect(page.locator('.asset-browser .asset-row')).toHaveCount(0);
});

test('supports keyboard operation of the empty-canvas import action', async ({ page }) => {
		await installDirectoryPicker(page);
		await page.goto('/');
		const importButton = page.getByRole('region', { name: /Empty 1024 by 1024 canvas/ }).getByRole('button', { name: 'Import image directory', exact: true });

		await importButton.focus();
		await expect(importButton).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.locator('.asset-browser .asset-row')).toContainText('keyboard.png');
});

test('supports keyboard operation of the empty-canvas recent action', async ({ page }) => {
		await page.goto('/');
		const recentButton = page.getByRole('region', { name: /Empty 1024 by 1024 canvas/ }).getByRole('button', { name: 'Open recent', exact: true });

		await recentButton.focus();
		await expect(recentButton).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('dialog', { name: 'Open recent projects', exact: true })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog', { name: 'Open recent projects', exact: true })).toHaveCount(0);
});

test('supports keyboard operation of the empty-canvas example action', async ({ page }) => {
		await page.goto('/');
		const exampleButton = page.getByRole('region', { name: /Empty 1024 by 1024 canvas/ }).getByRole('button', { name: 'Load example', exact: true });

		await exampleButton.focus();
		await expect(exampleButton).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
});
