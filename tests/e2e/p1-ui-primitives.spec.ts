import { expect, test } from '@playwright/test';

test('MenuButton exposes a keyboard menu with roving focus and dismissal', async ({ page }) => {
	await page.goto('/');

	const trigger = page.getByRole('button', { name: 'Project', exact: true });
	await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
	await expect(trigger).toHaveAttribute('aria-expanded', 'false');

	await trigger.press('ArrowDown');
	const menu = page.getByRole('menu', { name: 'Project', exact: true });
	await expect(menu).toBeVisible();
	await expect(menu).toHaveAttribute('aria-orientation', 'vertical');
	const menuId = await menu.getAttribute('id');

	if (!menuId) {
		throw new Error('The project menu ID is unavailable.');
	}

	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	await expect(trigger).toHaveAttribute('aria-controls', menuId);
	const enabledItems = menu.locator('[role="menuitem"]:not([disabled])');
	await expect(enabledItems.first()).toBeFocused();
	await enabledItems.first().press('ArrowDown');
	await expect(enabledItems.nth(1)).toBeFocused();
	await enabledItems.nth(1).press('End');
	await expect(enabledItems.last()).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(menu).toHaveCount(0);
	await expect(trigger).toBeFocused();

	await trigger.click();
	await expect(page.getByRole('menu', { name: 'Project', exact: true })).toBeVisible();
	await page.locator('.brand-lockup').click();
	await expect(page.getByRole('menu', { name: 'Project', exact: true })).toHaveCount(0);
});

test('Dialog traps focus, labels its heading, and restores the opener', async ({ page }) => {
	await page.goto('/');

	const project = page.getByRole('button', { name: 'Project', exact: true });
	await project.click();
	await page.getByRole('menuitem', { name: 'Project settings' }).click();

	const dialog = page.getByRole('dialog', { name: 'Project settings', exact: true });
	await expect(dialog).toBeVisible();
	await expect(dialog).toHaveAttribute('aria-modal', 'true');
	const headingId = await dialog.getAttribute('aria-labelledby');

	if (!headingId) {
		throw new Error('The project settings heading ID is unavailable.');
	}

	await expect(dialog.locator(`#${headingId}`)).toHaveText('Project settings');
	const close = dialog.getByRole('button', { name: 'Close Project settings', exact: true });
	const save = dialog.getByRole('button', { name: 'Save name', exact: true });
	await expect(close).toBeFocused();

	await save.focus();
	await save.press('Tab');
	await expect(close).toBeFocused();
	await close.press('Shift+Tab');
	await expect(save).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(project).toBeFocused();

	await project.click();
	await page.getByRole('menuitem', { name: 'Project settings' }).click();
	await expect(page.getByRole('dialog', { name: 'Project settings', exact: true })).toBeVisible();
	await page.locator('.dialog-overlay').click({ position: { x: 4, y: 4 } });
	await expect(page.getByRole('dialog', { name: 'Project settings', exact: true })).toHaveCount(0);
});

test('Popover supports keyboard dismissal, focus return, and viewport containment', async ({ page }) => {
	await page.setViewportSize({ width: 1120, height: 720 });
	await page.goto('/');

	const trigger = page.getByRole('button', { name: 'Grid settings', exact: true });
	await trigger.press('Enter');

	const popover = page.getByRole('dialog', { name: 'Grid settings', exact: true });
	await expect(popover).toBeVisible();
	await expect(trigger).toHaveAttribute('aria-expanded', 'true');
	const popoverId = await popover.getAttribute('id');

	if (!popoverId) {
		throw new Error('The grid popover ID is unavailable.');
	}

	await expect(trigger).toHaveAttribute('aria-controls', popoverId);
	await expect(page.getByLabel('Show grid')).toBeFocused();
	const popoverBounds = await popover.boundingBox();

	if (!popoverBounds) {
		throw new Error('The grid popover bounds are unavailable.');
	}

	expect(popoverBounds.x).toBeGreaterThanOrEqual(0);
	expect(popoverBounds.y).toBeGreaterThanOrEqual(0);
	expect(popoverBounds.x + popoverBounds.width).toBeLessThanOrEqual(1120);
	expect(popoverBounds.y + popoverBounds.height).toBeLessThanOrEqual(720);

	await page.keyboard.press('Escape');
	await expect(popover).toHaveCount(0);
	await expect(trigger).toBeFocused();

	await trigger.click();
	await expect(page.getByRole('dialog', { name: 'Grid settings', exact: true })).toBeVisible();
	await page.locator('.topbar').click({ position: { x: 12, y: 12 } });
	await expect(page.getByRole('dialog', { name: 'Grid settings', exact: true })).toHaveCount(0);
});

test('Tabs expose horizontal roving focus and selection state', async ({ page }) => {
	await page.goto('/');

	const tabs = page.getByRole('tablist', { name: 'Left dock', exact: true });
	const rig = tabs.getByRole('tab', { name: 'Rig', exact: true });
	const drawOrder = tabs.getByRole('tab', { name: 'Draw Order', exact: true });

	await expect(tabs).toHaveAttribute('aria-orientation', 'horizontal');
	await expect(rig).toHaveAttribute('aria-selected', 'true');
	await expect(rig).toHaveAttribute('tabindex', '0');
	await rig.focus();
	await rig.press('ArrowRight');
	await expect(drawOrder).toBeFocused();
	await expect(drawOrder).toHaveAttribute('aria-selected', 'true');
	await expect(rig).toHaveAttribute('tabindex', '-1');
	await drawOrder.press('Home');
	await expect(rig).toBeFocused();
	await expect(rig).toHaveAttribute('aria-selected', 'true');
});
