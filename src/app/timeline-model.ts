import { isEntityId, type EntityId } from '../domain/ids.ts';
import type { TrackDefinition } from '../domain/animation.ts';
import type { ProjectCommand } from '../domain/commands.ts';
import type { Clip, CubicBezier, DiscreteKey, Interpolation, NumberKey, Project, Track } from '../domain/model.ts';
import type { SelectableEntity, Selection } from './selection.ts';
import { trackLabel } from './timeline.ts';

export type TimelineRowKind = 'overview' | 'entity' | 'property' | 'draw-order' | 'events';
export type TimelineRowMode = 'auto' | 'all-keyed';
export type TimelineRowModeInput = TimelineRowMode | 'selection';

export type TimelineMarkerKind =
	| 'continuous-stepped'
	| 'continuous-linear'
	| 'continuous-bezier'
	| 'attachment'
	| 'draw-order'
	| 'enabled'
	| 'event';

export type TimelineKeyMarker = Readonly<{
	id: EntityId;
	frameIndex: number;
	trackId?: EntityId;
	markerKind: TimelineMarkerKind;
	}>;

export type TimelineRow = Readonly<{
	id: string;
	kind: TimelineRowKind;
	depth: number;
	label: string;
	subLabel?: string;
	entityId?: EntityId;
	trackId?: EntityId;
	expandable: boolean;
	expanded: boolean;
	selected: boolean;
	keyed: boolean;
	keys: readonly TimelineKeyMarker[];
	}>;

export type EffectiveTimelineRows = Readonly<{
	mode: TimelineRowMode;
	selectedEntityIds: readonly EntityId[];
	pinnedEntityIds: readonly EntityId[];
	entityIds: readonly EntityId[];
	tracks: readonly Track[];
	trackCount: number;
	keyedTrackCount: number;
	rows: readonly TimelineRow[];
}>;

export type TimelineModelOptions = Readonly<{
	mode?: TimelineRowModeInput;
	filter?: string;
	expandedIds?: ReadonlySet<string>;
	pinnedEntityIds?: ReadonlySet<EntityId>;
	selection?: Selection;
	selectedTrackIds?: ReadonlySet<EntityId>;
	selectedEntityIds?: ReadonlySet<EntityId>;
	}>;

export type TimelineKeyReference = Readonly<{
	trackId: EntityId;
	keyId: EntityId;
	}>;

export type TimelineSelectableKey = TimelineKeyReference & Readonly<{
	frameIndex: number;
}>;

export type KeyDragPlan = Readonly<{
	deltaFrames: number;
	changes: readonly Readonly<{ trackId: EntityId; keyId: EntityId; timeSeconds: number }>[];
	}>;

export type KeyDragResult =
	| Readonly<{ ok: true; value: KeyDragPlan }>
	| Readonly<{ ok: false; error: string }>;

export type TimelineClipboardKey = Readonly<{
	definition: TrackDefinition;
	frameOffset: number;
	value: NumberKey['value'] | DiscreteKey<EntityId | null>['value'] | readonly EntityId[] | boolean;
	interpolation?: NumberKey['interpolation'];
	curve?: NumberKey['curve'];
	}>;

export type TimelineClipboard = Readonly<{
	earliestFrame: number;
	keys: readonly TimelineClipboardKey[];
	}>;

export type TimelineEditResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

export const normalizeTimelineRowMode = function normalizeTimelineRowMode(value: unknown): TimelineRowMode {
	return value === 'all-keyed' ? 'all-keyed' : 'auto';
};

const frameCountForClip = function frameCountForClip(clip: Clip): number | undefined {
	if (!Number.isFinite(clip.durationSeconds) || clip.durationSeconds <= 0) {
		return undefined;
	}
	if (!Number.isFinite(clip.fps) || clip.fps <= 0) {
		return undefined;
	}

	const frameCount = Math.ceil(clip.durationSeconds * clip.fps);

	return Number.isFinite(frameCount) && frameCount > 0 ? frameCount : undefined;
};

const isValidKeyTime = function isValidKeyTime(clip: Clip, timeSeconds: number): boolean {
	return frameCountForClip(clip) !== undefined
		&& Number.isFinite(timeSeconds)
		&& timeSeconds >= 0
		&& timeSeconds <= clip.durationSeconds;
};

const frameIndexForTime = function frameIndexForTime(clip: Clip, timeSeconds: number): number {
	const frameCount = frameCountForClip(clip);

	if (frameCount === undefined || !Number.isFinite(timeSeconds)) {
		return 0;
	}

	return Math.max(0, Math.min(frameCount - 1, Math.round(timeSeconds * clip.fps)));
};

