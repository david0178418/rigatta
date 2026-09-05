import { expect, test, type Page } from '@playwright/test';

const loadExample = async function loadExample(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
};

const showAllKeyedTimelineRows = async function showAllKeyedTimelineRows(page: Page): Promise<void> {
	const trackDetails = page.getByRole('button', { name: 'Track details', exact: true });

	if (await trackDetails.getAttribute('aria-expanded') === 'true') {
		await page.keyboard.press('Escape');
		await expect(trackDetails).toBeFocused();
	}

	await page.getByRole('button', { name: 'Timeline options', exact: true }).click();
	await page.getByRole('dialog', { name: 'Timeline options', exact: true }).getByLabel('Timeline rows', { exact: true }).selectOption('all-keyed');
	await page.keyboard.press('Escape');
};

test('moves clip and event editing into Properties and preserves invalid JSON drafts', async ({ page }) => {
	await loadExample(page);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Clip settings', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Clip properties' })).toBeVisible();
	await expect(page.getByLabel('Clip name')).toHaveValue('walk');
	await expect(page.getByRole('button', { name: 'Duplicate clip', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Delete clip', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Rename', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Apply playback', exact: true })).toHaveCount(0);
	await expect(page.locator('.timeline-detail-surface')).toHaveCount(0);

	await page.getByRole('button', { name: 'Event right-footstep at frame 7', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Event properties' })).toBeVisible();
	const payload = page.getByLabel('Payload JSON');

	await payload.fill('{ invalid');
	await page.getByRole('button', { name: 'Apply event', exact: true }).click();
	await expect(payload).toHaveValue('{ invalid');
	await expect(payload).toHaveAttribute('aria-invalid', 'true');
	await expect(payload).toHaveAttribute('aria-describedby', /event-editor-error/);
	await expect(page.getByRole('alert')).toContainText('valid JSON');
	await expect(page.getByRole('button', { name: 'Event right-footstep at frame 7', exact: true })).toBeVisible();

	await payload.fill('{"intensity":2}');
	await page.getByRole('button', { name: 'Apply event', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('rebinds the inspector context when switching clips', async ({ page }) => {
	await loadExample(page);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Event right-footstep at frame 7', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Event properties' })).toBeVisible();

	await page.getByRole('button', { name: '+ Clip', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Clip properties' })).toBeVisible();
	await expect(page.getByRole('region', { name: 'Event properties' })).toHaveCount(0);
});

test('applies a common key frame to multiple keys and undoes it as one action', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Create animation clip', exact: true }).click();
	await page.getByRole('button', { name: 'Track details', exact: true }).click();
	await page.getByRole('button', { name: 'Add track', exact: true }).click();
	await page.getByRole('button', { name: 'Add key', exact: true }).click();
	await page.getByRole('combobox', { name: 'New track', exact: true }).selectOption({ label: 'root · Bone · y' });
	await page.getByRole('button', { name: 'Add track', exact: true }).click();
	await page.getByRole('button', { name: 'Add key', exact: true }).click();

	const keys = page.getByRole('button', { name: 'Key frame 1', exact: true });
	await expect(keys).toHaveCount(2);
	await page.keyboard.press('Escape');
	await keys.nth(0).click();
	await keys.nth(1).click({ modifiers: ['Control'] });
	await expect(page.getByRole('region', { name: 'Key properties' })).toBeVisible();
	await expect(page.getByTestId('mixed-key-state')).toContainText('2 keys selected');

	await page.getByLabel('Key frame', { exact: true }).fill('3');
	await page.getByRole('button', { name: 'Apply key values', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 3', exact: true })).toHaveCount(2);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 1', exact: true })).toHaveCount(2);
});

test('retimes mixed numeric and discrete keys atomically', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Point attachment', exact: true }).click();
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Create animation clip', exact: true }).click();
	await page.getByRole('button', { name: 'Track details', exact: true }).click();
	await page.getByRole('combobox', { name: 'New track', exact: true }).selectOption({ label: 'root · Bone · x' });
	await page.getByRole('button', { name: 'Add track', exact: true }).click();
	await page.getByRole('button', { name: 'Add key', exact: true }).click();
	await page.getByRole('combobox', { name: 'New track', exact: true }).selectOption({ label: 'point · Point · enabled' });
	await page.getByRole('button', { name: 'Add track', exact: true }).click();
	await page.getByRole('button', { name: 'Add key', exact: true }).click();

	await showAllKeyedTimelineRows(page);
	const keys = page.getByRole('button', { name: 'Key frame 1', exact: true });
	await expect(keys).toHaveCount(2);
	await page.keyboard.press('Escape');
	await keys.nth(0).click();
	await keys.nth(1).click({ modifiers: ['Control'] });
	await expect(page.getByText('2 keys selected', { exact: false })).toBeVisible();
	await page.getByLabel('Key frame', { exact: true }).fill('3');
	await page.getByRole('button', { name: 'Apply key values', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 3', exact: true })).toHaveCount(2);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 1', exact: true })).toHaveCount(2);
});

test('derives multi-selection key diamonds from every compatible entity', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Create animation clip', exact: true }).click();

	const root = page.getByRole('button', { name: 'root', exact: true });
	const child = page.getByRole('button', { name: 'bone', exact: true });
	await root.click();
	await child.click({ modifiers: ['Control'] });
	await expect(page.getByRole('button', { name: 'Add X key at frame 1', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Add X key at frame 1', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 1', exact: true })).toHaveCount(2);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Add X key at frame 1', exact: true })).toBeVisible();

	await root.click();
	await page.getByRole('button', { name: 'Add X key at frame 1', exact: true }).click();
	await child.click({ modifiers: ['Control'] });
	await expect(page.getByText('Mixed key state', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add X key at frame 1', exact: true })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Remove X key at frame 1', exact: true })).toHaveCount(0);
});

