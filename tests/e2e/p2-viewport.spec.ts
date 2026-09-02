import { expect, test } from '@playwright/test';

const logicalPointOnViewport = function logicalPointOnViewport(
	bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
	logicalX: number,
	logicalY: number
): Readonly<{ x: number; y: number }> {
	return {
		x: bounds.x + bounds.width / 2 + logicalX - 128,
		y: bounds.y + bounds.height / 2 + logicalY - 128
	};
};

test('routes primary selection and marquee separately from middle and Space pan', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');

	const viewport = page.locator('.pixi-viewport');
	const host = page.locator('.pixi-host');
	const readout = page.getByLabel('Canvas coordinate readout');
	const bounds = await viewport.boundingBox();

	if (!bounds) {
		throw new Error('The viewport bounds are unavailable.');
	}

	const emptyStart = { x: bounds.x + 24, y: bounds.y + 24 };
	const emptyEnd = { x: bounds.x + 120, y: bounds.y + 120 };
	const initialHostStyle = await host.getAttribute('style');

	await page.mouse.move(emptyStart.x, emptyStart.y);
	await page.mouse.down();
	await page.mouse.move(emptyEnd.x, emptyEnd.y, { steps: 3 });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'marquee');
	await expect(page.locator('.viewport-marquee')).toBeVisible();
	await page.mouse.up();
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');
	await expect(host).toHaveAttribute('style', initialHostStyle ?? '');

	const middleStart = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
	const middleEnd = { x: middleStart.x + 64, y: middleStart.y - 36 };

	await page.mouse.move(middleStart.x, middleStart.y);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.move(middleEnd.x, middleEnd.y, { steps: 3 });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'pan');
	await expect(host).toHaveClass(/is-panning/);
	await page.mouse.up({ button: 'middle' });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');

	const afterMiddleStyle = await host.getAttribute('style');

	await page.keyboard.down('Space');
	await page.mouse.move(middleStart.x, middleStart.y);
	await page.mouse.down();
	await page.mouse.move(middleStart.x - 40, middleStart.y + 28, { steps: 3 });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'pan');
	await page.mouse.up();
	await page.keyboard.up('Space');
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');
	await expect(host).not.toHaveAttribute('style', afterMiddleStyle ?? '');

	const anchor = { x: bounds.x + bounds.width * 0.25, y: bounds.y + bounds.height * 0.4 };
	await page.mouse.move(anchor.x, anchor.y);
	const coordinateBeforeZoom = await readout.textContent();
	await page.mouse.wheel(0, -100);
	await expect(page.getByRole('button', { name: 'Reset viewport' })).toHaveText('110%');
	await page.mouse.move(anchor.x, anchor.y);
	await expect(readout).toHaveText(coordinateBeforeZoom ?? '');
});

test('constrains a transform, exposes feedback, groups history, and cancels on Escape', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await page.getByRole('button', { name: 'Load example' }).click();
	const arm = page.getByRole('button', { name: 'arm', exact: true });
	await arm.click();
	await expect(arm).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: 'Center viewport' }).click();

	const viewport = page.locator('.pixi-viewport');
	const bounds = await viewport.boundingBox();

	if (!bounds) {
		throw new Error('The viewport bounds are unavailable.');
	}

	const start = logicalPointOnViewport(bounds, 190, 128);
	const end = { x: start.x + 32, y: start.y + 18 };
	const xField = page.locator('input[name="x"]');
	const yField = page.locator('input[name="y"]');
	const originalX = await xField.inputValue();
	const originalY = await yField.inputValue();

	await page.keyboard.down('Shift');
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 5 });
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'transform');
	await expect(page.getByText('Shift constraint active', { exact: true })).toBeVisible();
	await page.mouse.up();
	await page.keyboard.up('Shift');
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');
	await expect(page.getByText('Shift constraint active', { exact: true })).toHaveCount(0);
	await expect(xField).not.toHaveValue(originalX);
	await expect(yField).toHaveValue(originalY);

	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	await expect(undo).toBeEnabled();
	await undo.click();
	await expect(xField).toHaveValue(originalX);
	await expect(yField).toHaveValue(originalY);
	await expect(undo).toBeDisabled();

	await page.keyboard.down('Shift');
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x + 24, end.y + 12, { steps: 4 });
	await expect(page.getByText('Shift constraint active', { exact: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await page.keyboard.up('Shift');
	await page.mouse.up();
	await expect(viewport).toHaveAttribute('data-gesture-mode', 'idle');
	await expect(page.getByText('Shift constraint active', { exact: true })).toHaveCount(0);
	await expect(xField).toHaveValue(originalX);
	await expect(yField).toHaveValue(originalY);
	await expect(undo).toBeDisabled();
});
