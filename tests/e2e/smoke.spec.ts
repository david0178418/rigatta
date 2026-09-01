import { expect, test } from '@playwright/test';

test('opens the empty editor shell', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('Bone Animation Utility');
	await expect(page.getByRole('heading', { name: 'Untitled project' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Animate' })).toBeVisible();
	await expect(page.getByText('Drop image parts here')).toBeVisible();
});

test('recovers a committed root edit after reload', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await expect(page.getByText('root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
	await page.waitForTimeout(700);
	await page.reload();

	await expect(page.getByRole('heading', { name: 'Untitled project' })).toBeVisible();
	await expect(page.getByText('root', { exact: true })).toBeVisible();
});

test('renders a fixed logical canvas and exposes PNG extraction', async ({ page }) => {
	await page.goto('/');

	const canvas = page.locator('canvas.pixi-canvas');
	await expect(canvas).toBeVisible();
	expect(await canvas.getAttribute('width')).toBe('1024');
	expect(await canvas.getAttribute('height')).toBe('1024');

	const dataUrlPrefix = await page.evaluate(() => {
		const renderedCanvas = document.querySelector<HTMLCanvasElement>('canvas.pixi-canvas');

		if (!renderedCanvas) {
			throw new Error('The Pixi canvas was not mounted.');
		}

		return renderedCanvas.toDataURL('image/png').slice(0, 22);
	});

	expect(dataUrlPrefix).toBe('data:image/png;base64,');
});

test('supports viewport zoom controls and reset', async ({ page }) => {
	await page.goto('/');

	const zoom = page.getByRole('button', { name: 'Zoom in' });
	await zoom.click();
	await expect(page.getByRole('button', { name: 'Reset viewport' })).toHaveText('110%');

	await page.getByRole('button', { name: 'Center viewport' }).click();
	await expect(page.getByRole('button', { name: 'Reset viewport' })).toHaveText('100%');
});

test('imports an image directory and creates a dropped image part', async ({ page }) => {
	await page.addInitScript(() => {
		const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gkBBxAXAvkWQwAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wOS0wMVQwNzoxNjoyMyswMDowMMxohAEAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDktMDFUMDc6MTY6MjMrMDA6MDC9NTy9AAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA5LTAxVDA3OjE2OjIzKzAwOjAw6iAdYgAAAA9JREFUKM9jYBgFo4B8AAACQAABjMWrdwAAAABJRU5ErkJggg=='), (character) => character.charCodeAt(0));
		type MockFileEntry = Readonly<{
			kind: 'file';
			name: string;
			isSameEntry: (other: FileSystemHandle) => Promise<boolean>;
			getFile: () => Promise<File>;
		}>;
		const sameEntry = async function sameEntry(): Promise<boolean> {
			return false;
		};
		const getFile = async function getFile(): Promise<File> {
			return new File([pngBytes], 'hero.png', { type: 'image/png' });
		};
		const values = async function* values(): AsyncGenerator<MockFileEntry> {
			yield { kind: 'file', name: 'hero.png', isSameEntry: sameEntry, getFile };
		};

		Object.defineProperty(window, 'showDirectoryPicker', {
			configurable: true,
			value: async () => ({
				kind: 'directory',
				name: 'parts',
				isSameEntry: sameEntry,
				values
			})
		});
	});
	await page.goto('/');

	await page.getByRole('button', { name: 'Import image directory' }).click();
	await expect(page.getByText('hero.png', { exact: true })).toBeVisible();
	await page.locator('.asset-row').dragTo(page.locator('.pixi-viewport'));

	await expect(page.getByText('root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
	await page.getByRole('button', { name: 'root' }).click();
	const viewport = page.locator('.pixi-viewport');
	const bounds = await viewport.boundingBox();

	if (!bounds) {
		throw new Error('The viewport bounds are unavailable.');
	}

	await page.keyboard.down('Control');
	await page.keyboard.down('Shift');
	await page.mouse.move(bounds.x + bounds.width / 2 - 50, bounds.y + bounds.height / 2 - 50);
	await page.mouse.down();
	await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2 + 50);
	await page.mouse.up();
	await page.keyboard.up('Shift');
	await page.keyboard.up('Control');
	await expect(page.getByText('2 items selected.', { exact: true })).toBeVisible();
});

test('builds and edits a hierarchy through the inspector', async ({ page }) => {
	await page.goto('/');

	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add child bone' }).click();
	await expect(page.getByRole('button', { name: 'bone', exact: true })).toBeVisible();

	await page.getByLabel('Selected name').fill('arm');
	await page.getByRole('button', { name: 'Rename' }).click();
	await expect(page.getByRole('button', { name: 'arm', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add slot' }).click();
	await expect(page.getByRole('button', { name: 'slot', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'arm', exact: true }).click();
	await page.getByRole('button', { name: 'Add point' }).click();
	await expect(page.getByRole('button', { name: 'point', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByRole('button', { name: 'point', exact: true })).toHaveCount(0);
});