test('keeps untouched mixed direct fields blank without creating an edit', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Child bone', exact: true }).click();
	await page.locator('input[name="x"]').fill('10');
	await page.locator('input[name="x"]').press('Enter');

	const root = page.getByRole('button', { name: 'root', exact: true });
	const child = page.getByRole('button', { name: 'bone', exact: true });
	await root.click();
	await child.click({ modifiers: ['Control'] });
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Create animation clip', exact: true }).click();

	const x = page.getByLabel('X', { exact: true });
	await expect(x).toHaveValue('');
	await x.click();
	await page.getByLabel('Y', { exact: true }).click();
	await expect(x).toHaveValue('');

	await root.click();
	await expect(page.getByLabel('X', { exact: true })).toHaveValue('0');
});

test('shows setup and keyed gameplay state in Properties', async ({ page }) => {
	await loadExample(page);
	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	await tree.getByRole('treeitem', { name: 'Point attachment: hand-grip', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Gameplay attachment properties' })).toBeVisible();
	await expect(page.getByText('Setup enabled', { exact: true })).toBeVisible();

	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await expect(page.getByText('Current evaluated · frame 1', { exact: true })).toBeVisible();
	await expect(page.getByLabel('Current enabled', { exact: true })).toBeChecked();
	await page.getByLabel('Current enabled', { exact: true }).uncheck();
	await expect(page.getByLabel('Current enabled', { exact: true })).not.toBeChecked();
	const gameplay = page.getByRole('region', { name: 'Gameplay attachment properties' });
	await expect(gameplay.getByText('Keyed value', { exact: true })).toBeVisible();
	await expect(gameplay.getByText('Disabled · frame 1', { exact: true })).toBeVisible();
});

test('refreshes gameplay name drafts when selection changes', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Point attachment', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Rectangle attachment', exact: true }).click();

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	await tree.getByRole('treeitem', { name: 'Point attachment: point', exact: true }).click();
	await expect(page.getByLabel('Selected name', { exact: true })).toHaveValue('point');
	await tree.getByRole('treeitem', { name: 'Rectangle attachment: rectangle', exact: true }).click();
	const name = page.getByLabel('Selected name', { exact: true });
	await expect(name).toHaveValue('rectangle');
	await name.fill('hitbox');
	await name.press('Enter');
	await expect(tree.getByRole('treeitem', { name: 'Rectangle attachment: hitbox', exact: true })).toBeVisible();
});

test('keys enabled for every selected gameplay attachment in one undo step', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Create root bone', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Point attachment', exact: true }).click();
	await page.getByRole('button', { name: 'root', exact: true }).click();
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Rectangle attachment', exact: true }).click();

	const tree = page.getByRole('tree', { name: 'Rig hierarchy' });
	const point = tree.getByRole('treeitem', { name: 'Point attachment: point', exact: true });
	const rectangle = tree.getByRole('treeitem', { name: 'Rectangle attachment: rectangle', exact: true });
	await point.click();
	await rectangle.click({ modifiers: ['Control'] });
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Create animation clip', exact: true }).click();

	const enabled = page.getByLabel('Current enabled', { exact: true });
	await expect(enabled).toBeChecked();
	await enabled.uncheck();
	await expect(page.getByRole('button', { name: 'Key frame 1', exact: true })).toHaveCount(2);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Key frame 1', exact: true })).toHaveCount(0);
	await expect(enabled).toBeChecked();
});

