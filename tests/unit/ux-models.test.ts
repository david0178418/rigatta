import { describe, expect, test } from 'bun:test';
import { createClip, createTrack, addNumberKey } from '../../src/domain/animation.ts';
import { fixtureIds, createRigProject } from '../fixtures.ts';
import {
	buildRigTreeViewModel,
	revealAncestors,
	treeNodeAfter,
	treeNodeForTypeahead,
	treeSelectionForClick
} from '../../src/app/rig-tree.ts';
import {
	commitNumericDraft,
	draftForProperty,
	parseNumericDraft,
	updatePropertyDraft,
	numericPropertySpecs
} from '../../src/app/property-drafts.ts';
import {
	autoKeyCommandsForProperty,
	planPropertyKeyToggle,
	propertyKeyState
} from '../../src/app/keying.ts';
import {
	buildGroupedTimelineRows,
	planKeyDrag,
	createTimelineClipboard,
	planPasteTimelineClipboard
} from '../../src/app/timeline-model.ts';
import {
	clampWorkspaceLayout,
	workspaceLayoutFromKeyboard,
	workspaceLayoutFromLeftPointer,
	DEFAULT_WORKSPACE_LAYOUT
} from '../../src/app/workspace-layout.ts';
import {
	defaultUiPreferences,
	loadUiPreferences,
	parseUiPreferences,
	projectUiPreferencesFor,
	saveUiPreferences,
	updateProjectUiPreferences,
	type PreferencesStorage
} from '../../src/app/ui-preferences.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174010';
const trackId = '123e4567-e89b-42d3-a456-426614174011';
const firstKeyId = '123e4567-e89b-42d3-a456-426614174012';
const secondKeyId = '123e4567-e89b-42d3-a456-426614174013';
const pastedKeyId = '123e4567-e89b-42d3-a456-426614174014';

const animatedProject = function animatedProject() {
	const withClip = createClip(createRigProject(), {
		name: 'walk',
		durationSeconds: 2,
		fps: 10
	}, () => clipId);

	if (!withClip.ok) {
		throw new Error(withClip.error.message);
	}

	const clip = withClip.value.clips[0];

	if (!clip) {
		throw new Error('The fixture clip is unavailable.');
	}

	const withTrack = createTrack(withClip.value, clip.id, {
		kind: 'bone-transform',
		targetId: fixtureIds.root,
		property: 'x'
	}, () => trackId);

	if (!withTrack.ok) {
		throw new Error(withTrack.error.message);
	}

	const withFirstKey = addNumberKey(withTrack.value, clip.id, trackId, {
		timeSeconds: 0.2,
		value: 10
	}, () => firstKeyId);

	if (!withFirstKey.ok) {
		throw new Error(withFirstKey.error.message);
	}

	const withSecondKey = addNumberKey(withFirstKey.value, clip.id, trackId, {
		timeSeconds: 0.8,
		value: 20
	}, () => secondKeyId);

	if (!withSecondKey.ok) {
		throw new Error(withSecondKey.error.message);
	}

	const currentClip = withSecondKey.value.clips[0];

	if (!currentClip) {
		throw new Error('The fixture clip disappeared.');
	}

	return { project: withSecondKey.value, clip: currentClip };
};

describe('UX rig tree model', () => {
	test('builds hierarchical visible nodes and supports range/typeahead selection', () => {
		const project = createRigProject();
		const model = buildRigTreeViewModel(project, [], new Set(modelNodeIds(project)));
		const child = model.visibleNodes.find((node) => node.id === fixtureIds.child);
		const parent = model.visibleNodes.find((node) => node.id === fixtureIds.parentA);

		if (!child || !parent) {
			throw new Error('The fixture hierarchy is incomplete.');
		}

		expect(child.parentId).toBe(fixtureIds.parentA);
		expect(child.depth).toBe(2);
		expect(treeNodeAfter(model.visibleNodes, fixtureIds.parentA, 1)?.id).toBe(fixtureIds.child);
		expect(treeNodeForTypeahead(model.visibleNodes, 'hit', fixtureIds.root)?.id).toBe(fixtureIds.rectangle);

		const first = treeSelectionForClick([], model.visibleNodes, parent);
		const rangeTarget = model.visibleNodes.find((node) => node.id === fixtureIds.child);

		if (!rangeTarget) {
			throw new Error('The range target is unavailable.');
		}

		expect(treeSelectionForClick(first, model.visibleNodes, rangeTarget, { shift: true })).toEqual([
			{ kind: 'bone', id: fixtureIds.parentA },
			{ kind: 'bone', id: fixtureIds.child }
		]);
	});

	test('reveals the ancestors needed to show a selected descendant', () => {
		const project = createRigProject();
		const model = buildRigTreeViewModel(project, [], new Set());
		const expanded = revealAncestors(model, fixtureIds.image, new Set());

		expect(expanded.has(fixtureIds.root)).toBe(true);
		expect(expanded.has(fixtureIds.child)).toBe(true);
		expect(expanded.has(fixtureIds.slot)).toBe(true);
	});
});

