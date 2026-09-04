import { describe, expect, test } from 'bun:test';
import { addNumberKey, createClip, createTrack, setNumberKeyInterpolation } from '../../src/domain/animation.ts';
import { reduceProject, type ProjectCommand } from '../../src/domain/commands.ts';
import type { Clip, Project, Track } from '../../src/domain/model.ts';
import type { TrackDefinition } from '../../src/domain/animation.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';
import {
	commitNumericDraft,
	draftForProperty,
	numericPropertySpecs,
	parseNumericDraft,
	updatePropertyDraft,
	type NumericProperty
} from '../../src/app/property-drafts.ts';
import {
	autoKeyCommandsForProperty,
	continuousKeyableProperties,
	planPropertyKeyToggle,
	propertyKeyState,
	propertyValueForKeying,
	trackDefinitionForProperty,
	type KeyableProperty
} from '../../src/app/keying.ts';
import type { EntityId } from '../../src/domain/ids.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174030';
const trackId = '123e4567-e89b-42d3-a456-426614174031';
const keyId = '123e4567-e89b-42d3-a456-426614174032';
const secondTrackId = '123e4567-e89b-42d3-a456-426614174033';
const secondKeyId = '123e4567-e89b-42d3-a456-426614174034';
const thirdTrackId = '123e4567-e89b-42d3-a456-426614174035';
const thirdKeyId = '123e4567-e89b-42d3-a456-426614174036';
const seedKeyId = '123e4567-e89b-42d3-a456-426614174037';

const numericProperties = [
	'x',
	'y',
	'rotation',
	'scaleX',
	'scaleY',
	'shearX',
	'shearY',
	'opacity',
	'pivotX',
	'pivotY',
	'width',
	'height'
] as const satisfies readonly NumericProperty[];

type ContinuousCase = Readonly<{
	property: KeyableProperty;
	targetId: EntityId;
	value: number;
	definition: TrackDefinition;
}>;

const continuousCases = [
	{ property: 'x', targetId: fixtureIds.root, value: 100, definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'x' } },
	{ property: 'y', targetId: fixtureIds.root, value: 50, definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'y' } },
	{ property: 'rotation', targetId: fixtureIds.root, value: 0, definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'rotation' } },
	{ property: 'scaleX', targetId: fixtureIds.root, value: 1, definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'scaleX' } },
	{ property: 'scaleY', targetId: fixtureIds.root, value: 1, definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'scaleY' } },
	{ property: 'shearX', targetId: fixtureIds.root, value: 0, definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'shearX' } },
	{ property: 'shearY', targetId: fixtureIds.root, value: 0, definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'shearY' } },
	{ property: 'opacity', targetId: fixtureIds.image, value: 1, definition: { kind: 'attachment-opacity', targetId: fixtureIds.image } },
	{ property: 'width', targetId: fixtureIds.rectangle, value: 20, definition: { kind: 'rectangle-size', targetId: fixtureIds.rectangle, property: 'width' } },
	{ property: 'height', targetId: fixtureIds.rectangle, value: 30, definition: { kind: 'rectangle-size', targetId: fixtureIds.rectangle, property: 'height' } }
] as const satisfies readonly ContinuousCase[];

const idFactoryFor = function idFactoryFor(ids: readonly EntityId[]): () => EntityId {
	const iterator = ids[Symbol.iterator]();

	return function nextId(): EntityId {
		const next = iterator.next();

		if (next.done) {
			throw new Error('The deterministic ID factory was exhausted.');
		}

		return next.value;
	};
};

const projectWithClip = function projectWithClip(): Readonly<{ project: Project; clip: Clip }> {
	const result = createClip(createRigProject(), { name: 'walk', durationSeconds: 2, fps: 10 }, () => clipId);

	if (!result.ok) {
		throw new Error(result.error.message);
	}

	const clip = result.value.clips.find((candidate) => candidate.id === clipId);

	if (!clip) {
		throw new Error('The fixture clip is unavailable.');
	}

	return { project: result.value, clip };
};