const hasDuplicateIds = function hasDuplicateIds(ids: readonly EntityId[]): boolean {
	return new Set(ids).size !== ids.length;
};

const entityName = function entityName(project: Project, entityId: EntityId): string {
	return project.bones.find((bone) => bone.id === entityId)?.name
		?? project.slots.find((slot) => slot.id === entityId)?.name
		?? project.attachments.find((attachment) => attachment.id === entityId)?.name
		?? entityId;
};

const entityKindLabel = function entityKindLabel(project: Project, entityId: EntityId): string {
	if (project.bones.some((bone) => bone.id === entityId)) {
		return 'Bone';
	}
	if (project.slots.some((slot) => slot.id === entityId)) {
		return 'Slot';
	}

	return project.attachments.find((attachment) => attachment.id === entityId)?.kind === 'rectangle'
		? 'Rectangle'
		: project.attachments.find((attachment) => attachment.id === entityId)?.kind === 'point'
			? 'Point'
			: 'Attachment';
};

export const timelineEntityIdsForProject = function timelineEntityIdsForProject(
	project: Project
): ReadonlySet<EntityId> {
	return new Set([
		...project.bones.map((bone) => bone.id),
		...project.slots.map((slot) => slot.id),
		...project.attachments.map((attachment) => attachment.id)
	]);
};

export const validPinnedTimelineEntityIds = function validPinnedTimelineEntityIds(
	project: Project,
	pinnedEntityIds: ReadonlySet<EntityId> | undefined
): ReadonlySet<EntityId> {
	const validEntityIds = timelineEntityIdsForProject(project);

	return new Set([...pinnedEntityIds ?? []].filter((entityId) => validEntityIds.has(entityId)));
};

const trackEntityId = function trackEntityId(track: Track): EntityId | undefined {
	return 'targetId' in track ? track.targetId : undefined;
};

const uniqueEntityIds = function uniqueEntityIds(ids: readonly EntityId[]): readonly EntityId[] {
	return ids.filter((id, index) => ids.indexOf(id) === index);
};

const selectionEntityIsValid = function selectionEntityIsValid(
	project: Project,
	entity: SelectableEntity
): boolean {
	if (entity.kind === 'asset') {
		return false;
	}
	if (entity.kind === 'bone') {
		return project.bones.some((bone) => bone.id === entity.id);
	}
	if (entity.kind === 'slot') {
		return project.slots.some((slot) => slot.id === entity.id);
	}

	return project.attachments.some((attachment) => attachment.id === entity.id);
};

export const selectedTimelineEntityIdsForProject = function selectedTimelineEntityIdsForProject(
	project: Project,
	selection: Selection | undefined
): readonly EntityId[] {
	return uniqueEntityIds((selection ?? []).flatMap((entity) => (
		selectionEntityIsValid(project, entity) ? [entity.id] : []
	)));
};

export const isTimelineTrackValidForProject = function isTimelineTrackValidForProject(
	project: Project,
	track: Track
): boolean {
	if (track.kind === 'slot-draw-order') {
		return true;
	}
	if (track.kind === 'bone-transform') {
		return project.bones.some((bone) => bone.id === track.targetId);
	}
	if (track.kind === 'slot-attachment') {
		return project.slots.some((slot) => slot.id === track.targetId);
	}

	return project.attachments.some((attachment) => attachment.id === track.targetId);
};

const keyedTimelineEntityIds = function keyedTimelineEntityIds(
	project: Project,
	clip: Clip
): readonly EntityId[] {
	return uniqueEntityIds(clip.tracks.flatMap((track) => {
		const targetId = trackEntityId(track);

		return isTimelineTrackValidForProject(project, track) && track.keys.length > 0 && targetId
			? [targetId]
			: [];
	}));
};

export const effectiveTimelineEntityIds = function effectiveTimelineEntityIds(
	project: Project,
	clip: Clip,
	options: TimelineModelOptions = {}
): readonly EntityId[] {
	const mode = normalizeTimelineRowMode(options.mode);
	const selectedEntityIds = uniqueEntityIds([
		...selectedTimelineEntityIdsForProject(project, options.selection),
		...[...(options.selectedEntityIds ?? [])].filter((entityId) => timelineEntityIdsForProject(project).has(entityId))
	]);
	const pinnedEntityIds = [...validPinnedTimelineEntityIds(project, options.pinnedEntityIds)];
	const keyedEntityIds = keyedTimelineEntityIds(project, clip);
	const baseEntityIds = mode === 'all-keyed'
		? keyedEntityIds
		: selectedEntityIds.length > 0
			? selectedEntityIds
			: keyedEntityIds;

	return uniqueEntityIds(mode === 'auto' ? [...baseEntityIds, ...pinnedEntityIds] : baseEntityIds);
};