test('keeps draw-order and attachment-swap contexts in Properties with navigation links', async ({ page }) => {
	await loadExample(page);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await page.getByRole('button', { name: 'Track details', exact: true }).click();
	await page.getByRole('combobox', { name: 'New track', exact: true }).selectOption({ label: 'Setup · Draw order' });
	await page.getByRole('button', { name: 'Add track', exact: true }).click();
	await page.getByRole('button', { name: 'Add key', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Draw order properties' })).toBeVisible();
	await expect(page.getByText('Setup value · back to front', { exact: true })).toBeVisible();
	await expect(page.getByText('Current evaluated order · Keyed override from frame 1', { exact: true })).toBeVisible();
	await expect(page.getByText('Keyed value · frame 1', { exact: true })).toBeVisible();

	await page.getByRole('combobox', { name: 'New track', exact: true }).selectOption({ label: 'body · Attachment' });
	await page.getByRole('button', { name: 'Add track', exact: true }).click();
	await page.getByRole('combobox', { name: 'Key attachment', exact: true }).selectOption({ label: 'body front' });
	await page.getByRole('button', { name: 'Add key', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Attachment swap properties' })).toBeVisible();
	await expect(page.getByText('Setup value', { exact: true })).toBeVisible();
	await expect(page.getByText('Current source', { exact: true })).toBeVisible();
	await expect(page.getByText('Keyed value · frame 1', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Select current body front', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Attachment swap properties' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'body front', exact: true })).toBeVisible();
});

test('shows focus-visible tooltips and restores Track details focus on Escape', async ({ page }) => {
	await loadExample(page);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await showAllKeyedTimelineRows(page);

	const marker = page.getByRole('button', { name: 'Key frame 1', exact: true }).first();
	await marker.focus();
	const markerTooltip = marker.locator('xpath=..').getByRole('tooltip');
	await expect(markerTooltip).toHaveAttribute('aria-hidden', 'false');
	await expect(markerTooltip).toHaveCSS('position', 'fixed');
	const tooltipBounds = await markerTooltip.boundingBox();
	if (!tooltipBounds) {
		throw new Error('Timeline marker tooltip bounds are unavailable.');
	}
	const viewport = page.viewportSize();
	if (!viewport) {
		throw new Error('The browser viewport is unavailable.');
	}
	expect(tooltipBounds.x).toBeGreaterThanOrEqual(0);
	expect(tooltipBounds.y).toBeGreaterThanOrEqual(0);
	expect(tooltipBounds.x + tooltipBounds.width).toBeLessThanOrEqual(viewport.width);
	expect(tooltipBounds.y + tooltipBounds.height).toBeLessThanOrEqual(viewport.height);

	const stepBackward = page.getByRole('button', { name: 'Step backward', exact: true });
	await stepBackward.focus();
	await expect(stepBackward.locator('xpath=..').getByRole('tooltip')).toHaveAttribute('aria-hidden', 'false');

	const trackDetails = page.getByRole('button', { name: 'Track details', exact: true });
	await trackDetails.click();
	const panel = page.getByRole('dialog', { name: 'Track details' });
	await expect(trackDetails).toHaveAttribute('aria-expanded', 'true');
	await expect(panel).toHaveAttribute('role', 'dialog');
	await expect(panel.getByLabel('New track', { exact: true })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(panel).toHaveCount(0);
	await expect(trackDetails).toBeFocused();

	await page.getByRole('tab', { name: 'Draw Order', exact: true }).click();
	const body = page.getByTestId('draw-order-panel').getByRole('button', { name: 'body', exact: true });
	await body.focus();
	await expect(body.locator('xpath=..').getByRole('tooltip')).toHaveAttribute('aria-hidden', 'false');
});

test('selects a timeline key through the expanded pointer hit target', async ({ page }) => {
	await loadExample(page);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await showAllKeyedTimelineRows(page);

	const marker = page.getByRole('button', { name: 'Key frame 1', exact: true }).first();
	await marker.scrollIntoViewIfNeeded();
	const bounds = await marker.boundingBox();
	if (!bounds) {
		throw new Error('Timeline marker bounds are unavailable.');
	}

	const hitPoint = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 3 };
	const hitTargetKeyId = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-key-id]')?.dataset.keyId, hitPoint);

	expect(hitTargetKeyId).toBe(await marker.getAttribute('data-key-id'));
	await page.mouse.click(hitPoint.x, hitPoint.y);
	await expect(page.getByRole('region', { name: 'Key properties' })).toBeVisible();
});

test('makes each timeline lane keyboard-seekable and each property label keyboard-selectable', async ({ page }) => {
	await loadExample(page);
	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await showAllKeyedTimelineRows(page);

	const lane = page.locator('.track-key-lane[data-timeline-lane]').first();
	await lane.focus();
	await expect(lane).toHaveAttribute('role', 'group');
	await expect(lane).toHaveAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight Home End Enter Space');
	await lane.press('End');
	await expect(page.getByLabel('Playhead', { exact: true })).toHaveValue('11');
	await lane.press('Home');
	await expect(page.getByLabel('Playhead', { exact: true })).toHaveValue('0');

	const propertyLabel = page.locator('.timeline-property-row .timeline-row-select').first();
	await expect(propertyLabel).toHaveJSProperty('tagName', 'BUTTON');
	await propertyLabel.focus();
	await propertyLabel.press('Enter');
	await expect(propertyLabel).toHaveAttribute('aria-pressed', 'true');
});
