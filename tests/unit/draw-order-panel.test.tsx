import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';
import type { Clip, Project } from '../../src/domain/model.ts';
import { DrawOrderPanel } from '../../src/app/draw-order-panel.tsx';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const secondSlotId = '123e4567-e89b-42d3-a456-42661417400c';
const clipId = '123e4567-e89b-42d3-a456-42661417400d';
const trackId = '123e4567-e89b-42d3-a456-42661417400e';
const keyId = '123e4567-e89b-42d3-a456-42661417400f';

const projectWithTwoSlots = function projectWithTwoSlots(): Project {
	const project = createRigProject();

	return {
		...project,
		slots: [...project.slots, { id: secondSlotId, name: 'second', boneId: fixtureIds.root, setupAttachmentId: null }],
		setupDrawOrder: [fixtureIds.slot, secondSlotId]
	};
};

const keyedClip = function keyedClip(): Clip {
	return {
		id: clipId,
		name: 'motion',
		durationSeconds: 2,
		fps: 24,
		loop: false,
		tracks: [{
			id: trackId,
			kind: 'slot-draw-order',
			keys: [{ id: keyId, timeSeconds: 1 / 24, value: [secondSlotId, fixtureIds.slot] }]
		}],
		events: []
	};
};

describe('DrawOrderPanel', () => {
	test('labels setup slots back to front and renders every slot', () => {
		const markup = renderToStaticMarkup(
			<DrawOrderPanel
				mode="setup"
				frameIndex={0}
				project={projectWithTwoSlots()}
				selection={[]}
				onKeyCurrentFrame={() => undefined}
				onReorder={() => undefined}
				onSelectionChange={() => undefined}
			/>
		);

		expect(markup).toContain('Setup · Setup order · back to front');
		expect(markup).toContain('aria-label="Draw order direction"');
		expect(markup).toContain('>Back</span>');
		expect(markup).toContain('>Front</span>');
		expect(markup).toContain('data-draw-order-source="setup"');
		expect(markup).toContain('data-slot-id="123e4567-e89b-42d3-a456-426614174006"');
		expect(markup).toContain(`data-slot-id="${secondSlotId}"`);
	});

	test('labels a preceding keyed override and offers explicit current-frame keying', () => {
		const project = projectWithTwoSlots();
		const clip = keyedClip();
		const markup = renderToStaticMarkup(
			<DrawOrderPanel
				activeClip={clip}
				mode="animate"
				frameIndex={2}
				project={{ ...project, clips: [clip] }}
				selection={[]}
				onKeyCurrentFrame={() => undefined}
				onReorder={() => undefined}
				onSelectionChange={() => undefined}
			/>
		);

		expect(markup).toContain('Animate · Keyed order at frame 3 · current override from frame 2 · back to front');
		expect(markup).toContain('data-draw-order-source="keyed"');
		expect(markup).toContain('data-draw-order-key-frame="1"');
		expect(markup).toContain('Key current order');
		expect(markup.indexOf(`data-slot-id="${secondSlotId}"`)).toBeLessThan(markup.indexOf('data-slot-id="123e4567-e89b-42d3-a456-426614174006"'));
	});
});
