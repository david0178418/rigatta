import { expect, test, type Page } from '@playwright/test';
import { defaultProjectUiPreferences, UI_PREFERENCES_STORAGE_KEY } from '../../src/app/ui-preferences.ts';

const EXAMPLE_PROJECT_ID = '123e4567-e89b-42d3-a456-426614174100';
const EXAMPLE_ARM_BONE_ID = '123e4567-e89b-42d3-a456-426614174103';
const STALE_TARGET_ID = '123e4567-e89b-42d3-a456-426614174199';

const storedPinnedIds = async function storedPinnedIds(page: Page): Promise<readonly string[]> {
	return page.evaluate(({ key, projectId }) => {
		const raw = localStorage.getItem(key);

		if (!raw) {
			return [];
		}

		const parsed = JSON.parse(raw) as Readonly<{
			projects?: Readonly<Record<string, Readonly<{ pinnedTimelineEntityIds?: unknown }>>>;
		}>;
		const pinned = parsed.projects?.[projectId]?.pinnedTimelineEntityIds;

		return Array.isArray(pinned) && pinned.every((id): id is string => typeof id === 'string') ? pinned : [];
	}, { key: UI_PREFERENCES_STORAGE_KEY, projectId: EXAMPLE_PROJECT_ID });
};

test('pins Selection rows, keeps them synchronized, ignores stale IDs, clears them, and restores them', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	const projectPreferences = {
		...defaultProjectUiPreferences(),
		pinnedTimelineEntityIds: [STALE_TARGET_ID]
	};

	await page.addInitScript(({ key, projectId, preferences }) => {
		if (localStorage.getItem(key) !== null) {
			return;
		}

		localStorage.setItem(key, JSON.stringify({
			version: 2,
			globalDensity: 'list',
			projects: { [projectId]: preferences }
		}));
	}, { key: UI_PREFERENCES_STORAGE_KEY, projectId: EXAMPLE_PROJECT_ID, preferences: projectPreferences });
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const root = tree.getByRole('treeitem', { name: 'Bone: root', exact: true });
	await root.getByRole('button', { name: 'Expand', exact: true }).click();
	const arm = tree.getByRole('treeitem', { name: 'Bone: arm', exact: true });
	await arm.locator('.bone-row').click();
	await page.getByRole('button', { name: 'Animate', exact: true }).click();

	const timeline = page.getByTestId('animate-timeline');
	const armGroup = timeline.locator(`[data-entity-id="${EXAMPLE_ARM_BONE_ID}"]`);

	await expect(armGroup).toBeVisible();
	await expect(timeline.locator(`[data-entity-id="${STALE_TARGET_ID}"]`)).toHaveCount(0);

	await timeline.getByRole('button', { name: 'Pin arm timeline rows', exact: true }).click();
	await expect(timeline.getByRole('button', { name: 'Unpin arm timeline rows', exact: true })).toBeVisible();
	await expect.poll(() => storedPinnedIds(page)).toEqual([EXAMPLE_ARM_BONE_ID]);

	await root.locator('.bone-row').click();
	await expect(armGroup).toBeVisible();
	await expect(armGroup).not.toHaveClass(/is-selected/);
	await expect(root.locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');

	await armGroup.locator('.timeline-row-select').click();
	await expect(armGroup).toHaveClass(/is-selected/);
	await expect(arm.locator('.bone-row')).toHaveAttribute('aria-pressed', 'true');

	const rowMode = page.getByLabel('Timeline rows', { exact: true });
	await rowMode.selectOption('all-keyed');
	await expect(timeline.getByRole('button', { name: /arm timeline rows/ })).toHaveCount(0);
	await rowMode.selectOption('selection');
	await expect(timeline.getByRole('button', { name: 'Unpin arm timeline rows', exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Clear pinned timeline rows', exact: true }).click();
	await expect(timeline.getByRole('button', { name: 'Pin arm timeline rows', exact: true })).toBeVisible();
	await expect(timeline.getByRole('button', { name: 'Unpin arm timeline rows', exact: true })).toHaveCount(0);
	await expect.poll(() => storedPinnedIds(page)).toEqual([]);

	await timeline.getByRole('button', { name: 'Pin arm timeline rows', exact: true }).click();
	await expect.poll(() => storedPinnedIds(page)).toEqual([EXAMPLE_ARM_BONE_ID]);
	await page.waitForTimeout(350);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
	await expect.poll(() => storedPinnedIds(page)).toEqual([EXAMPLE_ARM_BONE_ID]);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();

	const reloadedTimeline = page.getByTestId('animate-timeline');
	await expect(reloadedTimeline.locator(`[data-entity-id="${EXAMPLE_ARM_BONE_ID}"]`)).toBeVisible();
	await expect(reloadedTimeline.getByRole('button', { name: 'Unpin arm timeline rows', exact: true })).toBeVisible();
});