const trackMatchesFilter = function trackMatchesFilter(
	project: Project,
	track: Track,
	filter: string
): boolean {
	const query = filter.trim().toLowerCase();

	return query.length === 0 || `${trackLabel(project, track)} ${track.kind}`.toLowerCase().includes(query);
};

const trackDefinition = function trackDefinition(track: Track): TrackDefinition {
	if (track.kind === 'slot-draw-order') {
		return { kind: 'slot-draw-order' };
	}
	if (track.kind === 'bone-transform') {
		return { kind: track.kind, targetId: track.targetId, property: track.property };
	}
	if (track.kind === 'attachment-transform') {
		return { kind: track.kind, targetId: track.targetId, property: track.property };
	}
	if (track.kind === 'attachment-opacity') {
		return { kind: track.kind, targetId: track.targetId };
	}
	if (track.kind === 'slot-attachment') {
		return { kind: track.kind, targetId: track.targetId };
	}
	if (track.kind === 'point-enabled') {
		return { kind: track.kind, targetId: track.targetId };
	}
	if (track.kind === 'rectangle-size') {
		return { kind: track.kind, targetId: track.targetId, property: track.property };
	}

	return { kind: 'rectangle-enabled', targetId: track.targetId };
};

const markerKindForKey = function markerKindForKey(track: Track, key: Track['keys'][number]): TimelineMarkerKind {
	if (track.kind === 'slot-attachment') {
		return 'attachment';
	}
	if (track.kind === 'slot-draw-order') {
		return 'draw-order';
	}
	if (track.kind === 'point-enabled' || track.kind === 'rectangle-enabled') {
		return 'enabled';
	}

	if ('interpolation' in key) {
		return key.interpolation === 'bezier'
			? 'continuous-bezier'
			: key.interpolation === 'stepped'
				? 'continuous-stepped'
				: 'continuous-linear';
	}

	return 'continuous-linear';
};

const markersForTrack = function markersForTrack(
	clip: Clip,
	track: Track
): readonly TimelineKeyMarker[] {
	return track.keys
		.map((key) => ({
			id: key.id,
			frameIndex: frameIndexForTime(clip, key.timeSeconds),
			trackId: track.id,
			markerKind: markerKindForKey(track, key)
		}))
		.toSorted((left, right) => left.frameIndex - right.frameIndex || left.id.localeCompare(right.id));
};

const keysForTracks = function keysForTracks(
	clip: Clip,
	tracks: readonly Track[]
): readonly TimelineKeyMarker[] {
	return tracks
		.flatMap((track) => markersForTrack(clip, track))
		.toSorted((left, right) => left.frameIndex - right.frameIndex || left.id.localeCompare(right.id));
};

const rowMatchesFilter = function rowMatchesFilter(row: TimelineRow, filter: string): boolean {
	const query = filter.trim().toLowerCase();

	return query.length === 0 || `${row.label} ${row.subLabel ?? ''}`.toLowerCase().includes(query);
};

const trackIsVisible = function trackIsVisible(
	project: Project,
	track: Track,
	mode: TimelineRowMode,
	effectiveEntityIds: ReadonlySet<EntityId>,
	selectedTrackIds: ReadonlySet<EntityId>,
	filter: string
): boolean {
	if (!isTimelineTrackValidForProject(project, track) || !trackMatchesFilter(project, track, filter)) {
		return false;
	}
	if (mode === 'all-keyed') {
		return track.keys.length > 0;
	}

	const targetId = trackEntityId(track);

	return targetId === undefined
		? track.keys.length > 0
		: effectiveEntityIds.has(targetId) || selectedTrackIds.has(track.id);
};

