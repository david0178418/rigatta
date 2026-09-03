import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';
import { addDrawOrderKey, addEvent, addNumberKey, createClip, createTrack } from '../../src/domain/animation.ts';
import type { EntityId } from '../../src/domain/ids.ts';
import type { Project } from '../../src/domain/model.ts';
import { drawOrderInspectorContext, eventInspectorContext, keyInspectorContext } from '../../src/app/inspector-context.ts';
import {
	parseInspectorEventPayload,
	SharedInspector,
	type SharedInspectorProps
} from '../../src/app/shared-inspector.tsx';
import { createRigProject } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174030' as EntityId;
const eventId = '123e4567-e89b-42d3-a456-426614174031' as EntityId;
const trackId = '123e4567-e89b-42d3-a456-426614174032' as EntityId;
const firstKeyId = '123e4567-e89b-42d3-a456-426614174033' as EntityId;
const secondKeyId = '123e4567-e89b-42d3-a456-426614174034' as EntityId;

const unwrap = function unwrap<TValue>(result: Readonly<{ ok: true; value: TValue }> | Readonly<{ ok: false; error: { message: string } }>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const projectWithEvent = function projectWithEvent(): Project {
	const withClip = unwrap(createClip(createRigProject(), { name: 'walk', durationSeconds: 1, fps: 12, loop: true }, () => clipId));

	return unwrap(addEvent(withClip, clipId, {
		name: 'impact',
		timeSeconds: 0.5,
		payload: { intensity: 2 }
	}, () => eventId));
};

const projectWithMixedBezierKeys = function projectWithMixedBezierKeys(): Project {
	const withClip = unwrap(createClip(createRigProject(), { name: 'walk', durationSeconds: 1, fps: 12, loop: true }, () => clipId));
	const withTrack = unwrap(createTrack(withClip, clipId, { kind: 'bone-transform', targetId: '123e4567-e89b-42d3-a456-426614174002' as EntityId, property: 'x' }, () => trackId));
	const withFirstKey = unwrap(addNumberKey(withTrack, clipId, trackId, {
		timeSeconds: 0,
		value: 0,
		interpolation: 'bezier',
		curve: { x1: 0.1, y1: 0.2, x2: 0.7, y2: 0.8 }
	}, () => firstKeyId));

	return unwrap(addNumberKey(withFirstKey, clipId, trackId, {
		timeSeconds: 0.5,
		value: 10,
		interpolation: 'bezier',
		curve: { x1: 0.3, y1: 0.4, x2: 0.9, y2: 0.6 }
	}, () => secondKeyId));
};

const projectWithDrawOrder = function projectWithDrawOrder(): Project {
	const withClip = unwrap(createClip(createRigProject(), { name: 'walk', durationSeconds: 1, fps: 12, loop: true }, () => clipId));
	const withTrack = unwrap(createTrack(withClip, clipId, { kind: 'slot-draw-order' }, () => trackId));

	return unwrap(addDrawOrderKey(withTrack, clipId, trackId, {
		timeSeconds: 0,
		value: withTrack.slots.map((slot) => slot.id)
	}, () => firstKeyId));
};

const sharedProps = function sharedProps(project: Project, context: SharedInspectorProps['context']): SharedInspectorProps {
	return {
		project,
		context,
		collapsedSections: new Set<string>(),
		onToggleSection: () => undefined,
		onRenameClip: () => undefined,
		onUpdateClipPlayback: () => undefined,
		onDeleteTrack: () => undefined,
		onUpdateNumberKeys: () => undefined,
		onUpdateInterpolation: () => undefined,
		onUpdateEvent: () => undefined,
		onMoveEvent: () => undefined,
		onDeleteEvent: () => undefined,
		onUpdateAttachmentKey: () => undefined,
		onUpdateDrawOrderKey: () => undefined
	};
};

describe('shared inspector', () => {
	test('accepts only bounded JSON objects for event payload editing', () => {
		expect(parseInspectorEventPayload('{"intensity":2}')).toEqual({ ok: true, value: { intensity: 2 } });
		expect(parseInspectorEventPayload('{')).toMatchObject({ ok: false });
		expect(parseInspectorEventPayload('[1,2]')).toMatchObject({ ok: false });
	});

	test('renders event editing in Properties context instead of a timeline detail surface', () => {
		const project = projectWithEvent();
		const markup = renderToStaticMarkup(
			<SharedInspector {...sharedProps(project, eventInspectorContext(clipId, eventId))} />
		);

		expect(markup).toContain('aria-label="Event properties"');
		expect(markup).toContain('aria-label="Event name"');
		expect(markup).toContain('aria-label="Event frame"');
		expect(markup).toContain('aria-label="Payload JSON"');
		expect(markup).toContain('Apply event');
		expect(markup).not.toContain('timeline-detail-surface');
	});

	test('renders mixed Bezier controls with an explicit mixed-curve state', () => {
		const project = projectWithMixedBezierKeys();
		const markup = renderToStaticMarkup(
			<SharedInspector {...sharedProps(project, keyInspectorContext(clipId, [{ trackId, keyId: firstKeyId }, { trackId, keyId: secondKeyId }]))} />
		);

		expect(markup).toContain('Bezier curve editor');
		expect(markup).toContain('Mixed curves');
		expect(markup).toContain('aria-label="Bezier x1"');
	});

	test('renders setup, current, and keyed draw-order values as separate lists', () => {
		const project = projectWithDrawOrder();
		const clip = project.clips[0];

		if (!clip) {
			throw new Error('Fixture clip is unavailable.');
		}

		const markup = renderToStaticMarkup(
			<SharedInspector {...sharedProps(project, drawOrderInspectorContext(clip.id, trackId, firstKeyId))} activeClip={clip} activeFrameIndex={0} mode="animate" />
		);

		expect(markup).toContain('Setup value');
		expect(markup).toContain('Current evaluated order');
		expect(markup).toContain('Keyed value');
	});
});
