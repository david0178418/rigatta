import { expect, test } from '@playwright/test';

const supportedViewports = [
	{ width: 1120, height: 720 },
	{ width: 1280, height: 800 },
	{ width: 1440, height: 900 },
	{ width: 1920, height: 1080 }
] as const;

test('keeps the desktop editor usable at supported viewport sizes', async ({ page }) => {
	await supportedViewports.reduce(async (previous, viewport) => {
		await previous;
		await page.setViewportSize(viewport);
		await page.goto('/');
		await page.getByRole('button', { name: 'Project', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
		await page.getByRole('treeitem', { name: 'Bone: right arm', exact: true }).locator('.bone-row').click();

		await expect(page.getByRole('button', { name: 'Setup' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Animate' })).toBeVisible();
		await expect(page.locator('canvas.pixi-canvas')).toBeVisible();
		await expect(page.getByRole('contentinfo', { name: 'Animation timeline' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Move', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Rotate', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Scale', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Shear', exact: true })).toBeVisible();

		const stageBounds = await page.locator('.viewport-stage').boundingBox();
		const viewportBounds = await page.locator('.pixi-viewport').boundingBox();

		if (!stageBounds || !viewportBounds) {
			throw new Error(`The viewport bounds are unavailable at ${viewport.width}x${viewport.height}.`);
		}

		expect(Math.abs(viewportBounds.x - stageBounds.x)).toBeLessThan(1);
		expect(Math.abs(viewportBounds.y - stageBounds.y)).toBeLessThan(1);
		expect(Math.abs(viewportBounds.width - stageBounds.width)).toBeLessThan(1);
		expect(Math.abs(viewportBounds.height - stageBounds.height)).toBeLessThan(1);
		await expect(page.locator('.pixi-viewport')).toHaveAttribute('data-camera-mode', 'fit');

		const setupScrollMetrics = await page.evaluate(() => ({
			documentHeight: document.documentElement.scrollHeight,
			documentWidth: document.documentElement.scrollWidth,
			viewportHeight: window.innerHeight,
			viewportWidth: window.innerWidth
		}));

		expect(setupScrollMetrics.documentWidth, `horizontal overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.width);
		expect(setupScrollMetrics.documentHeight, `vertical overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.height);
		expect(setupScrollMetrics.viewportWidth).toBe(viewport.width);
		expect(setupScrollMetrics.viewportHeight).toBe(viewport.height);

		await page.getByRole('button', { name: 'Animate' }).click();
		await expect(page.getByTestId('animate-timeline')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Play animation' })).toBeVisible();
		await expect(page.getByLabel('Timeline ruler')).toBeVisible();
		await expect(page.locator('.track-row').first()).toBeInViewport({ ratio: 0.1 });
		await expect(page.getByTestId('timeline-scroll-region')).toBeVisible();

		const animateScrollMetrics = await page.evaluate(() => ({
			documentHeight: document.documentElement.scrollHeight,
			documentWidth: document.documentElement.scrollWidth
		}));

		expect(animateScrollMetrics.documentWidth, `horizontal Animate overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.width);
		expect(animateScrollMetrics.documentHeight, `vertical Animate overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.height);
	}, Promise.resolve());
});

test('runs the P0 editor workflow at every supported viewport size', async ({ page }) => {
		await supportedViewports.reduce(async (previous, viewport) => {
			await previous;
			await page.setViewportSize(viewport);
			await page.goto('/');
			await page.getByRole('button', { name: 'Project', exact: true }).click();
			await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
			await page.getByRole('treeitem', { name: 'Bone: right arm', exact: true }).locator('.bone-row').click();
			await page.getByRole('button', { name: 'Rotate', exact: true }).click();
			await expect(page.getByRole('button', { name: 'Rotate', exact: true })).toHaveAttribute('aria-pressed', 'true');
			const rotation = page.getByLabel('Rotation (deg)', { exact: true });
			await rotation.fill('15');
			await rotation.press('Enter');
			await page.getByRole('button', { name: 'Animate' }).click();

			const splitter = page.getByRole('separator', { name: 'Resize animation timeline' });
			await expect(splitter).toHaveAttribute('aria-valuemax', String(Math.floor(viewport.height * 0.55)));
			await splitter.focus();
			await splitter.press('ArrowUp');
			await splitter.press('Home');
			await splitter.press('End');

			await page.getByLabel('Playhead').fill('6');
			await expect(page.getByText('Frame 7 / 12', { exact: false })).toBeVisible();
			await page.getByRole('button', { name: 'Key frame 7' }).click();
			await expect(page.getByRole('tab', { name: 'Properties', exact: true })).toHaveAttribute('aria-selected', 'true');
			await expect(page.getByRole('region', { name: 'Key properties' })).toBeVisible();

			await page.getByRole('button', { name: 'Play animation' }).click();
			await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible();
			await page.getByRole('button', { name: 'Pause animation' }).click();

			const scrollMetrics = await page.evaluate(() => ({
				documentHeight: document.documentElement.scrollHeight,
				documentWidth: document.documentElement.scrollWidth,
				viewportHeight: window.innerHeight,
				viewportWidth: window.innerWidth
			}));

			expect(scrollMetrics.documentWidth).toBeLessThanOrEqual(scrollMetrics.viewportWidth);
			expect(scrollMetrics.documentHeight).toBeLessThanOrEqual(scrollMetrics.viewportHeight);
		}, Promise.resolve());
});

test('resizes the Animate timeline with keyboard and pointer controls', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		await page.getByRole('button', { name: 'Project', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
		await page.getByRole('button', { name: 'Animate' }).click();

		const splitter = page.getByRole('separator', { name: 'Resize animation timeline' });
		await expect(splitter).toHaveAttribute('aria-valuemin', '190');
		await expect(splitter).toHaveAttribute('aria-valuemax', '440');
		await expect(splitter).toHaveAttribute('aria-valuenow', '260');

		await splitter.focus();
		await splitter.press('ArrowUp');
		await expect(splitter).toHaveAttribute('aria-valuenow', '276');
		await splitter.press('Home');
		await expect(splitter).toHaveAttribute('aria-valuenow', '190');
		await splitter.press('End');
		await expect(splitter).toHaveAttribute('aria-valuenow', '440');

		const bounds = await splitter.boundingBox();

		if (!bounds) {
			throw new Error('The timeline splitter bounds are unavailable.');
		}

		await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
		await page.mouse.down();
		await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 32);
		await page.mouse.up();
		await expect(splitter).toHaveAttribute('aria-valuenow', '408');
	});

test('keeps editor docks and the timeline independently scrollable', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.addInitScript(() => {
			const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gkBBxAXAvkWQwAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0wOS0wMVQwNzoxNjoyMyswMDowMMxohAEAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMDktMDFUMDc6MTY6MjMrMDA6MDC9NTy9AAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTA5LTAxVDA3OjE2OjIzKzAwOjAw6iAdYgAAAA9JREFUKM9jYBgFo4B8AAACQAABjMWrdwAAAABJRU5ErkJggg=='), (character) => character.charCodeAt(0));
			const sameEntry = async function sameEntry(): Promise<boolean> {
				return false;
			};
			const values = async function* values(): AsyncGenerator<{
				kind: 'file';
				name: string;
				isSameEntry: () => Promise<boolean>;
				getFile: () => Promise<File>;
			}> {
				yield* Array.from({ length: 24 }, (_, index) => {
					const name = `asset-${index + 1}.png`;

					return {
						kind: 'file' as const,
						name,
						isSameEntry: sameEntry,
						getFile: async function getFile(): Promise<File> {
							return new File([pngBytes], name, { type: 'image/png' });
						}
					};
				});
			};

			Object.defineProperty(window, 'showDirectoryPicker', {
				configurable: true,
				value: async () => ({ kind: 'directory', name: 'parts', isSameEntry: sameEntry, values })
			});
		});
		await page.goto('/');
		await page.getByRole('button', { name: 'Import image directory' }).click();
		await expect(page.getByText('asset-24.png', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Create root bone' }).click();
		await page.getByRole('button', { name: 'root', exact: true }).click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await page.getByRole('menuitem', { name: 'Point attachment', exact: true }).click();
		await page.getByRole('button', { name: 'root', exact: true }).click();
		await page.getByRole('button', { name: 'Animate' }).click();
		await page.getByRole('button', { name: 'Create animation clip' }).click();
		await page.getByRole('button', { name: 'Track details' }).click();
		await page.getByRole('button', { name: 'Add track' }).click();
		await page.getByRole('button', { name: 'Add key' }).click();
		await page.keyboard.press('Escape');

		const metrics = await page.evaluate(() => ({
			bodyHeight: document.body.scrollHeight,
			bodyWidth: document.body.scrollWidth,
			documentHeight: document.documentElement.scrollHeight,
			documentWidth: document.documentElement.scrollWidth,
			libraryOverflowY: getComputedStyle(document.querySelector<HTMLElement>('.library-panel') ?? document.body).overflowY,
			libraryScrollHeight: document.querySelector<HTMLElement>('.library-panel')?.scrollHeight ?? 0,
			libraryClientHeight: document.querySelector<HTMLElement>('.library-panel')?.clientHeight ?? 0,
			inspectorScrollHeight: document.querySelector<HTMLElement>('.inspector-panel')?.scrollHeight ?? 0,
			inspectorClientHeight: document.querySelector<HTMLElement>('.inspector-panel')?.clientHeight ?? 0,
			timelineScrollHeight: document.querySelector<HTMLElement>('[data-testid="timeline-scroll-region"]')?.scrollHeight ?? 0,
			timelineClientHeight: document.querySelector<HTMLElement>('[data-testid="timeline-scroll-region"]')?.clientHeight ?? 0
		}));

		expect(metrics.bodyWidth).toBe(1280);
		expect(metrics.bodyHeight).toBe(800);
		expect(metrics.documentWidth).toBe(1280);
		expect(metrics.documentHeight).toBe(800);
		expect(metrics.libraryOverflowY).toBe('auto');
		expect(metrics.libraryScrollHeight).toBeGreaterThanOrEqual(metrics.libraryClientHeight);
		expect(metrics.inspectorScrollHeight).toBeGreaterThan(metrics.inspectorClientHeight);
		expect(metrics.timelineScrollHeight).toBeGreaterThan(metrics.timelineClientHeight);

		const scrollTopValues = await page.evaluate(() => {
			const library = document.querySelector<HTMLElement>('.library-panel');
			const inspector = document.querySelector<HTMLElement>('.inspector-panel');
			const timeline = document.querySelector<HTMLElement>('[data-testid="timeline-scroll-region"]');

			if (!library || !inspector || !timeline) {
				throw new Error('Expected editor scroll regions are unavailable.');
			}

			library.scrollTop = library.scrollHeight;
			inspector.scrollTop = inspector.scrollHeight;
			timeline.scrollTop = timeline.scrollHeight;

			return {
				bodyScrollTop: document.documentElement.scrollTop,
				inspectorScrollTop: inspector.scrollTop,
				libraryScrollTop: library.scrollTop,
				timelineScrollTop: timeline.scrollTop
			};
		});

		expect(scrollTopValues.bodyScrollTop).toBe(0);
		expect(scrollTopValues.libraryScrollTop).toBeGreaterThan(0);
		expect(scrollTopValues.inspectorScrollTop).toBeGreaterThan(0);
		expect(scrollTopValues.timelineScrollTop).toBeGreaterThan(0);
});
