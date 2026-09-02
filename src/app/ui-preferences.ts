import { isEntityId, type EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';
import { DEFAULT_WORKSPACE_LAYOUT, type WorkspaceLayout } from './workspace-layout.ts';
import type { TimelineRowMode } from './timeline-model.ts';

export const UI_PREFERENCES_STORAGE_KEY = 'bone-animation.ui-preferences.v1';
export const UI_PREFERENCES_VERSION = 1 as const;
export const LEGACY_UI_PREFERENCES_VERSION = 0 as const;

export type AssetDensity = 'list' | 'compact' | 'thumbnail';
export type LeftDockTab = 'rig' | 'draw-order';
export type RightDockTab = 'properties' | 'assets';

export type ProjectUiPreferences = Readonly<{
	layout: WorkspaceLayout;
	leftDockTab: LeftDockTab;
	rightDockTab: RightDockTab;
	assetDensity: AssetDensity;
	rigExpandedIds: readonly EntityId[];
	hiddenEntityIds: readonly EntityId[];
	selectionHistory: readonly EntityId[];
	timelineRowMode: TimelineRowMode;
	timelineExpandedIds: readonly string[];
	pinnedTimelineEntityIds: readonly EntityId[];
	collapsedInspectorSections: readonly string[];
}>;

export type UiPreferences = Readonly<{
	version: typeof UI_PREFERENCES_VERSION;
	globalDensity: AssetDensity;
	projects: Readonly<Record<string, ProjectUiPreferences>>;
}>;

export type PreferencesStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const defaultProjectUiPreferences = function defaultProjectUiPreferences(): ProjectUiPreferences {
	return {
		layout: { ...DEFAULT_WORKSPACE_LAYOUT },
		leftDockTab: 'rig',
		rightDockTab: 'properties',
		assetDensity: 'list',
		rigExpandedIds: [],
		hiddenEntityIds: [],
		selectionHistory: [],
		timelineRowMode: 'selection',
		timelineExpandedIds: [],
		pinnedTimelineEntityIds: [],
		collapsedInspectorSections: []
	};
};

export const defaultUiPreferences = function defaultUiPreferences(): UiPreferences {
	return {
		version: UI_PREFERENCES_VERSION,
		globalDensity: 'list',
		projects: {}
	};
};

const isRecord = function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isStringArray = function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
};

const isIdArray = function isIdArray(value: unknown): value is readonly EntityId[] {
	return Array.isArray(value) && value.every((item) => isEntityId(item));
};

const isAssetDensity = function isAssetDensity(value: unknown): value is AssetDensity {
	return value === 'list' || value === 'compact' || value === 'thumbnail';
};

const isTimelineRowMode = function isTimelineRowMode(value: unknown): value is TimelineRowMode {
	return value === 'selection' || value === 'all-keyed';
};

const isLeftDockTab = function isLeftDockTab(value: unknown): value is LeftDockTab {
	return value === 'rig' || value === 'draw-order';
};

const isRightDockTab = function isRightDockTab(value: unknown): value is RightDockTab {
	return value === 'properties' || value === 'assets';
};

const isBoolean = function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
};

const isFiniteNumber = function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
};

const isWorkspaceLayout = function isWorkspaceLayout(value: unknown): value is WorkspaceLayout {
	return isRecord(value)
		&& isFiniteNumber(value.leftDockWidth)
		&& isFiniteNumber(value.rightDockWidth)
		&& isFiniteNumber(value.timelineHeight)
		&& isBoolean(value.leftDockCollapsed)
		&& isBoolean(value.rightDockCollapsed);
};

const parseProjectPreferences = function parseProjectPreferences(
	value: unknown,
	legacyDensity: AssetDensity = 'list'
): ProjectUiPreferences | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const defaults = defaultProjectUiPreferences();
	const density = isAssetDensity(value.assetDensity)
		? value.assetDensity
		: isAssetDensity(value.density)
			? value.density
			: legacyDensity;

	return {
		layout: isWorkspaceLayout(value.layout) ? { ...value.layout } : defaults.layout,
		leftDockTab: isLeftDockTab(value.leftDockTab) ? value.leftDockTab : defaults.leftDockTab,
		rightDockTab: isRightDockTab(value.rightDockTab) ? value.rightDockTab : defaults.rightDockTab,
		assetDensity: density,
		rigExpandedIds: isIdArray(value.rigExpandedIds) ? [...value.rigExpandedIds] : defaults.rigExpandedIds,
		hiddenEntityIds: isIdArray(value.hiddenEntityIds) ? [...value.hiddenEntityIds] : defaults.hiddenEntityIds,
		selectionHistory: isIdArray(value.selectionHistory) ? [...value.selectionHistory] : defaults.selectionHistory,
		timelineRowMode: isTimelineRowMode(value.timelineRowMode) ? value.timelineRowMode : defaults.timelineRowMode,
		timelineExpandedIds: isStringArray(value.timelineExpandedIds) ? [...value.timelineExpandedIds] : defaults.timelineExpandedIds,
		pinnedTimelineEntityIds: isIdArray(value.pinnedTimelineEntityIds) ? [...value.pinnedTimelineEntityIds] : defaults.pinnedTimelineEntityIds,
		collapsedInspectorSections: isStringArray(value.collapsedInspectorSections) ? [...value.collapsedInspectorSections] : defaults.collapsedInspectorSections
	};
};