const groupTrackRows = function groupTrackRows(
	project: Project,
	clip: Clip,
	options: TimelineModelOptions,
	tracks: readonly Track[]
): readonly TimelineRow[] {
	const selection = options.selection ?? [];
	const selectedTrackIds = options.selectedTrackIds ?? new Set<EntityId>();
	const selectedEntityIds = new Set([
		...selectedTimelineEntityIdsForProject(project, selection),
		...[...(options.selectedEntityIds ?? [])].filter((entityId) => timelineEntityIdsForProject(project).has(entityId))
	]);
	const expandedIds = options.expandedIds ?? new Set<string>();
	const query = options.filter ?? '';
	const grouped = tracks.reduce<ReadonlyMap<EntityId, readonly Track[]>>((groups, track) => {
		const targetId = trackEntityId(track);

		if (!targetId) {
			return groups;
		}

		const current = groups.get(targetId) ?? [];

		return new Map([...groups, [targetId, [...current, track]]]);
	}, new Map());
	const groupOrder = [...grouped.keys()].toSorted((left, right) => (
		entityName(project, left).localeCompare(entityName(project, right)) || left.localeCompare(right)
	));

	return groupOrder.flatMap((entityId) => {
		const entityTracks = (grouped.get(entityId) ?? []).toSorted((left, right) => (
			trackLabel(project, left).localeCompare(trackLabel(project, right)) || left.id.localeCompare(right.id)
		));
		const groupId = `entity:${entityId}`;
		const groupBase: TimelineRow = {
			id: groupId,
			kind: 'entity',
			depth: 0,
			label: entityName(project, entityId),
			subLabel: entityKindLabel(project, entityId),
			entityId,
			expandable: true,
			expanded: false,
			selected: selectedEntityIds.has(entityId)
				|| entityTracks.some((track) => selectedTrackIds.has(track.id)),
			keyed: entityTracks.some((track) => track.keys.length > 0),
			keys: keysForTracks(clip, entityTracks)
		};
		const matchingTracks = entityTracks;
		const expandsByDefault = expandedIds.size === 0;
		const expandsForFilter = query.trim().length > 0 && matchingTracks.length > 0;
		const group: TimelineRow = {
			...groupBase,
			expanded: expandsByDefault || expandedIds.has(groupId) || expandsForFilter
		};

		if (!rowMatchesFilter(group, query) && matchingTracks.length === 0) {
			return [];
		}

		const propertyRows = group.expanded
			? matchingTracks.map((track): TimelineRow => ({
				id: `property:${track.id}`,
				kind: 'property',
				depth: 1,
				label: trackLabel(project, track),
				subLabel: track.kind,
				entityId,
				trackId: track.id,
				expandable: false,
				expanded: false,
				selected: selectedTrackIds.has(track.id),
				keyed: track.keys.length > 0,
				keys: markersForTrack(clip, track)
			}))
			: [];

		return [group, ...propertyRows];
	});
};

const dedicatedRows = function dedicatedRows(
	clip: Clip,
	options: TimelineModelOptions,
	tracks: readonly Track[]
): readonly TimelineRow[] {
	const query = options.filter ?? '';
	const drawOrderTracks = tracks.filter((track) => track.kind === 'slot-draw-order');
	const drawOrder: TimelineRow | undefined = drawOrderTracks.length > 0
		? {
			id: 'draw-order',
			kind: 'draw-order',
			depth: 0,
			label: 'Draw Order',
			subLabel: 'Slot order',
			expandable: false,
			expanded: false,
			selected: false,
			keyed: drawOrderTracks.some((track) => track.keys.length > 0),
			keys: keysForTracks(clip, drawOrderTracks)
		}
		: undefined;
	const events: TimelineRow = {
		id: 'events',
		kind: 'events',
		depth: 0,
		label: 'Events',
		subLabel: `${clip.events.length} event${clip.events.length === 1 ? '' : 's'}`,
		expandable: false,
		expanded: false,
		selected: false,
		keyed: clip.events.length > 0,
		keys: clip.events
			.map((event) => ({ id: event.id, frameIndex: frameIndexForTime(clip, event.timeSeconds), markerKind: 'event' as const }))
			.toSorted((left, right) => left.frameIndex - right.frameIndex || left.id.localeCompare(right.id))
	};

	return [
		...(drawOrder && rowMatchesFilter(drawOrder, query) ? [drawOrder] : []),
		...(rowMatchesFilter(events, query) ? [events] : [])
	];
};

const buildGroupedTimelineRowsForTracks = function buildGroupedTimelineRowsForTracks(
	project: Project,
	clip: Clip,
	options: TimelineModelOptions,
	tracks: readonly Track[]
): readonly TimelineRow[] {
	const overview: TimelineRow = {
		id: 'overview',
		kind: 'overview',
		depth: 0,
		label: clip.name,
		subLabel: `${tracks.length} track${tracks.length === 1 ? '' : 's'}`,
		expandable: false,
		expanded: false,
		selected: false,
		keyed: tracks.some((track) => track.keys.length > 0),
		keys: keysForTracks(clip, tracks)
	};

	return [overview, ...groupTrackRows(project, clip, options, tracks), ...dedicatedRows(clip, options, tracks)];
};