const modelNodeIds = function modelNodeIds(project: ReturnType<typeof createRigProject>): readonly string[] {
	return [
		...project.bones.map((bone) => bone.id),
		...project.slots.map((slot) => slot.id),
		...project.attachments.map((attachment) => attachment.id)
	];
};

describe('UX property drafts and keying', () => {
	test('parses displayed degrees and keeps invalid text in an error state', () => {
		const rotation = draftForProperty('rotation', Math.PI / 2);
		const parsed = commitNumericDraft(updatePropertyDraft(rotation, '90'), numericPropertySpecs.rotation);
		const invalid = parseNumericDraft('', numericPropertySpecs.x);

		expect(parsed).toMatchObject({ ok: true, value: Math.PI / 2 });
		expect(invalid).toEqual({ ok: false, error: 'X is required.' });
	});

	test('plans an auto-key command sequence and toggles the current key', () => {
		const { project, clip } = animatedProject();
		const autoKey = autoKeyCommandsForProperty(project, clip, fixtureIds.root, 'x', 12, () => pastedKeyId);
		const keyed = propertyKeyState({ project, clip, targetId: fixtureIds.root, property: 'x', frameIndex: 2, autoKey: true });
		const toggle = planPropertyKeyToggle({ project, clip, targetId: fixtureIds.root, property: 'x', frameIndex: 2, autoKey: true });

		expect(autoKey).toHaveLength(1);
		expect(keyed).toBe('keyed');
		expect(toggle.commands).toEqual([{
		kind: 'delete-key',
		clipId: clip.id,
		trackId,
		keyId: firstKeyId
		}]);
	});
});

describe('UX timeline model', () => {
	test('groups tracks by entity and plans bounded multi-key drag', () => {
		const { project, clip } = animatedProject();
		const rows = buildGroupedTimelineRows(project, clip, { mode: 'all-keyed', expandedIds: new Set(['entity:' + fixtureIds.root]) });
		const drag = planKeyDrag(clip, [
			{ trackId, keyId: firstKeyId },
			{ trackId, keyId: secondKeyId }
		], 1000, 10);

		expect(rows.map((row) => row.kind)).toEqual(['overview', 'entity', 'property', 'events']);
		expect(drag).toMatchObject({ ok: true, value: { deltaFrames: 11 } });
	});

	test('copies and pastes typed numeric keys without crossing clip bounds', () => {
		const { project, clip } = animatedProject();
		const copied = createTimelineClipboard(clip, [{ trackId, keyId: firstKeyId }]);

		if (!copied.ok) {
			throw new Error(copied.error);
		}

		const pasted = planPasteTimelineClipboard(clip, copied.value, 12, () => pastedKeyId, project);

		expect(pasted).toMatchObject({ ok: true, value: [{ kind: 'add-number-key', id: pastedKeyId }] });
	});
});

describe('UX workspace and preference models', () => {
	test('clamps docks and timeline while honoring keyboard endpoints', () => {
		const viewport = { width: 1280, height: 900 } as const;
		const clamped = clampWorkspaceLayout({
			...DEFAULT_WORKSPACE_LAYOUT,
			leftDockWidth: 900,
			rightDockWidth: 1,
			timelineHeight: 900
		}, viewport);

		expect(clamped.leftDockWidth).toBe(420);
		expect(clamped.rightDockWidth).toBe(196);
		expect(workspaceLayoutFromLeftPointer(DEFAULT_WORKSPACE_LAYOUT, 100, 1000, viewport).leftDockWidth).toBe(420);
		expect(workspaceLayoutFromKeyboard(clamped, 'right', 'End', viewport)?.rightDockWidth).toBe(420);
	});

	test('round-trips only validated versioned preferences and drops stale entity IDs', () => {
		const stored = new Map<string, string>();
		const storage: PreferencesStorage = {
			getItem: (key) => stored.get(key) ?? null,
			setItem: (key, value) => {
				stored.set(key, value);
			}
		};
		const project = createRigProject();
		const preferences = updateProjectUiPreferences(defaultUiPreferences(), project.id, (current) => ({
			...current,
			hiddenEntityIds: [fixtureIds.root, '123e4567-e89b-42d3-a456-426614174099']
		}));

		expect(saveUiPreferences(preferences, storage)).toBe(true);
		expect(projectUiPreferencesFor(loadUiPreferences(storage), project).hiddenEntityIds).toEqual([fixtureIds.root]);
		expect(parseUiPreferences({ version: 999 })).toEqual(defaultUiPreferences());
});
});
