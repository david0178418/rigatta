import { expect, test, type Locator, type Page } from '@playwright/test';

const tooltipFor = function tooltipFor(button: Locator): Locator {
	return button.locator('xpath=..').getByRole('tooltip');
};

const poseNoticeFor = function poseNoticeFor(page: Page): Locator {
	return page.locator('.pose-clipboard-notice[role="status"]');
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
	await page.getByRole('combobox', { name: 'Timeline rows', exact: true }).selectOption({ label: 'All keyed' });
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

	await page.getByRole('button', { name: 'Copy pose', exact: true }).click();
	await expect(poseNoticeFor(page)).toHaveText('Copied pose: 14 bones and 14 attachments.');

	return copiedPoseImage;
};

test('shows the empty Animate state without pose controls when no clip is available', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Animate', exact: true }).click();

	const copyPose = page.getByRole('button', { name: 'Copy pose', exact: true });
	const pastePose = page.getByRole('button', { name: 'Paste pose', exact: true });

	await expect(page.getByText('No clips yet', { exact: true })).toBeVisible();
	await expect(copyPose).toHaveCount(0);
	await expect(pastePose).toHaveCount(0);
});

test('exposes exact pose actions, shortcut metadata, and pre-copy disabled state', async ({ page }) => {
	await loadExampleAnimation(page);

	const copyPose = page.getByRole('button', { name: 'Copy pose', exact: true });
	const pastePose = page.getByRole('button', { name: 'Paste pose', exact: true });

	await expect(copyPose).toBeVisible();
	await expect(copyPose).toBeEnabled();
	await expect(pastePose).toBeVisible();
	await expect(pastePose).toBeDisabled();
	await expect(copyPose).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+C Meta+Shift+C');
	await expect(pastePose).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+V Meta+Shift+V');

	await copyPose.focus();
	await expect(tooltipFor(copyPose)).toBeVisible();
	await expect(tooltipFor(copyPose)).toHaveText('Copy pose · Ctrl/Cmd + Shift + C');
	await copyPose.click();
	await expect(pastePose).toBeEnabled();
	await pastePose.focus();
	await expect(tooltipFor(pastePose)).toBeVisible();
	await expect(tooltipFor(pastePose)).toHaveText('Paste pose · Ctrl/Cmd + Shift + V');
});

test('copies an interpolated pose with all example entities through visible feedback', async ({ page }) => {
	await loadExampleAnimation(page);
	await copyInterpolatedExamplePose(page);

	const notice = poseNoticeFor(page);

	await expect(notice).toHaveAttribute('role', 'status');
	await expect(notice).toHaveAttribute('aria-live', 'polite');
	await expect(notice).toHaveText('Copied pose: 14 bones and 14 attachments.');
	await expect(page.getByRole('button', { name: 'Paste pose', exact: true })).toBeEnabled();
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

	await page.getByRole('button', { name: 'Paste pose', exact: true }).click();
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
	await expect(page.getByRole('button', { name: 'Paste pose', exact: true })).toBeDisabled();

	await page.getByRole('button', { name: 'walk', exact: true }).click();
	const filter = page.getByLabel('Filter tracks', { exact: true });
	await filter.focus();
	await page.keyboard.press('Control+Shift+C');
	await expect(poseNoticeFor(page)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Paste pose', exact: true })).toBeDisabled();

	await page.getByTestId('animate-timeline').focus();
	await page.keyboard.press('Control+Shift+C');
	await expect(poseNoticeFor(page)).toHaveText('Copied pose: 14 bones and 14 attachments.');

	await destinationClip.click();
	await filter.focus();
	await page.keyboard.press('Control+Shift+V');
	await expect(page.getByText(/^Pasted pose:/)).toHaveCount(0);
	await showAllKeyedTimelineRows(page);
	await expect(page.getByText('0 matching tracks', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Setup', exact: true }).click();
	await page.keyboard.press('Control+Shift+V');
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await showAllKeyedTimelineRows(page);
	await expect(page.getByText('0 matching tracks', { exact: true })).toBeVisible();
	await expect(page.getByText(/^Pasted pose:/)).toHaveCount(0);
});