const parseProjects = function parseProjects(
	value: unknown,
	legacyDensity: AssetDensity = 'list'
): Readonly<Record<string, ProjectUiPreferences>> {
	if (!isRecord(value)) {
		return {};
	}

	return Object.entries(value).reduce<Readonly<Record<string, ProjectUiPreferences>>>((current, [id, projectPreferences]) => {
		const parsed = parseProjectPreferences(projectPreferences, legacyDensity);

		return parsed && isEntityId(id) ? { ...current, [id]: parsed } : current;
	}, {});
};

const parseCurrentUiPreferences = function parseCurrentUiPreferences(value: Readonly<Record<string, unknown>>): UiPreferences {
	if (value.version !== UI_PREFERENCES_VERSION || !isAssetDensity(value.globalDensity) || !isRecord(value.projects)) {
		return defaultUiPreferences();
	}

	return {
		version: UI_PREFERENCES_VERSION,
		globalDensity: value.globalDensity,
		projects: parseProjects(value.projects, value.globalDensity)
	};
};

const migrateLegacyUiPreferences = function migrateLegacyUiPreferences(value: Readonly<Record<string, unknown>>): UiPreferences {
	if (value.version !== LEGACY_UI_PREFERENCES_VERSION) {
		return defaultUiPreferences();
	}

	const globalDensity = isAssetDensity(value.globalDensity)
		? value.globalDensity
		: isAssetDensity(value.density)
			? value.density
			: 'list';

	return {
		version: UI_PREFERENCES_VERSION,
		globalDensity,
		projects: parseProjects(value.projects, globalDensity)
	};
};

export const migrateUiPreferences = function migrateUiPreferences(value: unknown): UiPreferences {
	if (!isRecord(value)) {
		return defaultUiPreferences();
	}

	return value.version === LEGACY_UI_PREFERENCES_VERSION
		? migrateLegacyUiPreferences(value)
		: parseCurrentUiPreferences(value);
};

export const parseUiPreferences = migrateUiPreferences;

const browserStorage = function browserStorage(): PreferencesStorage | undefined {
	try {
		return typeof globalThis.localStorage === 'undefined' ? undefined : globalThis.localStorage;
	} catch {
		return undefined;
	}
};

export const loadUiPreferences = function loadUiPreferences(
	storage: PreferencesStorage | undefined = browserStorage()
): UiPreferences {
	if (!storage) {
		return defaultUiPreferences();
	}

	try {
		const raw = storage.getItem(UI_PREFERENCES_STORAGE_KEY);

		return raw ? parseUiPreferences(JSON.parse(raw) as unknown) : defaultUiPreferences();
	} catch {
		return defaultUiPreferences();
	}
};

export const saveUiPreferences = function saveUiPreferences(
	preferences: UiPreferences,
	storage: PreferencesStorage | undefined = browserStorage()
): boolean {
	if (!storage) {
		return false;
	}

	try {
		storage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));

		return true;
	} catch {
		return false;
	}
};

const projectEntityIds = function projectEntityIds(project: Project): ReadonlySet<EntityId> {
	return new Set([
		...project.assets.map((asset) => asset.id),
		...project.bones.map((bone) => bone.id),
		...project.slots.map((slot) => slot.id),
		...project.attachments.map((attachment) => attachment.id)
	]);
};

const validIdsOnly = function validIdsOnly(
	ids: readonly EntityId[],
	validIds: ReadonlySet<EntityId>
): readonly EntityId[] {
	return ids.filter((id, index) => validIds.has(id) && ids.indexOf(id) === index);
};

const validTimelineExpandedIdsOnly = function validTimelineExpandedIdsOnly(
	ids: readonly string[],
	validIds: ReadonlySet<EntityId>
): readonly string[] {
	return ids.filter((id, index) => {
		const entityId = id.startsWith('entity:') ? id.slice('entity:'.length) : undefined;

		return entityId !== undefined
			&& isEntityId(entityId)
			&& validIds.has(entityId)
			&& ids.indexOf(id) === index;
	});
};

export const projectUiPreferencesFor = function projectUiPreferencesFor(
	preferences: UiPreferences,
	project: Project
): ProjectUiPreferences {
	const storedPreferences = preferences.projects[project.id];
	const stored = storedPreferences ?? defaultProjectUiPreferences();
	const validIds = projectEntityIds(project);
	const validSelectionHistory = validIdsOnly(stored.selectionHistory, validIds);
	const expandedIds = storedPreferences
		? validIdsOnly(stored.rigExpandedIds, new Set(project.bones.map((bone) => bone.id)))
		: project.bones.map((bone) => bone.id);

	return {
		...stored,
		rigExpandedIds: expandedIds,
		hiddenEntityIds: validIdsOnly(stored.hiddenEntityIds, validIds),
		selectionHistory: validSelectionHistory,
		timelineExpandedIds: validTimelineExpandedIdsOnly(stored.timelineExpandedIds, validIds),
		pinnedTimelineEntityIds: validIdsOnly(stored.pinnedTimelineEntityIds, validIds)
	};
};

export const updateProjectUiPreferences = function updateProjectUiPreferences(
	preferences: UiPreferences,
	projectId: EntityId,
	update: (current: ProjectUiPreferences) => ProjectUiPreferences
): UiPreferences {
	const current = preferences.projects[projectId] ?? defaultProjectUiPreferences();

	return {
		...preferences,
		projects: { ...preferences.projects, [projectId]: update(current) }
	};
};
