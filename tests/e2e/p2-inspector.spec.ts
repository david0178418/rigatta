import { expect, test } from '@playwright/test';

const UI_PREFERENCES_STORAGE_KEY = 'bone-animation.ui-preferences.v1';
const EXAMPLE_PROJECT_ID = '123e4567-e89b-42d3-a456-426614174100';

test('persists inspector collapse state for the matching project only', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await page.getByRole('button', { name: 'arm', exact: true }).click();
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Clip settings', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Collapse Clip' })).toBeVisible();
	await page.getByRole('button', { name: 'Collapse Clip' }).press('Enter');
	await expect(page.getByRole('button', { name: 'Expand Clip' })).toBeVisible();
	await expect(page.locator('#inspector-section-content-clip')).toBeHidden();
	await page.getByRole('button', { name: 'Expand Clip' }).click();

	const collapseEntityProperties = page.getByRole('button', { name: 'Collapse Entity properties' });

	await expect(collapseEntityProperties).toBeVisible();
	await collapseEntityProperties.click();
	await expect(page.getByRole('button', { name: 'Expand Entity properties' })).toBeVisible();
	await expect(page.locator('#inspector-section-content-entity-properties')).toBeHidden();
	await page.waitForTimeout(50);
	await expect.poll(() => page.evaluate(({ key, projectId }) => {
		const raw = localStorage.getItem(key);

		if (!raw) {
			return false;
		}

		const preferences = JSON.parse(raw) as Readonly<{
			projects?: Readonly<Record<string, Readonly<{ collapsedInspectorSections?: unknown }>>>;
		}>;
		const sections = preferences.projects?.[projectId]?.collapsedInspectorSections;

		return Array.isArray(sections) && sections.includes('entity-properties');
	}, { key: UI_PREFERENCES_STORAGE_KEY, projectId: EXAMPLE_PROJECT_ID })).toBe(false);
	await expect.poll(() => page.evaluate(({ key, projectId }) => {
		const raw = localStorage.getItem(key);

		if (!raw) {
			return false;
		}

		const preferences = JSON.parse(raw) as Readonly<{
			projects?: Readonly<Record<string, Readonly<{ collapsedInspectorSections?: unknown }>>>;
		}>;
		const sections = preferences.projects?.[projectId]?.collapsedInspectorSections;

		return Array.isArray(sections) && sections.includes('entity-properties');
	}, { key: UI_PREFERENCES_STORAGE_KEY, projectId: EXAMPLE_PROJECT_ID })).toBe(true);

	await page.getByRole('button', { name: 'Project' }).click();
	page.once('dialog', (dialog) => void dialog.accept());
	await page.getByRole('menuitem', { name: 'New project' }).click();
	await expect(page.getByRole('button', { name: 'Collapse Entity properties' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Expand Entity properties' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Expand Entity properties' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Collapse Entity properties' })).toHaveCount(0);
	await page.waitForTimeout(400);

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Expand Entity properties' })).toBeVisible();
	await expect(page.locator('#inspector-section-content-entity-properties')).toBeHidden();
});
