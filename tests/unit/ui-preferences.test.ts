import { describe, expect, test } from 'bun:test';
import { strFromU8, unzipSync } from 'fflate';
import { exportProjectArchive } from '../../src/persistence/archive.ts';
import { createHistory, currentProject } from '../../src/domain/history.ts';
import {
	defaultProjectUiPreferences,
	defaultUiPreferences,
	loadUiPreferences,
	migrateUiPreferences,
	parseUiPreferences,
	projectUiPreferencesFor,
	saveUiPreferences,
	UI_PREFERENCES_STORAGE_KEY,
	UI_PREFERENCES_VERSION,
	updateProjectUiPreferences,
	type PreferencesStorage
} from '../../src/app/ui-preferences.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const sourceBytes = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x40
]);

const mapStorage = function mapStorage(initial: string | null = null): PreferencesStorage {
	const values = new Map<string, string>();

	if (initial !== null) {
		values.set(UI_PREFERENCES_STORAGE_KEY, initial);
	}

	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key: string, value: string): void => {
			values.set(key, value);
		}
	};
};

describe('versioned UI preferences', () => {
	test('round-trips validated preferences and migrates version zero data', () => {
		const storage = mapStorage();
		const project = createRigProject();
		const preferences = updateProjectUiPreferences(defaultUiPreferences(), project.id, (current) => ({
			...current,
			assetDensity: 'thumbnail',
			viewportPreset: 'gameplay-preview',
			leftDockTab: 'draw-order',
			pinnedTimelineEntityIds: [fixtureIds.slot],
			collapsedInspectorSections: ['entity-properties'],
			layout: { ...current.layout, leftDockWidth: 312, timelineHeight: 300 }
		}));

		expect(saveUiPreferences(preferences, storage)).toBe(true);
		expect(loadUiPreferences(storage)).toEqual(preferences);
		expect(loadUiPreferences(storage).projects[project.id]?.viewportPreset).toBe('gameplay-preview');
		expect(migrateUiPreferences({
			version: 0,
			density: 'compact',
			projects: { [project.id]: { rightDockTab: 'assets' } }
		})).toMatchObject({
			version: UI_PREFERENCES_VERSION,
			globalDensity: 'compact',
			projects: { [project.id]: { assetDensity: 'compact', rightDockTab: 'assets' } }
		});
		expect(migrateUiPreferences({
			version: 0,
			projects: { [project.id]: {} }
		}).projects[project.id]?.viewportPreset).toBe('authoring');
	});

	test('recovers from malformed, unsupported, and partially invalid payloads', () => {
		const project = createRigProject();
		const malformedProject = parseUiPreferences({
			version: UI_PREFERENCES_VERSION,
			globalDensity: 'thumbnail',
			projects: {
				[project.id]: {
					leftDockTab: 'invalid',
					assetDensity: 'compact',
					layout: { timelineHeight: 'not-a-number' }
				}
			}
		});
		const defaults = defaultProjectUiPreferences();

		expect(malformedProject.projects[project.id]).toMatchObject({
			...defaults,
			assetDensity: 'compact',
			viewportPreset: defaults.viewportPreset,
			leftDockTab: defaults.leftDockTab,
			layout: defaults.layout
		});
		expect(parseUiPreferences({
			version: UI_PREFERENCES_VERSION,
			globalDensity: 'list',
			projects: { [project.id]: { viewportPreset: 'stale-preset' } }
		}).projects[project.id]?.viewportPreset).toBe('authoring');
		expect(parseUiPreferences({ version: 999, projects: {} })).toEqual(defaultUiPreferences());
		expect(parseUiPreferences({ version: 1, globalDensity: 'thumbnail', projects: {} })).toEqual(defaultUiPreferences());
		expect(loadUiPreferences(mapStorage('{not-json'))).toEqual(defaultUiPreferences());
	});

	test('silently recovers when storage reads or writes throw', () => {
		const readFailure: PreferencesStorage = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => undefined
		};
		const writeFailure: PreferencesStorage = {
			getItem: () => null,
			setItem: () => {
				throw new Error('quota');
			}
		};

		expect(loadUiPreferences(readFailure)).toEqual(defaultUiPreferences());
		expect(saveUiPreferences(defaultUiPreferences(), writeFailure)).toBe(false);
		expect(loadUiPreferences(undefined)).toEqual(defaultUiPreferences());
	});

	test('drops stale and duplicate entity references for the matching project only', () => {
		const project = createRigProject();
		const otherProject = { ...project, id: '123e4567-e89b-42d3-a456-426614174099' };
		const staleId = '123e4567-e89b-42d3-a456-426614174099';
		const preferences = updateProjectUiPreferences(defaultUiPreferences(), project.id, (current) => ({
				...current,
				rigExpandedIds: [fixtureIds.root, fixtureIds.root, staleId],
				hiddenEntityIds: [fixtureIds.image, staleId],
				selectionHistory: [
					[{ kind: 'asset', id: fixtureIds.asset }],
					[{ kind: 'bone', id: staleId }]
				],
				timelineExpandedIds: [`entity:${fixtureIds.root}`, `entity:${staleId}`, 'invalid'],
				pinnedTimelineEntityIds: [fixtureIds.slot, fixtureIds.asset, staleId]
			}));
		const matching = projectUiPreferencesFor(preferences, project);
		const other = projectUiPreferencesFor(preferences, otherProject);

		expect(matching.rigExpandedIds).toEqual([fixtureIds.root]);
		expect(matching.hiddenEntityIds).toEqual([fixtureIds.image]);
		expect(matching.selectionHistory).toEqual([[{ kind: 'asset', id: fixtureIds.asset }]]);
		expect(matching.timelineExpandedIds).toEqual([`entity:${fixtureIds.root}`]);
		expect(matching.pinnedTimelineEntityIds).toEqual([fixtureIds.slot]);
		expect(other.assetDensity).toBe('list');
		expect(other.hiddenEntityIds).toEqual([]);
		expect(other.rigExpandedIds).toEqual(project.bones.map((bone) => bone.id));
	});

	test('round-trips additive snapshots and bounds structured history without flattening', () => {
		const project = createRigProject();
		const snapshots = Array.from({ length: 23 }, (_, index) => index % 2 === 0
			? [{ kind: 'bone' as const, id: fixtureIds.root }]
			: [
				{ kind: 'bone' as const, id: fixtureIds.root },
				{ kind: 'asset' as const, id: fixtureIds.asset }
			]);
		const preferences = updateProjectUiPreferences(defaultUiPreferences(), project.id, (current) => ({
			...current,
			selectionHistory: snapshots
		}));
		const storage = mapStorage();

		expect(saveUiPreferences(preferences, storage)).toBe(true);
		const loaded = loadUiPreferences(storage);
		expect(loaded.projects[project.id]?.selectionHistory).toEqual(snapshots.slice(-20));
		const bounded = projectUiPreferencesFor(preferences, project).selectionHistory;

		expect(bounded).toHaveLength(20);
		expect(bounded[0]).toEqual(snapshots[3]);
		expect(bounded.at(-1)).toEqual(snapshots[22]);
		expect(bounded.some((selection) => selection.length === 2)).toBe(true);
	});

	test('drops malformed structured snapshots while retaining valid snapshots', () => {
		const parsed = parseUiPreferences({
			version: UI_PREFERENCES_VERSION,
			globalDensity: 'list',
			projects: {
				[fixtureIds.project]: {
					selectionHistory: [
						[{ kind: 'bone', id: fixtureIds.root }],
						[{ kind: 'unknown', id: fixtureIds.root }],
						[{ kind: 'attachment', id: 'not-an-entity-id' }],
						[{ kind: 'bone', id: fixtureIds.root }, { kind: 'bone', id: fixtureIds.root }]
					]
				}
			}
		});

		expect(parsed.projects[fixtureIds.project]?.selectionHistory).toEqual([
			[{ kind: 'bone', id: fixtureIds.root }],
			[{ kind: 'bone', id: fixtureIds.root }]
		]);
	});

	test('keeps UI preferences outside history and archive/export project data', async () => {
		const project = createRigProject();
		const history = createHistory(project);
		const preferences = updateProjectUiPreferences(defaultUiPreferences(), project.id, (current) => ({
			...current,
			hiddenEntityIds: [fixtureIds.root],
			collapsedInspectorSections: ['entity-properties'],
			assetDensity: 'thumbnail',
			viewportPreset: 'visual-preview'
		}));
		const exported = await exportProjectArchive(project, new Map([[fixtureIds.asset, sourceBytes]]));

		expect(projectUiPreferencesFor(preferences, project).hiddenEntityIds).toEqual([fixtureIds.root]);
		expect(projectUiPreferencesFor(preferences, project).collapsedInspectorSections).toEqual(['entity-properties']);
		expect(currentProject(history)).toBe(project);
		expect(history.past).toHaveLength(0);
		expect(exported.ok).toBe(true);

		if (!exported.ok) {
			return;
		}

		const projectEntry = unzipSync(exported.value)['project.json'];

		if (!projectEntry) {
			throw new Error('The archive project entry is missing.');
		}

		const archivedProject = JSON.parse(strFromU8(projectEntry)) as Readonly<Record<string, unknown>>;

		expect(archivedProject).not.toHaveProperty('uiPreferences');
		expect(archivedProject).not.toHaveProperty('presentation');
	});
});
