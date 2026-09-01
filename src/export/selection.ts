import type { EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';

export type ExportOutputMode = 'combined' | 'per-clip';

export type ExportClipSelection = Readonly<{
	mode: ExportOutputMode;
	clipIds: readonly EntityId[];
}>;

export const clipIdsForProject = function clipIdsForProject(project: Project): readonly EntityId[] {
	return project.clips.map((clip) => clip.id);
};

export const normalizeExportClipIds = function normalizeExportClipIds(
	project: Project,
	clipIds: readonly EntityId[]
): readonly EntityId[] {
	return project.clips.flatMap((clip) => clipIds.includes(clip.id) ? [clip.id] : []);
};

export const createExportClipSelection = function createExportClipSelection(
	project: Project,
	mode: ExportOutputMode = 'combined'
): ExportClipSelection {
	return { mode, clipIds: clipIdsForProject(project) };
};

export const toggleExportClip = function toggleExportClip(
	project: Project,
	selection: ExportClipSelection,
	clipId: EntityId
): ExportClipSelection {
	const normalized = normalizeExportClipIds(project, selection.clipIds);

	return {
		...selection,
		clipIds: normalized.includes(clipId)
			? normalized.filter((candidate) => candidate !== clipId)
			: project.clips.flatMap((clip) => clip.id === clipId || normalized.includes(clip.id) ? [clip.id] : [])
	};
};

export const setExportOutputMode = function setExportOutputMode(
	selection: ExportClipSelection,
	mode: ExportOutputMode
): ExportClipSelection {
	return { ...selection, mode };
};
