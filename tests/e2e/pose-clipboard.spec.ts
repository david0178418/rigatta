import { expect, test, type Locator, type Page } from '@playwright/test';

const poseNoticeFor = function poseNoticeFor(page: Page): Locator {
	return page.locator('.pose-clipboard-notice[role="status"]');
};

const openPoseMenu = async function openPoseMenu(page: Page): Promise<Locator> {
	await page.getByRole('button', { name: 'Pose clipboard', exact: true }).click();

	return page.getByRole('menu', { name: 'Pose clipboard', exact: true });
};

const clickPoseAction = async function clickPoseAction(page: Page, action: 'Copy pose' | 'Paste pose'): Promise<void> {
	const menu = await openPoseMenu(page);

	await menu.getByRole('menuitem', { name: action, exact: true }).click();
};

const loadExampleAnimation = async function loadExampleAnimation(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await expect(page.getByTestId('animate-timeline')).toBeVisible();
};

const showAllKeyedTimelineRows = async function showAllKeyedTimelineRows(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Timeline options', exact: true }).click();
	await page.getByRole('dialog', { name: 'Timeline options', exact: true }).getByRole('combobox', { name: 'Timeline rows', exact: true }).selectOption({ label: 'All keyed' });
	await page.keyboard.press('Escape');
};

const copyInterpolatedExamplePose = async function copyInterpolatedExamplePose(page: Page): Promise<string> {
	await showAllKeyedTimelineRows(page);

	const playhead = page.getByLabel('Playhead', { exact: true });
	const canvas = page.locator('canvas.pixi-canvas');

	await playhead.fill('0');
	await expect(page.getByText('Frame 1 / 12', { exact: false })).toBeVisible();
	const firstFrameImage = (await canvas.screenshot()).toString('base64');

	await playhead.fill('2');
	await expect(page.getByText('Frame 3 / 12', { exact: false })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Key frame 3', exact: true })).toHaveCount(0);
	await expect.poll(async () => (await canvas.screenshot()).toString('base64')).not.toBe(firstFrameImage);
	const copiedPoseImage = (await canvas.screenshot()).toString('base64');

	await clickPoseAction(page, 'Copy pose');
	await expect(poseNoticeFor(page)).toHaveText('Copied pose: 14 bones and 14 attachments.');

	return copiedPoseImage;
};

test('shows the empty Animate state without pose controls when no clip is available', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Animate', exact: true }).click();

	const poseClipboard = page.getByRole('button', { name: 'Pose clipboard', exact: true });

	await expect(page.getByText('No clips yet', { exact: true })).toBeVisible();
	await expect(poseClipboard).toHaveCount(0);
});

test('exposes exact pose actions, shortcut metadata, and pre-copy disabled state', async ({ page }) => {
	await loadExampleAnimation(page);

	const poseMenu = await openPoseMenu(page);
	const copyPose = poseMenu.getByRole('menuitem', { name: 'Copy pose', exact: true });
	const pastePose = poseMenu.getByRole('menuitem', { name: 'Paste pose', exact: true });

	await expect(copyPose).toBeVisible();
	await expect(copyPose).toBeEnabled();
	await expect(pastePose).toBeVisible();
	await expect(pastePose).toBeDisabled();
	await expect(copyPose).toContainText('Ctrl/Cmd + Shift + C');
	await expect(pastePose).toContainText('Ctrl/Cmd + Shift + V');
	await copyPose.click();
	const reopenedPoseMenu = await openPoseMenu(page);
	await expect(reopenedPoseMenu.getByRole('menuitem', { name: 'Paste pose', exact: true })).toBeEnabled();
});

