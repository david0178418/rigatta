import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';
import { Dialog, Tooltip, Toolbar } from '../../src/app/ui-primitives.tsx';

describe('UI accessibility primitives', () => {
	test('associates tooltip text with its focusable child', () => {
		const markup = renderToStaticMarkup(
			<Tooltip label="Rotate" shortcut="R">
				<button type="button">Rotate</button>
			</Tooltip>
		);

		expect(markup).toContain('aria-describedby');
		expect(markup).toContain('role="tooltip"');
		expect(markup).toContain('Rotate · R');
	});

	test('renders a labelled toolbar with its orientation', () => {
		const markup = renderToStaticMarkup(
			<Toolbar label="Transform tools" orientation="vertical">
				<button type="button">Move</button>
				<button type="button">Rotate</button>
			</Toolbar>
		);

		expect(markup).toContain('role="toolbar"');
		expect(markup).toContain('aria-label="Transform tools"');
		expect(markup).toContain('aria-orientation="vertical"');
	});

	test('labels modal dialogs by their visible heading', () => {
		const markup = renderToStaticMarkup(
			<Dialog label="Project settings" onClose={() => undefined}>
				<p>Settings content</p>
			</Dialog>
		);

		expect(markup).toContain('role="dialog"');
		expect(markup).toContain('aria-modal="true"');
		expect(markup).toContain('aria-labelledby="dialog-title-');
		expect(markup).toContain('>Project settings</h2>');
	});
});
