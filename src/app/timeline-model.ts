import { isEntityId, type EntityId } from '../domain/ids.ts';
import type { TrackDefinition } from '../domain/animation.ts';
import type { Clip, DiscreteKey, NumberKey, Project, Track } from '../domain/model.ts';
import type { SelectableEntity, Selection } from './selection.ts';
import { trackLabel } from './timeline.ts';

export type TimelineRowKind = 'overview' | 'entity' | 'property' | 'draw-order' | 'events';
export type TimelineRowMode = 'selection' | 'all-keyed';

export type TimelineKeyMarker = Readonly<{
	id: EntityId;
	frameIndex: number;
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

export type TimelineModelOptions = Readonly<{
	mode?: TimelineRowMode;
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

const isSelectedId = function isSelectedId(
	selection: Selection | undefined,
	entityId: EntityId
): boolean {
	return selection?.some((entity) => entity.id === entityId) ?? false;
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

const trackEntityId = function trackEntityId(track: Track): EntityId | undefined {
	return 'targetId' in track ? track.targetId : undefined;
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

const markersForTrack = function markersForTrack(
	clip: Clip,
	track: Track
): readonly TimelineKeyMarker[] {
	return track.keys
		.map((key) => ({ id: key.id, frameIndex: frameIndexForTime(clip, key.timeSeconds) }))
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
	track: Track,
	mode: TimelineRowMode,
	selection: Selection | undefined,
	pinnedEntityIds: ReadonlySet<EntityId>,
	selectedTrackIds: ReadonlySet<EntityId>,
	selectedEntityIds: ReadonlySet<EntityId>
): boolean {
	if (mode === 'all-keyed') {
		return track.keys.length > 0;
	}

	const targetId = trackEntityId(track);

	return targetId === undefined || isSelectedId(selection, targetId) || pinnedEntityIds.has(targetId) || selectedTrackIds.has(track.id) || targetId !== undefined && selectedEntityIds.has(targetId);
};

const groupTrackRows = function groupTrackRows(
	project: Project,
	clip: Clip,
	options: TimelineModelOptions
): readonly TimelineRow[] {
	const mode = options.mode ?? 'selection';
	const selection = options.selection ?? [];
	const pinnedEntityIds = options.pinnedEntityIds ?? new Set<EntityId>();
	const selectedTrackIds = options.selectedTrackIds ?? new Set<EntityId>();
	const selectedEntityIds = options.selectedEntityIds ?? new Set<EntityId>();
	const expandedIds = options.expandedIds ?? new Set<string>();
	const query = options.filter ?? '';
	const tracks = clip.tracks.filter((track) => trackIsVisible(track, mode, selection, pinnedEntityIds, selectedTrackIds, selectedEntityIds));
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
			selected: isSelectedId(selection, entityId)
				|| selectedEntityIds.has(entityId)
				|| entityTracks.some((track) => selectedTrackIds.has(track.id)),
			keyed: entityTracks.some((track) => track.keys.length > 0),
			keys: keysForTracks(clip, entityTracks)
		};
		const matchingTracks = entityTracks.filter((track) => rowMatchesFilter({
			id: track.id,
			kind: 'property',
			depth: 1,
			label: trackLabel(project, track),
			trackId: track.id,
			expandable: false,
			expanded: false,
			selected: false,
			keyed: track.keys.length > 0,
			keys: markersForTrack(clip, track)
		}, query));
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
	options: TimelineModelOptions
): readonly TimelineRow[] {
	const query = options.filter ?? '';
	const drawOrderTracks = clip.tracks.filter((track) => track.kind === 'slot-draw-order');
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
			.map((event) => ({ id: event.id, frameIndex: frameIndexForTime(clip, event.timeSeconds) }))
			.toSorted((left, right) => left.frameIndex - right.frameIndex || left.id.localeCompare(right.id))
	};

	return [
		...(drawOrder && rowMatchesFilter(drawOrder, query) ? [drawOrder] : []),
		...(rowMatchesFilter(events, query) ? [events] : [])
	];
};

export const buildGroupedTimelineRows = function buildGroupedTimelineRows(
	project: Project,
	clip: Clip,
	options: TimelineModelOptions = {}
): readonly TimelineRow[] {
	const visibleTracks = clip.tracks.filter((track) => trackIsVisible(
		track,
		options.mode ?? 'selection',
		options.selection,
		options.pinnedEntityIds ?? new Set<EntityId>(),
		options.selectedTrackIds ?? new Set<EntityId>(),
		options.selectedEntityIds ?? new Set<EntityId>()
	));
	const overview: TimelineRow = {
		id: 'overview',
		kind: 'overview',
		depth: 0,
		label: clip.name,
		subLabel: `${visibleTracks.length} track${visibleTracks.length === 1 ? '' : 's'}`,
		expandable: false,
		expanded: false,
		selected: false,
		keyed: visibleTracks.some((track) => track.keys.length > 0),
		keys: keysForTracks(clip, visibleTracks)
	};

	return [overview, ...groupTrackRows(project, clip, options), ...dedicatedRows(clip, options)];
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

export const planPasteTimelineClipboard = function planPasteTimelineClipboard(
	clip: Clip,
	clipboard: TimelineClipboard,
	playheadFrame: number,
	idFactory: () => EntityId,
	project: Project
): TimelineEditResult<readonly import('../domain/commands.ts').ProjectCommand[]> {
	if (clipboard.keys.length === 0) {
		return { ok: false, error: 'The key clipboard is empty.' };
	}

	const frameCount = Math.max(1, Math.ceil(clip.durationSeconds * clip.fps));
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

	const commands = targetPairs.map(({ key, track }) => {
		const id = idFactory();
		const timeSeconds = key.frameIndex / clip.fps;

		if (isNumberKeyDefinition(key.definition)) {
			return {
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
			};
		}
		if (key.definition.kind === 'slot-attachment' && track.kind === 'slot-attachment') {
			return { kind: 'add-attachment-key' as const, id, clipId: clip.id, trackId: track.id, input: { timeSeconds, value: key.value === null || typeof key.value === 'string' ? key.value : null } };
		}
		if (key.definition.kind === 'slot-draw-order' && track.kind === 'slot-draw-order') {
			const value = Array.isArray(key.value) && key.value.every((slotId) => isEntityId(slotId))
				? key.value
				: project.setupDrawOrder;

			return { kind: 'add-draw-order-key' as const, id, clipId: clip.id, trackId: track.id, input: { timeSeconds, value } };
		}

		return {
			kind: 'add-boolean-key' as const,
			id,
			clipId: clip.id,
			trackId: track.id,
			input: { timeSeconds, value: typeof key.value === 'boolean' ? key.value : false }
		};
	});

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