test('copies an interpolated pose with all example entities through visible feedback', async ({ page }) => {
	await loadExampleAnimation(page);
	await copyInterpolatedExamplePose(page);

	const notice = poseNoticeFor(page);

	await expect(notice).toHaveAttribute('role', 'status');
	await expect(notice).toHaveAttribute('aria-live', 'polite');
	await expect(notice).toHaveText('Copied pose: 14 bones and 14 attachments.');
	const poseMenu = await openPoseMenu(page);
	await expect(poseMenu.getByRole('menuitem', { name: 'Paste pose', exact: true })).toBeEnabled();
	await page.keyboard.press('Escape');
});

test('pastes into an empty same-project clip, keeps the destination frame, and undoes atomically', async ({ page }) => {
	await loadExampleAnimation(page);
	const copiedPoseImage = await copyInterpolatedExamplePose(page);

	await page.getByRole('button', { name: '+ Clip', exact: true }).click();
	const destinationClip = page.getByRole('button', { name: 'clip 2', exact: true });
	await expect(destinationClip).toHaveAttribute('aria-pressed', 'true');

	await showAllKeyedTimelineRows(page);
	const playhead = page.getByLabel('Playhead', { exact: true });
	const canvas = page.locator('canvas.pixi-canvas');
	await playhead.fill('4');
	await expect(page.getByText('Frame 5 / 12', { exact: false })).toBeVisible();
	await expect(playhead).toHaveValue('4');
	await expect.poll(async () => (await canvas.screenshot()).toString('base64')).not.toBe(copiedPoseImage);
	const destinationBeforePasteImage = (await canvas.screenshot()).toString('base64');

	await clickPoseAction(page, 'Paste pose');
	await expect(poseNoticeFor(page)).toHaveText('Pasted pose: 196 properties across 14 bones and 14 attachments; 196 keys created and 0 updated.');
	await expect(poseNoticeFor(page)).toHaveAttribute('aria-live', 'polite');
	await expect.poll(async () => (await canvas.screenshot()).toString('base64')).toBe(copiedPoseImage);
	await expect(playhead).toHaveValue('4');
	await expect(page.getByText('Frame 5 / 12', { exact: false })).toBeVisible();
	await expect(page.getByText('196 matching tracks', { exact: true })).toBeVisible();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await expect(page.getByText('Image transform · x · robot core', { exact: true })).toBeVisible();
	const destinationMarkers = page.getByRole('button', { name: 'Key frame 5', exact: true });
	await expect(destinationMarkers).toHaveCount(196);
	await expect(destinationMarkers.first()).toBeVisible();

	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(destinationClip).toBeVisible();
	await expect(destinationClip).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('0 matching tracks', { exact: true })).toBeVisible();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Key frame 5', exact: true })).toHaveCount(0);
	await expect(playhead).toHaveValue('4');
	await expect.poll(async () => (await canvas.screenshot()).toString('base64')).toBe(destinationBeforePasteImage);

	await page.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect.poll(async () => (await canvas.screenshot()).toString('base64')).toBe(copiedPoseImage);
	await expect(page.getByText('196 matching tracks', { exact: true })).toBeVisible();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Key frame 5', exact: true })).toHaveCount(196);
	await expect(playhead).toHaveValue('4');
});

test('routes shifted shortcuts to pose actions while unshifted shortcuts stay timeline-local', async ({ page }) => {
	await loadExampleAnimation(page);
	await showAllKeyedTimelineRows(page);

	const timeline = page.getByTestId('animate-timeline');
	await timeline.focus();
	await page.keyboard.press('Control+Shift+C');
	await expect(poseNoticeFor(page)).toHaveText('Copied pose: 14 bones and 14 attachments.');

	await page.getByRole('button', { name: '+ Clip', exact: true }).click();
	const destinationClip = page.getByRole('button', { name: 'clip 2', exact: true });
	await expect(destinationClip).toHaveAttribute('aria-pressed', 'true');

	const playhead = page.getByLabel('Playhead', { exact: true });
	await playhead.fill('4');
	await expect(page.getByText('Frame 5 / 12', { exact: false })).toBeVisible();
	await timeline.focus();
	await page.keyboard.press('Control+Shift+V');
	await expect(poseNoticeFor(page)).toHaveText('Pasted pose: 196 properties across 14 bones and 14 attachments; 196 keys created and 0 updated.');
	await expect(playhead).toHaveValue('4');
	await expect(page.getByText('Frame 5 / 12', { exact: false })).toBeVisible();
	await showAllKeyedTimelineRows(page);
	await expect(page.getByText('196 matching tracks', { exact: true })).toBeVisible();
	await expect(page.getByText('Bone transform · x · root', { exact: true })).toBeVisible();
});

