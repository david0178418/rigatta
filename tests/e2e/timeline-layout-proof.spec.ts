import { expect, test, type Page } from '@playwright/test';
import { ANIMATE_TIMELINE_DEFAULT_HEIGHT } from '../../src/app/timeline-layout.ts';

const supportedViewports = [
	{ width: 1120, height: 720 },
	{ width: 1440, height: 900 }
] as const;

const proofStates = [
	{ id: 'no-selection', rowMode: 'auto', selectBone: false },
	{ id: 'selected-bone', rowMode: 'auto', selectBone: true },
	{ id: 'all-keyed', rowMode: 'all-keyed', selectBone: false }
] as const;

type TimelineProofState = (typeof proofStates)[number];
type SupportedViewport = (typeof supportedViewports)[number];

const resetEditor = async function resetEditor(page: Page): Promise<void> {
	await page.goto('/');
	await page.evaluate(() => {
		localStorage.clear();
		sessionStorage.clear();
	});
	await page.reload();
};

const openTimelineOptions = async function openTimelineOptions(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Timeline options', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Timeline options', exact: true })).toBeVisible();
};

const loadAnimateState = async function loadAnimateState(page: Page, state: TimelineProofState): Promise<void> {
	await page.getByRole('button', { name: 'Project', exact: true }).click();
	await page.getByRole('menuitem', { name: 'Load example', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Cutout Robot Example', exact: true })).toBeVisible();

	if (state.selectBone) {
		await page.getByRole('button', { name: 'arm', exact: true }).click();
	}

	await page.getByRole('button', { name: 'Animate', exact: true }).click();
	await expect(page.getByTestId('animate-timeline')).toBeVisible();
	await openTimelineOptions(page);
	await page.getByRole('dialog', { name: 'Timeline options', exact: true }).getByLabel('Timeline rows', { exact: true }).selectOption(state.rowMode);
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('animate-timeline').locator('.timeline-property-row').first()).toBeVisible();
	const expandedRows = page.getByTestId('animate-timeline').locator('.timeline-group-row:not(.timeline-overview-row) .timeline-row-expander');
	await expect(expandedRows).not.toHaveCount(0);
	await expect(expandedRows.first()).toHaveAttribute('aria-expanded', 'true');
};

const assertDefaultTimelineHeight = async function assertDefaultTimelineHeight(page: Page): Promise<void> {
	const splitter = page.getByRole('separator', { name: 'Resize animation timeline' });

	await expect(splitter).toHaveAttribute('aria-valuenow', String(ANIMATE_TIMELINE_DEFAULT_HEIGHT));
};

const readTimelineLayout = async function readTimelineLayout(page: Page): Promise<Readonly<{
	documentHeight: number;
	documentWidth: number;
	bodyHeight: number;
	bodyWidth: number;
	panel: Readonly<{ top: number; right: number; bottom: number; left: number; width: number; height: number }>;
	timeline: Readonly<{ top: number; right: number; bottom: number; left: number; width: number; height: number }>;
	content: Readonly<{ top: number; right: number; bottom: number; left: number; width: number; height: number }>;
	contentPaddingTop: number;
	ruler: Readonly<{ top: number; right: number; bottom: number; left: number; width: number; height: number }>;
	rulerLabel: Readonly<{ left: number; width: number }>;
	visibleDataRows: number;
	visibleDataRowsAfter: number;
	keyedDataRows: number;
	dataRows: number;
	scrollHeight: number;
	clientHeight: number;
	overflowY: string;
	rulerPosition: string;
	rulerLabelPosition: string;
	scrollTopAfter: number;
	rulerTopAfter: number;
	contentTopAfter: number;
	documentScrollTopAfter: number;
}>> {
	return page.getByRole('contentinfo', { name: 'Animation timeline', exact: true }).evaluate((panel) => {
		const timeline = panel.querySelector<HTMLElement>('[data-testid="animate-timeline"]');
		const content = timeline?.querySelector<HTMLElement>('[data-testid="timeline-scroll-region"]');
		const ruler = content?.querySelector<HTMLElement>('.dopesheet-ruler');
		const rulerLabel = content?.querySelector<HTMLElement>('.dopesheet-ruler .timeline-sticky-label');

		if (!timeline || !content || !ruler || !rulerLabel) {
			throw new Error('The timeline layout elements are unavailable.');
		}

		const boundsFor = function boundsFor(element: Element): Readonly<{ top: number; right: number; bottom: number; left: number; width: number; height: number }> {
			const bounds = element.getBoundingClientRect();

			return {
				top: bounds.top,
				right: bounds.right,
				bottom: bounds.bottom,
				left: bounds.left,
				width: bounds.width,
				height: bounds.height
			};
		};

		const contentBounds = boundsFor(content);
		const rulerBounds = boundsFor(ruler);
		const dataRows = Array.from(content.querySelectorAll<HTMLElement>('.timeline-group-row:not(.timeline-overview-row), .timeline-property-row, .timeline-special-row, .timeline-event-row'));
		const keyedDataRows = dataRows.filter((row) => row.querySelector('[data-key-id], [data-event-id]') !== null).length;
		const visibleRowsBetween = function visibleRowsBetween(
			rows: readonly HTMLElement[],
			top: number,
			bottom: number
		): number {
			return rows.filter((row) => {
				const bounds = row.getBoundingClientRect();

				return bounds.height > 0
					&& bounds.top >= top - 1
					&& bounds.bottom <= bottom + 1;
			}).length;
		};
		const visibleDataRows = visibleRowsBetween(dataRows, rulerBounds.bottom, contentBounds.bottom);

		content.scrollTop = Math.max(0, content.scrollHeight - content.clientHeight);
		const rulerBoundsAfter = ruler.getBoundingClientRect();
		const contentBoundsAfter = boundsFor(content);
		const visibleDataRowsAfter = visibleRowsBetween(dataRows, rulerBoundsAfter.bottom, contentBoundsAfter.bottom);

		return {
			documentHeight: document.documentElement.scrollHeight,
			documentWidth: document.documentElement.scrollWidth,
			bodyHeight: document.body.scrollHeight,
			bodyWidth: document.body.scrollWidth,
			panel: boundsFor(panel),
			timeline: boundsFor(timeline),
			content: contentBounds,
			contentPaddingTop: Number.parseFloat(getComputedStyle(content).paddingTop),
			ruler: rulerBounds,
			rulerLabel: { left: rulerLabel.getBoundingClientRect().left, width: rulerLabel.getBoundingClientRect().width },
			visibleDataRows,
			visibleDataRowsAfter,
			keyedDataRows,
			dataRows: dataRows.length,
			scrollHeight: content.scrollHeight,
			clientHeight: content.clientHeight,
			overflowY: getComputedStyle(content).overflowY,
			rulerPosition: getComputedStyle(ruler).position,
			rulerLabelPosition: getComputedStyle(rulerLabel).position,
			scrollTopAfter: content.scrollTop,
			rulerTopAfter: rulerBoundsAfter.top,
			contentTopAfter: content.getBoundingClientRect().top,
			documentScrollTopAfter: document.documentElement.scrollTop
		};
	});
};

const assertContained = function assertContained(
	metrics: Awaited<ReturnType<typeof readTimelineLayout>>,
	viewport: SupportedViewport
): void {
	expect(metrics.documentWidth, `document width overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.width);
	expect(metrics.bodyWidth, `body width overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.width);
	expect(metrics.documentHeight, `document height overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.height);
	expect(metrics.bodyHeight, `body height overflow at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(viewport.height);
	expect(metrics.panel.left).toBeGreaterThanOrEqual(0);
	expect(metrics.panel.right).toBeLessThanOrEqual(viewport.width);
	expect(metrics.panel.bottom).toBeLessThanOrEqual(viewport.height);
	expect(metrics.timeline.left).toBeGreaterThanOrEqual(metrics.panel.left);
	expect(metrics.timeline.right).toBeLessThanOrEqual(metrics.panel.right);
	expect(metrics.timeline.bottom).toBeLessThanOrEqual(metrics.panel.bottom);
	expect(metrics.content.left).toBeGreaterThanOrEqual(metrics.timeline.left);
	expect(metrics.content.right).toBeLessThanOrEqual(metrics.timeline.right);
	expect(metrics.content.bottom).toBeLessThanOrEqual(metrics.timeline.bottom);
};

const assertStickyAndScrollable = function assertStickyAndScrollable(
	metrics: Awaited<ReturnType<typeof readTimelineLayout>>,
	viewport: SupportedViewport
): void {
	expect(metrics.overflowY, `timeline overflow mode at ${viewport.width}x${viewport.height}`).toBe('auto');
	expect(metrics.rulerPosition).toBe('sticky');
	expect(metrics.rulerLabelPosition).toBe('sticky');
	expect(metrics.ruler.left).toBeGreaterThanOrEqual(metrics.content.left);
	expect(metrics.ruler.right).toBeLessThanOrEqual(metrics.content.right);
	expect(metrics.ruler.bottom).toBeLessThanOrEqual(metrics.content.bottom + 1);
	expect(Math.abs(metrics.rulerLabel.left - metrics.ruler.left)).toBeLessThan(2);
	expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
	expect(metrics.scrollTopAfter).toBeGreaterThan(0);
	expect(Math.abs(metrics.rulerTopAfter - metrics.contentTopAfter - metrics.contentPaddingTop)).toBeLessThan(2);
	expect(metrics.documentScrollTopAfter).toBe(0);
};

test('gates contained timeline rows across supported desktop sizes at the default height', async ({ page }) => {
	test.setTimeout(60_000);

	await supportedViewports.reduce(async (previousViewport, viewport) => {
		await previousViewport;

		await proofStates.reduce(async (previousState, state) => {
			await previousState;
			await page.setViewportSize(viewport);
			await resetEditor(page);
			await loadAnimateState(page, state);
			await assertDefaultTimelineHeight(page);

			const metrics = await readTimelineLayout(page);
			assertContained(metrics, viewport);
			assertStickyAndScrollable(metrics, viewport);
			expect(metrics.visibleDataRows, `visible timeline rows without scrolling at ${viewport.width}x${viewport.height} ${state.id}`).toBeGreaterThanOrEqual(3);
			expect(metrics.visibleDataRowsAfter, `visible timeline rows after scrolling at ${viewport.width}x${viewport.height} ${state.id}`).toBeGreaterThanOrEqual(3);
			expect(metrics.keyedDataRows, `keyed timeline rows at ${viewport.width}x${viewport.height} ${state.id}`).toBeGreaterThan(0);
			expect(metrics.dataRows).toBeGreaterThanOrEqual(metrics.visibleDataRowsAfter);
			await page.screenshot({ path: `/tmp/rigatta-timeline-${state.id}-${viewport.width}x${viewport.height}.png`, fullPage: false });
		}, Promise.resolve());
	}, Promise.resolve());
});
