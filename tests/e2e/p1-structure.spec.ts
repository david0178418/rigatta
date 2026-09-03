import { expect, test } from '@playwright/test';

const supportedViewports = [
	{ width: 1120, height: 720 },
	{ width: 1280, height: 800 },
	{ width: 1440, height: 900 },
	{ width: 1920, height: 1080 }
] as const;

test('characterizes selection in Setup and Animate modes', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();

	const arm = page.getByRole('button', { name: 'arm', exact: true });
	await arm.click();
	await expect(arm).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('heading', { name: 'arm', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Animate' }).click();
	await expect(page.getByTestId('animate-timeline')).toBeVisible();
	await expect(page.getByRole('button', { name: 'arm', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('heading', { name: 'arm', exact: true })).toBeVisible();
});

test('characterizes bone reparenting and setup slot reordering by drag and drop', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();

	const bones = page.locator('.bone-row');
	await expect(bones).toHaveCount(3);
	const targetId = await bones.nth(1).getAttribute('data-bone-id');

	if (!targetId) {
		throw new Error('The target bone ID is unavailable.');
	}

	await bones.nth(2).dragTo(bones.nth(1));
	await expect(bones.nth(2)).toHaveAttribute('data-parent-id', targetId);

	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Slot', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Slot', exact: true }).click();

	const slots = page.locator('.slot-row');
	await expect(slots).toHaveCount(2);
	await slots.nth(0).dragTo(slots.nth(1));
	await expect(slots.nth(0)).toHaveAttribute('data-draw-order-index', '1');
	await expect(slots.nth(1)).toHaveAttribute('data-draw-order-index', '0');
});

test('characterizes direct Setup transform commits without an Apply control', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();

	const xField = page.locator('input[name="x"]');
	await xField.fill('24');
	await xField.press('Enter');
	await expect(xField).toHaveValue('24');

	const rotation = page.getByLabel('Rotation (deg)', { exact: true });
	await rotation.fill('15');
	await rotation.press('Enter');
	await expect(rotation).toHaveValue('15');
	await expect(page.getByRole('button', { name: 'Apply values', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
});

test('characterizes Auto Key and explicit current-frame property keying', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();

	await expect(page.getByLabel('Auto Key')).toBeChecked();
	const xField = page.locator('input[name="x"]');
	await xField.fill('48');
	await xField.press('Enter');
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Key frame 1' })).toBeVisible();

	await page.getByLabel('Auto Key').uncheck();
	await expect(page.getByLabel('Auto Key')).not.toBeChecked();
	await page.getByRole('button', { name: 'Remove X key at frame 1', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Add X key at frame 1', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add X key at frame 1', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Remove X key at frame 1', exact: true })).toBeVisible();
});

test('characterizes key and event detail contexts in Properties', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
	await page.getByRole('button', { name: 'Track details' }).click();
	await page.getByRole('button', { name: 'Add track' }).click();
	await page.getByRole('button', { name: 'Add key' }).click();
	await page.getByRole('button', { name: 'Close Track details' }).click();

	const key = page.getByRole('button', { name: 'Key frame 1' });
	await key.click();
	await page.getByRole('button', { name: 'Key details' }).click();
	await expect(page.getByRole('region', { name: 'Key properties' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Key details' })).toHaveCount(0);
	await expect(page.getByRole('tab', { name: 'Properties', exact: true })).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('button', { name: 'Add event', exact: true }).click();
	const event = page.getByRole('button', { name: 'Event event at frame 1', exact: true });
	await event.click();
	await page.getByRole('button', { name: 'Event details' }).click();
	await expect(page.getByRole('region', { name: 'Event properties' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Event details' })).toHaveCount(0);
	await expect(page.getByLabel('Event name')).toHaveValue('event');
});

test('characterizes timeline resizing through keyboard and pointer controls', async ({ page }) => {
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

test('keeps the actual export overlay and panel contained at supported viewports', async ({ page }) => {
	await supportedViewports.reduce(async (previous, viewport) => {
		await previous;
		await page.setViewportSize(viewport);
		await page.goto('/');
		await page.getByRole('button', { name: 'Animate' }).click();
		await page.getByRole('button', { name: 'Create animation clip' }).click();
		await page.getByRole('button', { name: 'Export', exact: true }).click();

		const overlay = page.locator('.export-panel-overlay');
		const panel = page.locator('.export-panel');
		await expect(overlay).toBeVisible();
		await expect(panel).toBeVisible();

		const overlayBounds = await overlay.boundingBox();
		const panelBounds = await panel.boundingBox();

		if (!overlayBounds || !panelBounds) {
			throw new Error(`Export bounds are unavailable at ${viewport.width}x${viewport.height}.`);
		}

		expect(overlayBounds.x).toBeGreaterThanOrEqual(0);
		expect(overlayBounds.y).toBeGreaterThanOrEqual(0);
		expect(overlayBounds.x + overlayBounds.width).toBeLessThanOrEqual(viewport.width);
		expect(overlayBounds.y + overlayBounds.height).toBeLessThanOrEqual(viewport.height);
		expect(panelBounds.x).toBeGreaterThanOrEqual(overlayBounds.x);
		expect(panelBounds.y).toBeGreaterThanOrEqual(overlayBounds.y);
		expect(panelBounds.x + panelBounds.width).toBeLessThanOrEqual(overlayBounds.x + overlayBounds.width);
		expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(overlayBounds.y + overlayBounds.height);

		const documentBounds = await page.evaluate(() => ({
			height: document.documentElement.scrollHeight,
			width: document.documentElement.scrollWidth
		}));

		expect(documentBounds.width).toBeLessThanOrEqual(viewport.width);
		expect(documentBounds.height).toBeLessThanOrEqual(viewport.height);
		await page.getByRole('button', { name: 'Close Export animation' }).click();
	}, Promise.resolve());
});