const projectWithTrack = function projectWithTrack(
	definition: TrackDefinition,
	requestedTrackId: EntityId = trackId
): Readonly<{ project: Project; clip: Clip }> {
	const { project, clip } = projectWithClip();
	const result = createTrack(project, clip.id, definition, () => requestedTrackId);

	if (!result.ok) {
		throw new Error(result.error.message);
	}

	const nextClip = result.value.clips.find((candidate) => candidate.id === clip.id);

	if (!nextClip) {
		throw new Error('The fixture clip disappeared.');
	}

	return { project: result.value, clip: nextClip };
};

const projectWithKey = function projectWithKey(): Readonly<{ project: Project; clip: Clip }> {
	const keyed = projectWithTrack({ kind: 'bone-transform', targetId: fixtureIds.root, property: 'x' });
	const result = addNumberKey(keyed.project, keyed.clip.id, trackId, {
		timeSeconds: 0.4,
		value: 140
	}, () => keyId);

	if (!result.ok) {
		throw new Error(result.error.message);
	}

	const clip = result.value.clips.find((candidate) => candidate.id === keyed.clip.id);

	if (!clip) {
		throw new Error('The keyed fixture clip disappeared.');
	}

	return { project: result.value, clip };
};

const reduceCommands = function reduceCommands(
	project: Project,
	commands: readonly ProjectCommand[]
): Project {
	return commands.reduce((current, command) => {
		const result = reduceProject(current, command);

		if (!result.ok) {
			throw new Error(result.error.message);
		}

		return result.value;
	}, project);
};

const trackForId = function trackForId(clip: Clip, requestedTrackId: EntityId): Track {
	const track = clip.tracks.find((candidate) => candidate.id === requestedTrackId);

	if (!track) {
		throw new Error('The requested track is unavailable.');
	}

	return track;
};

describe('UX P1 property drafts', () => {
	test('models every property display unit and valid range', () => {
		expect(numericProperties.map((property) => {
			const spec = numericPropertySpecs[property];

			return [property, spec.unit, spec.minimum, spec.maximum] as const;
		})).toEqual([
			['x', 'px', undefined, undefined],
			['y', 'px', undefined, undefined],
			['rotation', 'deg', undefined, undefined],
			['scaleX', 'number', undefined, undefined],
			['scaleY', 'number', undefined, undefined],
			['shearX', 'deg', undefined, undefined],
			['shearY', 'deg', undefined, undefined],
			['opacity', '%', 0, 1],
			['pivotX', '%', 0, 1],
			['pivotY', '%', 0, 1],
			['width', 'px', 1, undefined],
			['height', 'px', 1, undefined]
		]);

		expect(numericProperties.map((property) => draftForProperty(property, property === 'rotation' ? Math.PI / 2 : 1)).map((draft) => draft.property)).toEqual([...numericProperties]);
	});

	test('rejects blank, nonfinite, and out-of-range drafts without accepting a value', () => {
		expect(parseNumericDraft('', numericPropertySpecs.x)).toEqual({ ok: false, error: 'X is required.' });
		expect(parseNumericDraft('  ', numericPropertySpecs.x)).toEqual({ ok: false, error: 'X is required.' });
		expect(parseNumericDraft('NaN', numericPropertySpecs.x)).toEqual({ ok: false, error: 'X must be a finite number.' });
		expect(parseNumericDraft('Infinity', numericPropertySpecs.x)).toEqual({ ok: false, error: 'X must be a finite number.' });
		expect(parseNumericDraft('-Infinity', numericPropertySpecs.x)).toEqual({ ok: false, error: 'X must be a finite number.' });
		expect(parseNumericDraft('1.01', numericPropertySpecs.opacity)).toEqual({ ok: false, error: 'Opacity must be at most 1.' });
		expect(parseNumericDraft('-0.01', numericPropertySpecs.pivotX)).toEqual({ ok: false, error: 'Pivot X must be at least 0.' });
		expect(parseNumericDraft('0', numericPropertySpecs.width)).toEqual({ ok: false, error: 'Width must be at least 1.' });
		expect(parseNumericDraft('0', numericPropertySpecs.height)).toEqual({ ok: false, error: 'Height must be at least 1.' });
		expect(parseNumericDraft('0', numericPropertySpecs.opacity)).toEqual({ ok: true, value: 0, text: '0' });
		expect(parseNumericDraft('1', numericPropertySpecs.pivotY)).toEqual({ ok: true, value: 1, text: '1' });
	});

	test('converts degree drafts at the UI boundary and identifies unchanged commits', () => {
		const rotation = draftForProperty('rotation', Math.PI / 2);
		const converted = commitNumericDraft(updatePropertyDraft(rotation, '180'));
		const unchanged = commitNumericDraft(updatePropertyDraft(draftForProperty('x', 24), '24'));

		expect(rotation.draftText).toBe('90');
		expect(converted).toEqual({ ok: true, value: Math.PI, text: '180' });
		expect(unchanged).toEqual({ ok: true, unchanged: true, value: 24, text: '24' });
	});
});

