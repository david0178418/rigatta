import { expect, test, type Page } from '@playwright/test';

const openAnimationForRoot = async function openAnimationForRoot(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone' }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Animate' }).click();
	await page.getByRole('button', { name: 'Create animation clip' }).click();
};

test('shows distinct diamond states, announces changes, and preserves focus', async ({ page }) => {
	await openAnimationForRoot(page);

	const addX = page.getByRole('button', { name: 'Add X key at frame 1', exact: true });

	await expect(addX).toHaveAttribute('data-key-state', 'unkeyed');
	await expect(addX).toContainText('◇');

	await page.getByLabel('Auto Key').uncheck();
	await page.locator('input[name="x"]').fill('48');
	await page.locator('input[name="x"]').press('Enter');

	const pendingX = page.getByRole('button', { name: 'Add X key at frame 1', exact: true });

	await expect(pendingX).toHaveAttribute('data-key-state', 'pending');
	await expect(pendingX).toContainText('◈');
	await expect(page.getByTestId('keying-status')).toHaveText('X pending at frame 1.');

	await pendingX.focus();
	await pendingX.click();

	const keyedX = page.getByRole('button', { name: 'Remove X key at frame 1', exact: true });

	await expect(keyedX).toHaveAttribute('data-key-state', 'keyed');
	await expect(keyedX).toContainText('◆');
	await expect(keyedX).toBeFocused();
	await expect(page.getByTestId('keying-status')).toHaveText('X keyed at frame 1.');
});

test('adds and removes current-frame keys as undoable transactions', async ({ page }) => {
	await openAnimationForRoot(page);

	const addX = page.getByRole('button', { name: 'Add X key at frame 1', exact: true });
	const undo = page.getByRole('button', { name: 'Undo', exact: true });

	await addX.click();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Key frame 1' })).toBeVisible();

	await undo.click();
	await expect(page.getByRole('button', { name: 'Add X key at frame 1', exact: true })).toBeVisible();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toHaveCount(0);

	await page.getByRole('button', { name: 'Add X key at frame 1', exact: true }).click();
	await page.getByRole('button', { name: 'Remove X key at frame 1', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Add X key at frame 1', exact: true })).toBeVisible();

	await undo.click();
	await expect(page.getByRole('button', { name: 'Remove X key at frame 1', exact: true })).toBeVisible();
});