export const resolveEffectiveTimelineRows = function resolveEffectiveTimelineRows(
	project: Project,
	clip: Clip,
	options: TimelineModelOptions = {}
): EffectiveTimelineRows {
	const mode = normalizeTimelineRowMode(options.mode);
	const validEntityIds = timelineEntityIdsForProject(project);
	const selectedEntityIds = uniqueEntityIds([
		...selectedTimelineEntityIdsForProject(project, options.selection),
		...[...(options.selectedEntityIds ?? [])].filter((entityId) => validEntityIds.has(entityId))
	]);
	const pinnedEntityIds = [...validPinnedTimelineEntityIds(project, options.pinnedEntityIds)];
	const entityIds = effectiveTimelineEntityIds(project, clip, { ...options, mode, selectedEntityIds: new Set(selectedEntityIds) });
	const effectiveEntityIdSet = new Set(entityIds);
	const selectedTrackIds = options.selectedTrackIds ?? new Set<EntityId>();
	const tracks = clip.tracks.filter((track) => trackIsVisible(
		project,
		track,
		mode,
		effectiveEntityIdSet,
		selectedTrackIds,
		options.filter ?? ''
	));
	const rows = buildGroupedTimelineRowsForTracks(project, clip, {
		...options,
		mode,
		selection: options.selection,
		selectedEntityIds: new Set(selectedEntityIds)
	}, tracks);

	return {
		mode,
		selectedEntityIds,
		pinnedEntityIds,
		entityIds,
		tracks,
		trackCount: tracks.length,
		keyedTrackCount: tracks.filter((track) => track.keys.length > 0).length,
		rows
	};
};

export const buildGroupedTimelineRows = function buildGroupedTimelineRows(
	project: Project,
	clip: Clip,
	options: TimelineModelOptions = {}
): readonly TimelineRow[] {
	return resolveEffectiveTimelineRows(project, clip, options).rows;
};

export const selectableTimelineKeysForRows = function selectableTimelineKeysForRows(
	rows: readonly TimelineRow[]
): readonly TimelineSelectableKey[] {
	return rows.flatMap((row) => row.kind === 'property' || row.kind === 'draw-order'
		? row.keys.flatMap((key) => key.trackId
			? [{ trackId: key.trackId, keyId: key.id, frameIndex: key.frameIndex }]
			: [])
		: []);
};

const trackForReference = function trackForReference(
	clip: Clip,
	reference: TimelineKeyReference
): Track | undefined {
	return clip.tracks.find((track) => track.id === reference.trackId && track.keys.some((key) => key.id === reference.keyId));
};

const referenceKey = function referenceKey(reference: TimelineKeyReference): string {
	return `${reference.trackId}:${reference.keyId}`;
};

const invalidTimelineData = function invalidTimelineData(clip: Clip): boolean {
	const trackIds = clip.tracks.map((track) => track.id);
	const keyIds = clip.tracks.flatMap((track) => track.keys.map((key) => key.id));

	return frameCountForClip(clip) === undefined
		|| hasDuplicateIds(trackIds)
		|| hasDuplicateIds(keyIds)
		|| clip.tracks.some((track) => track.keys.some((key) => !isValidKeyTime(clip, key.timeSeconds)));
};

export const planKeyDrag = function planKeyDrag(
	clip: Clip,
	selectedKeys: readonly TimelineKeyReference[],
	deltaPixels: number,
	pixelsPerFrame: number
): KeyDragResult {
	if (selectedKeys.length === 0) {
		return { ok: false, error: 'Select at least one key before dragging.' };
	}
	if (!Number.isFinite(pixelsPerFrame) || pixelsPerFrame <= 0) {
		return { ok: false, error: 'Timeline scale is unavailable.' };
	}
	if (!Number.isFinite(deltaPixels)) {
		return { ok: false, error: 'Pointer movement is unavailable.' };
	}
	if (invalidTimelineData(clip)) {
		return { ok: false, error: 'Animation keys or clip timing are invalid.' };
	}
	if (hasDuplicateIds(selectedKeys.map(referenceKey))) {
		return { ok: false, error: 'Each selected key may appear only once.' };
	}

	const deltaFrames = Math.round(deltaPixels / pixelsPerFrame);
	const selected = selectedKeys.flatMap((reference) => {
		const track = trackForReference(clip, reference);
		const key = track?.keys.find((candidate) => candidate.id === reference.keyId);

		return track && key ? [{ reference, track, key, frameIndex: frameIndexForTime(clip, key.timeSeconds) }] : [];
	});

	if (selected.length !== selectedKeys.length) {
		return { ok: false, error: 'One or more selected keys no longer exists.' };
	}

	const frameCount = frameCountForClip(clip);

	if (frameCount === undefined) {
		return { ok: false, error: 'Animation keys or clip timing are invalid.' };
	}

	const minimum = Math.min(...selected.map((item) => item.frameIndex));
	const maximum = Math.max(...selected.map((item) => item.frameIndex));
	const clampedDelta = Math.max(-minimum, Math.min(frameCount - 1 - maximum, deltaFrames));

	if (clampedDelta === 0) {
		return { ok: true, value: { deltaFrames: 0, changes: [] } };
	}

	const selectedReferences = new Set(selected.map((item) => referenceKey(item.reference)));
	const changes = selected.map((item) => ({
		trackId: item.track.id,
		keyId: item.key.id,
		timeSeconds: (item.frameIndex + clampedDelta) / clip.fps
	}));
	const collisions = clip.tracks.some((track) => {
		const targetFrames = changes
			.filter((change) => change.trackId === track.id)
			.map((change) => Math.round(change.timeSeconds * clip.fps));

		return new Set(targetFrames).size !== targetFrames.length
			|| track.keys.some((key) => !selectedReferences.has(referenceKey({ trackId: track.id, keyId: key.id }))
				&& targetFrames.includes(frameIndexForTime(clip, key.timeSeconds)));
	});

	if (collisions) {
		return { ok: false, error: 'Keys cannot overlap another key on the same track.' };
	}

	return { ok: true, value: { deltaFrames: clampedDelta, changes } };
};