describe('UX P1 continuous keying contracts', () => {
	test('enumerates and maps every continuous property to its target track definition', () => {
		const { project } = projectWithClip();

		expect(Array.from(continuousKeyableProperties)).toEqual(continuousCases.map(({ property }) => property));
		expect(continuousCases.map(({ property, targetId }) => trackDefinitionForProperty(project, targetId, property))).toEqual(continuousCases.map(({ definition }) => definition));
		expect(continuousCases.map(({ property, targetId }) => propertyValueForKeying(project, targetId, property))).toEqual(continuousCases.map(({ value }) => value));
	});

	test('reports unsupported targets and properties as unkeyed', () => {
		const { project, clip } = projectWithClip();
		const unsupported = [
			{ targetId: fixtureIds.point, property: 'opacity' as const },
			{ targetId: fixtureIds.image, property: 'width' as const },
			{ targetId: fixtureIds.asset, property: 'x' as const }
		] as const;

		unsupported.forEach(({ targetId, property }) => {
			const context = { project, clip, targetId, property, frameIndex: 4, autoKey: false } as const;

			expect(propertyKeyState(context)).toBe('unkeyed');
			expect(planPropertyKeyToggle(context, idFactoryFor([secondTrackId, secondKeyId]))).toMatchObject({
				state: 'unkeyed',
				commands: [],
				reason: 'This property is not animatable for the selected entity.'
			});
		});
	});

	test('reports a missing clip without producing commands', () => {
		const { project } = projectWithClip();
		const context = { project, targetId: fixtureIds.root, property: 'x' as const, frameIndex: 4, autoKey: true };

		expect(propertyKeyState(context)).toBe('unkeyed');
		expect(planPropertyKeyToggle(context, idFactoryFor([trackId, keyId]))).toEqual({
			state: 'unkeyed',
			commands: [],
			reason: 'Create or select an animation clip before keying a property.'
		});
	});

	test('shows pending only when Auto Key is off and ignores stale pending state when enabled', () => {
		const { project, clip } = projectWithClip();
		const pendingEdits = [{ targetId: fixtureIds.root, property: 'x' as const }];
		const context = { project, clip, targetId: fixtureIds.root, property: 'x' as const, frameIndex: 4, pendingEdits };

		expect(propertyKeyState({ ...context, autoKey: false })).toBe('pending');
		expect(propertyKeyState({ ...context, autoKey: true })).toBe('unkeyed');
	});

	test('plans an exact add sequence for an existing compatible track', () => {
		const { project, clip } = projectWithTrack({ kind: 'bone-transform', targetId: fixtureIds.root, property: 'x' });
		const plan = planPropertyKeyToggle({ project, clip, targetId: fixtureIds.root, property: 'x', frameIndex: 4, autoKey: true }, idFactoryFor([seedKeyId, keyId]));

		expect(plan).toEqual({
			state: 'unkeyed',
			commands: [
				{
					kind: 'add-number-key',
					id: seedKeyId,
					clipId: clip.id,
					trackId,
					input: { timeSeconds: 0, value: 100, interpolation: 'linear', curve: null }
				},
				{
					kind: 'add-number-key',
					id: keyId,
					clipId: clip.id,
					trackId,
					input: { timeSeconds: 0.4, value: 100, interpolation: 'linear', curve: null }
				}
			]
		});
	});

	test('plans create-track plus add sequence for a missing compatible track', () => {
		const { project, clip } = projectWithClip();
		const plan = planPropertyKeyToggle({ project, clip, targetId: fixtureIds.root, property: 'y', frameIndex: 6, autoKey: true }, idFactoryFor([secondTrackId, seedKeyId, secondKeyId]));

		expect(plan).toEqual({
			state: 'unkeyed',
			commands: [
				{ kind: 'create-track', id: secondTrackId, clipId: clip.id, definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'y' } },
				{
					kind: 'add-number-key',
					id: seedKeyId,
					clipId: clip.id,
					trackId: secondTrackId,
					input: { timeSeconds: 0, value: 50, interpolation: 'linear', curve: null }
				},
				{
					kind: 'add-number-key',
					id: secondKeyId,
					clipId: clip.id,
					trackId: secondTrackId,
					input: { timeSeconds: 0.6, value: 50, interpolation: 'linear', curve: null }
				}
			]
		});
	});

	test('seeds an existing empty track when its first key is later than frame 1', () => {
		const { project, clip } = projectWithTrack({ kind: 'bone-transform', targetId: fixtureIds.root, property: 'y' });
		const plan = planPropertyKeyToggle({ project, clip, targetId: fixtureIds.root, property: 'y', frameIndex: 6, autoKey: true }, idFactoryFor([seedKeyId, secondKeyId]));

		expect(plan.commands).toEqual([
			{
				kind: 'add-number-key',
				id: seedKeyId,
				clipId: clip.id,
				trackId: trackId,
				input: { timeSeconds: 0, value: 50, interpolation: 'linear', curve: null }
			},
			{
				kind: 'add-number-key',
				id: secondKeyId,
				clipId: clip.id,
				trackId: trackId,
				input: { timeSeconds: 0.6, value: 50, interpolation: 'linear', curve: null }
			}
		]);
	});

	test('keys a pending draft while seeding from its pre-edit value', () => {
		const { project, clip } = projectWithClip();
		const plan = planPropertyKeyToggle({
			project,
			clip,
			targetId: fixtureIds.root,
			property: 'rotation',
			frameIndex: 6,
			autoKey: false,
			pendingEdits: [{ targetId: fixtureIds.root, property: 'rotation' }],
			valueOverride: 0.75,
			initialValueOverride: 0
		}, idFactoryFor([thirdTrackId, seedKeyId, thirdKeyId]));

		expect(plan).toEqual({
			state: 'pending',
			commands: [
				{ kind: 'create-track', id: thirdTrackId, clipId: clip.id, definition: { kind: 'bone-transform', targetId: fixtureIds.root, property: 'rotation' } },
				{
					kind: 'add-number-key',
					id: seedKeyId,
					clipId: clip.id,
					trackId: thirdTrackId,
					input: { timeSeconds: 0, value: 0, interpolation: 'linear', curve: null }
				},
				{
					kind: 'add-number-key',
					id: thirdKeyId,
					clipId: clip.id,
					trackId: thirdTrackId,
					input: { timeSeconds: 0.6, value: 0.75, interpolation: 'linear', curve: null }
				}
			]
		});
	});

	test('plans deletion of the existing current-frame key', () => {
		const { project, clip } = projectWithKey();
		const plan = planPropertyKeyToggle({ project, clip, targetId: fixtureIds.root, property: 'x', frameIndex: 4, autoKey: false });

		expect(plan).toEqual({
			state: 'keyed',
			commands: [{ kind: 'delete-key', clipId: clip.id, trackId, keyId }]
		});
	});

	test('updates an existing current-frame key when committing a pending draft', () => {
		const { project, clip } = projectWithKey();
		const plan = planPropertyKeyToggle({
			project,
			clip,
			targetId: fixtureIds.root,
			property: 'x',
			frameIndex: 4,
			autoKey: false,
			pendingEdits: [{ targetId: fixtureIds.root, property: 'x' }],
			valueOverride: 180,
			initialValueOverride: 100
		});

		expect(plan).toEqual({
			state: 'pending',
			commands: [{
				kind: 'set-number-key',
				id: keyId,
				clipId: clip.id,
				trackId,
				input: { timeSeconds: 0.4, value: 180, interpolation: 'linear', curve: null }
			}]
		});
	});

	test('preserves existing interpolation when updating a current-frame key', () => {
		const keyed = projectWithKey();
		const steppedProject = setNumberKeyInterpolation(keyed.project, keyed.clip.id, trackId, keyId, { interpolation: 'stepped' });

		if (!steppedProject.ok) {
			throw new Error(steppedProject.error.message);
		}

		const steppedClip = steppedProject.value.clips.find((candidate) => candidate.id === keyed.clip.id);

		if (!steppedClip) {
			throw new Error('The stepped fixture clip disappeared.');
		}

		expect(autoKeyCommandsForProperty(steppedProject.value, steppedClip, fixtureIds.root, 'x', 4, idFactoryFor([]), 160)).toEqual([{
			kind: 'set-number-key',
			id: keyId,
			clipId: steppedClip.id,
			trackId,
			input: { timeSeconds: 0.4, value: 160, interpolation: 'stepped', curve: null }
		}]);
	});

	continuousCases.forEach(({ property, targetId, value, definition }) => {
		test(`auto-keys ${property} with one compatible track and no duplicates`, () => {
			const { project, clip } = projectWithClip();
			const commands = autoKeyCommandsForProperty(project, clip, targetId, property, 5, idFactoryFor([thirdTrackId, seedKeyId, thirdKeyId]), value);

			expect(commands).toEqual([
				{ kind: 'create-track', id: thirdTrackId, clipId: clip.id, definition },
				{
					kind: 'add-number-key',
					id: seedKeyId,
					clipId: clip.id,
					trackId: thirdTrackId,
					input: { timeSeconds: 0, value, interpolation: 'linear', curve: null }
				},
				{
					kind: 'add-number-key',
					id: thirdKeyId,
					clipId: clip.id,
					trackId: thirdTrackId,
					input: { timeSeconds: 0.5, value, interpolation: 'linear', curve: null }
				}
			]);

			const keyedProject = reduceCommands(project, commands);
			const keyedClip = keyedProject.clips.find((candidate) => candidate.id === clip.id);

			if (!keyedClip) {
				throw new Error('The auto-keyed clip is unavailable.');
			}

			const keyedTrack = trackForId(keyedClip, thirdTrackId);
			expect(keyedClip.tracks.filter((candidate) => candidate.kind === definition.kind && ('targetId' in candidate ? candidate.targetId === targetId : true) && ('property' in candidate ? candidate.property === property : true))).toHaveLength(1);
			expect(keyedTrack.keys).toHaveLength(2);
			expect(keyedTrack.keys[0]).toMatchObject({ id: seedKeyId, timeSeconds: 0, value });
			expect(keyedTrack.keys[1]).toMatchObject({ id: thirdKeyId, timeSeconds: 0.5, value });

			const updatedValue = property === 'opacity' ? 0.5 : value + 1;
			const secondCommands = autoKeyCommandsForProperty(keyedProject, keyedClip, targetId, property, 5, idFactoryFor([keyId]), updatedValue);

			expect(secondCommands).toEqual([{
				kind: 'set-number-key',
				id: thirdKeyId,
				clipId: clip.id,
				trackId: thirdTrackId,
				input: { timeSeconds: 0.5, value: updatedValue, interpolation: 'linear', curve: null }
			}]);

			const updatedProject = reduceCommands(keyedProject, secondCommands);
			const updatedClip = updatedProject.clips.find((candidate) => candidate.id === clip.id);

			if (!updatedClip) {
				throw new Error('The updated auto-keyed clip is unavailable.');
			}

			expect(updatedClip.tracks.filter((candidate) => candidate.kind === definition.kind && ('targetId' in candidate ? candidate.targetId === targetId : true) && ('property' in candidate ? candidate.property === property : true))).toHaveLength(1);
			expect(trackForId(updatedClip, thirdTrackId).keys).toHaveLength(2);
		});
	});
});