test('keeps timeline-local copy and paste separate from pose shortcuts', async ({ page }) => {
	await loadExampleAnimation(page);
	await showAllKeyedTimelineRows(page);

	const sourceKey = page.getByRole('button', { name: 'Key frame 1', exact: true }).first();
	await sourceKey.click();
	await page.getByTestId('animate-timeline').focus();
	await page.keyboard.press('Control+c');
	await expect(page.getByText('Copied 1 key.', { exact: true })).toBeVisible();
	await expect(poseNoticeFor(page)).toHaveCount(0);

	await page.getByLabel('Playhead', { exact: true }).fill('2');
	await page.getByTestId('animate-timeline').focus();
	await page.keyboard.press('Control+v');
	await expect(page.getByText('Pasted 1 key.', { exact: true })).toBeVisible();
	await expect(poseNoticeFor(page)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Key frame 3', exact: true })).toHaveCount(1);
});

test('ignores pose shortcuts in Setup mode and while a typing target has focus', async ({ page }) => {
	await loadExampleAnimation(page);

	await page.getByRole('button', { name: '+ Clip', exact: true }).click();
	const destinationClip = page.getByRole('button', { name: 'clip 2', exact: true });

	await page.getByRole('button', { name: 'Setup', exact: true }).click();
	await page.keyboard.press('Control+Shift+C');
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	const setupPoseMenu = await openPoseMenu(page);
	await expect(setupPoseMenu.getByRole('menuitem', { name: 'Paste pose', exact: true })).toBeDisabled();
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: 'walk', exact: true }).click();
	await page.getByRole('button', { name: 'Timeline options', exact: true }).click();
	const timelineOptions = page.getByRole('dialog', { name: 'Timeline options', exact: true });
	const filter = timelineOptions.getByLabel('Filter tracks', { exact: true });
	await filter.focus();
	await page.keyboard.press('Control+Shift+C');
	await expect(poseNoticeFor(page)).toHaveCount(0);
	await page.keyboard.press('Escape');
	const filteredPoseMenu = await openPoseMenu(page);
	await expect(filteredPoseMenu.getByRole('menuitem', { name: 'Paste pose', exact: true })).toBeDisabled();
	await page.keyboard.press('Escape');

	await page.getByTestId('animate-timeline').focus();
	await page.keyboard.press('Control+Shift+C');
	await expect(poseNoticeFor(page)).toHaveText('Copied pose: 14 bones and 14 attachments.');

	await destinationClip.click();
	await page.getByRole('button', { name: 'Timeline options', exact: true }).click();
	const destinationOptions = page.getByRole('dialog', { name: 'Timeline options', exact: true });
	const destinationFilter = destinationOptions.getByLabel('Filter tracks', { exact: true });
	await destinationFilter.focus();
	await page.keyboard.press('Control+Shift+V');
	await expect(page.getByText(/^Pasted pose:/)).toHaveCount(0);
	await page.keyboard.press('Escape');
	await showAllKeyedTimelineRows(page);
	await expect(page.getByText('0 matching tracks', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Setup', exact: true }).click();
	await page.keyboard.press('Control+Shift+V');
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await showAllKeyedTimelineRows(page);
	await expect(page.getByText('0 matching tracks', { exact: true })).toBeVisible();
	await expect(page.getByText(/^Pasted pose:/)).toHaveCount(0);
});