export const createTimelineClipboard = function createTimelineClipboard(
	clip: Clip,
	selectedKeys: readonly TimelineKeyReference[]
): TimelineEditResult<TimelineClipboard> {
	const selected = selectedKeys.flatMap((reference) => {
		const track = trackForReference(clip, reference);
		const key = track?.keys.find((candidate) => candidate.id === reference.keyId);

		return track && key ? [{ track, key, frameIndex: frameIndexForTime(clip, key.timeSeconds) }] : [];
	});

	if (selected.length !== selectedKeys.length || selected.length === 0) {
		return { ok: false, error: 'Selected keys are no longer available to copy.' };
	}

	const earliestFrame = Math.min(...selected.map((item) => item.frameIndex));
	const keys = selected.flatMap((item): readonly TimelineClipboardKey[] => {
		const definition = trackDefinition(item.track);
		const frameOffset = item.frameIndex - earliestFrame;

		if (item.track.kind === 'bone-transform' || item.track.kind === 'attachment-transform' || item.track.kind === 'attachment-opacity' || item.track.kind === 'rectangle-size') {
			const key = item.track.keys.find((candidate) => candidate.id === item.key.id);

			return key ? [{ definition, frameOffset, value: key.value, interpolation: key.interpolation, curve: key.curve }] : [];
		}
		if (item.track.kind === 'slot-draw-order') {
			const key = item.track.keys.find((candidate) => candidate.id === item.key.id);

			return key ? [{ definition, frameOffset, value: [...key.value] }] : [];
		}
		if (item.track.kind === 'slot-attachment') {
			const key = item.track.keys.find((candidate) => candidate.id === item.key.id);

			return key ? [{ definition, frameOffset, value: key.value }] : [];
		}

		const key = item.track.keys.find((candidate) => candidate.id === item.key.id);

		return key ? [{ definition, frameOffset, value: key.value }] : [];
	});

	return { ok: true, value: { earliestFrame, keys } };
};

const isNumberKeyDefinition = function isNumberKeyDefinition(
	definition: TrackDefinition
): boolean {
	return definition.kind === 'bone-transform'
		|| definition.kind === 'attachment-transform'
		|| definition.kind === 'attachment-opacity'
		|| definition.kind === 'rectangle-size';
};

const definitionsMatch = function definitionsMatch(left: TrackDefinition, right: TrackDefinition): boolean {
	if (left.kind !== right.kind) {
		return false;
	}

	return ('targetId' in left ? 'targetId' in right && left.targetId === right.targetId : true)
		&& ('property' in left ? 'property' in right && left.property === right.property : true);
};

const isRecord = function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isInterpolation = function isInterpolation(value: unknown): value is Interpolation {
	return value === 'stepped' || value === 'linear' || value === 'bezier';
};

const isCubicBezier = function isCubicBezier(value: unknown): value is CubicBezier {
	if (!isRecord(value)) {
		return false;
	}

	const x1 = value.x1;
	const y1 = value.y1;
	const x2 = value.x2;
	const y2 = value.y2;

	return typeof x1 === 'number'
		&& typeof y1 === 'number'
		&& typeof x2 === 'number'
		&& typeof y2 === 'number'
		&& Number.isFinite(x1)
		&& Number.isFinite(y1)
		&& Number.isFinite(x2)
		&& Number.isFinite(y2)
		&& x1 >= 0
		&& x1 <= 1
		&& x2 >= 0
		&& x2 <= 1;
};

