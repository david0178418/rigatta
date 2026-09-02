import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';
import { createEmptyProject } from '../../src/domain/model.ts';
import { DEFAULT_GRID_SETTINGS } from '../../src/app/grid.ts';
import { CanvasToolbar } from '../../src/app/canvas-toolbar.tsx';
import { PropertiesInspector } from '../../src/app/properties-inspector.tsx';

describe('P1 presentation boundaries', () => {
	test('canvas toolbar preserves transform and grid controls as a value/callback view', () => {
		const markup = renderToStaticMarkup(
			<CanvasToolbar
				gridSettings={DEFAULT_GRID_SETTINGS}
				gridSpacingInput="8"
				onGridSnapChange={() => undefined}
				onGridSpacingChange={() => undefined}
				onGridSpacingCommit={() => undefined}
				onGridVisibleChange={() => undefined}
				onTransformToolChange={() => undefined}
				transformTool="translate"
			/>
		);

		expect(markup).toContain('data-testid="canvas-toolbar"');
		expect(markup).toContain('aria-label="Transform tools"');
		expect(markup).toContain('>Grid settings</button>');
	});

	test('properties inspector keeps the empty selection contract at the presentation boundary', () => {
		const project = createEmptyProject();
		const markup = renderToStaticMarkup(
			<PropertiesInspector
				activeFrameIndex={0}
				allSelectedImages={false}
				allSelectedRectangles={false}
				collapsedSections={new Set()}
				keyStateForProperty={() => undefined}
				onAddChildBone={() => undefined}
				onAddPointAttachment={() => undefined}
				onAddRectangleAttachment={() => undefined}
				onAddSlot={() => undefined}
				onCommitDirectProperty={() => undefined}
				onDeleteSelected={() => undefined}
				onRenameSelected={() => undefined}
				onTogglePropertyKey={() => undefined}
				onUpdateSlotAttachment={() => undefined}
				project={project}
				renameInputRef={null}
				selectedAttachmentIsMixed={() => false}
				selectedAttachmentValue={() => undefined}
				selectedTransformIsMixed={() => false}
				selectedTransformValue={() => undefined}
				selection={[]}
				sharedInspector={{
					collapsedSections: new Set(),
					context: { kind: 'none' },
					onDeleteEvent: () => undefined,
					onDeleteTrack: () => undefined,
					onMoveEvent: () => undefined,
					onRenameClip: () => undefined,
					onToggleSection: () => undefined,
					onUpdateAttachmentKey: () => undefined,
					onUpdateClipPlayback: () => undefined,
					onUpdateDrawOrderKey: () => undefined,
					onUpdateEvent: () => undefined,
					onUpdateInterpolation: () => undefined,
					onUpdateNumberKeys: () => undefined,
					project
				}}
				showSharedInspector={false}
			/>
		);

		expect(markup).toContain('data-testid="properties-inspector"');
		expect(markup).toContain('Nothing selected');
		expect(markup).toContain('Entity properties');
	});
});