const isTrackDefinition = function isTrackDefinition(value: unknown): value is TrackDefinition {
	if (!isRecord(value) || typeof value.kind !== 'string') {
		return false;
	}

	if (value.kind === 'slot-draw-order') {
		return true;
	}
	if (!isEntityId(value.targetId)) {
		return false;
	}
	if (value.kind === 'bone-transform' || value.kind === 'attachment-transform') {
		return typeof value.property === 'string'
			&& ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'].includes(value.property);
	}
	if (value.kind === 'attachment-opacity' || value.kind === 'slot-attachment' || value.kind === 'point-enabled' || value.kind === 'rectangle-enabled') {
		return true;
	}

	return value.kind === 'rectangle-size'
		&& (value.property === 'width' || value.property === 'height');
};

const projectEntityIds = function projectEntityIds(project: Project): readonly EntityId[] {
	return [
		project.id,
		...project.assets.map((asset) => asset.id),
		...project.bones.map((bone) => bone.id),
		...project.slots.map((slot) => slot.id),
		...project.attachments.map((attachment) => attachment.id),
		...project.clips.flatMap((clip) => [clip.id, ...clip.tracks.flatMap((track) => [track.id, ...track.keys.map((key) => key.id)]), ...clip.events.map((event) => event.id)])
	];
};

const validClipboardKey = function validClipboardKey(
	key: unknown,
	project: Project
): key is TimelineClipboardKey {
	if (!isRecord(key) || !isTrackDefinition(key.definition)) {
		return false;
	}
	const frameOffset = key.frameOffset;

	if (typeof frameOffset !== 'number' || !Number.isInteger(frameOffset) || frameOffset < 0) {
		return false;
	}

	const definition = key.definition;
	const value = key.value;
	const interpolation = key.interpolation;
	const curve = key.curve;

	if (isNumberKeyDefinition(definition)) {

		return typeof value === 'number'
			&& Number.isFinite(value)
			&& (interpolation === undefined || isInterpolation(interpolation))
			&& (curve === undefined || curve === null || isCubicBezier(curve))
			&& (interpolation === 'bezier' ? isCubicBezier(curve) : curve === undefined || curve === null);
	}
	if (definition.kind === 'slot-attachment') {
		return (value === null || isEntityId(value))
			&& (value === null || project.attachments.some((attachment) => attachment.kind === 'image' && attachment.id === value && attachment.slotId === definition.targetId));
	}
	if (definition.kind === 'slot-draw-order') {
		return Array.isArray(value)
			&& value.every((slotId) => isEntityId(slotId))
			&& value.length === project.slots.length
			&& new Set(value).size === project.slots.length
			&& value.every((slotId) => project.slots.some((slot) => slot.id === slotId));
	}

	return typeof value === 'boolean';
};

const isTimelineClipboard = function isTimelineClipboard(
	value: unknown,
	project: Project
): value is TimelineClipboard {
	if (!isRecord(value)) {
		return false;
	}
	const earliestFrame = value.earliestFrame;

	return typeof earliestFrame === 'number'
		&& Number.isInteger(earliestFrame)
		&& earliestFrame >= 0
		&& Array.isArray(value.keys)
		&& value.keys.length > 0
		&& value.keys.every((key) => validClipboardKey(key, project));
};

export const planPasteTimelineClipboard = function planPasteTimelineClipboard(
	clip: Clip,
	clipboard: unknown,
	playheadFrame: number,
	idFactory: () => EntityId,
	project: Project
): TimelineEditResult<readonly import('../domain/commands.ts').ProjectCommand[]> {
	if (!project.clips.some((candidate) => candidate.id === clip.id)) {
		return { ok: false, error: 'Paste requires the active clip to belong to the project.' };
	}
	if (!Number.isFinite(clip.durationSeconds) || clip.durationSeconds <= 0 || !Number.isFinite(clip.fps) || clip.fps <= 0) {
		return { ok: false, error: 'Paste requires valid clip timing.' };
	}
	const hasClipboardKeys = isRecord(clipboard)
		&& Array.isArray(clipboard.keys)
		&& clipboard.keys.length > 0;

	if (!hasClipboardKeys) {
		return { ok: false, error: 'The key clipboard is empty.' };
	}
	if (!isTimelineClipboard(clipboard, project)) {
		return { ok: false, error: 'The key clipboard contains invalid typed data.' };
	}
	if (!Number.isFinite(playheadFrame)) {
		return { ok: false, error: 'The playhead frame is unavailable.' };
	}

	const frameCount = frameCountForClip(clip);

	if (frameCount === undefined) {
		return { ok: false, error: 'Paste requires valid clip timing.' };
	}

	const startFrame = Math.max(0, Math.floor(playheadFrame));
	const pasted = clipboard.keys.map((key) => ({ ...key, frameIndex: startFrame + key.frameOffset }));

	if (pasted.some((key) => key.frameIndex < 0 || key.frameIndex >= frameCount)) {
		return { ok: false, error: 'Paste would place a key outside the clip bounds.' };
	}

	const tracks = pasted.map((key) => clip.tracks.find((track) => definitionsMatch(trackDefinition(track), key.definition)));

	if (tracks.some((track) => !track)) {
		return { ok: false, error: 'Paste requires compatible tracks in the active clip.' };
	}

	const validTracks = tracks.flatMap((track) => track ? [track] : []);
	const targetPairs = pasted.map((key, index) => ({ key, track: validTracks[index] }));
	const duplicatePastedTimes = validTracks.some((track) => {
		const frames = targetPairs.filter((pair) => pair.track.id === track.id).map((pair) => pair.key.frameIndex);

		return new Set(frames).size !== frames.length;
	});
	const existingCollision = targetPairs.some(({ key, track }) => track.keys.some((candidate) => frameIndexForTime(clip, candidate.timeSeconds) === key.frameIndex));

	if (duplicatePastedTimes || existingCollision) {
		return { ok: false, error: 'Paste would collide with an existing key on the same track.' };
	}

	const existingIds = projectEntityIds(project);
	const allocatedIds = targetPairs.flatMap(() => {
		try {
			return [idFactory()];
		} catch {
			return [];
		}
	});

	if (allocatedIds.some((id) => !isEntityId(id))
		|| new Set(allocatedIds).size !== allocatedIds.length
		|| allocatedIds.some((id) => existingIds.includes(id))) {
		return { ok: false, error: 'Paste could not allocate unique key IDs.' };
	}

	const commands = targetPairs.flatMap(({ key, track }, index): readonly ProjectCommand[] => {
		const id = allocatedIds[index];

		if (!id) {
			return [];
		}
		const timeSeconds = key.frameIndex / clip.fps;

		if (isNumberKeyDefinition(key.definition)) {
			return [{
				kind: 'add-number-key' as const,
				id,
				clipId: clip.id,
				trackId: track.id,
				input: {
					timeSeconds,
					value: typeof key.value === 'number' ? key.value : 0,
					interpolation: key.interpolation,
					curve: key.curve
				}
			}];
		}
		if (key.definition.kind === 'slot-attachment' && track.kind === 'slot-attachment') {
			return [{ kind: 'add-attachment-key' as const, id, clipId: clip.id, trackId: track.id, input: { timeSeconds, value: key.value === null || typeof key.value === 'string' ? key.value : null } }];
		}
		if (key.definition.kind === 'slot-draw-order' && track.kind === 'slot-draw-order') {
			const value = Array.isArray(key.value)
				? key.value.filter((slotId: unknown): slotId is EntityId => isEntityId(slotId))
				: project.setupDrawOrder;

			return [{ kind: 'add-draw-order-key' as const, id, clipId: clip.id, trackId: track.id, input: { timeSeconds, value } }];
		}

		return [{
			kind: 'add-boolean-key' as const,
			id,
			clipId: clip.id,
			trackId: track.id,
			input: { timeSeconds, value: typeof key.value === 'boolean' ? key.value : false }
		}];
	});

	if (commands.length !== targetPairs.length) {
		return { ok: false, error: 'Paste could not allocate key commands.' };
	}

	return { ok: true, value: commands };
};

export const planNudgeKeys = function planNudgeKeys(
	clip: Clip,
	selectedKeys: readonly TimelineKeyReference[],
	deltaFrames: -1 | 1
): KeyDragResult {
	return planKeyDrag(clip, selectedKeys, deltaFrames, 1);
};

export const selectableEntityForTimelineRow = function selectableEntityForTimelineRow(
	project: Project,
	row: TimelineRow
): SelectableEntity | undefined {
	if (!row.entityId) {
		return undefined;
	}

	if (project.bones.some((bone) => bone.id === row.entityId)) {
		return { kind: 'bone', id: row.entityId };
	}
	if (project.slots.some((slot) => slot.id === row.entityId)) {
		return { kind: 'slot', id: row.entityId };
	}

	return project.attachments.some((attachment) => attachment.id === row.entityId)
		? { kind: 'attachment', id: row.entityId }
		: undefined;
};
