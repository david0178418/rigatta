import { DEFAULT_LOCAL_TRANSFORM, type LocalTransform } from './coordinates.ts';
import { createEntityId, isEntityId, type EntityId } from './ids.ts';
import { insertKeyByTime } from './interpolation.ts';
import type {
	Attachment,
	AttachmentOpacityTrack,
	AttachmentTransformTrack,
	BoneTransformProperty,
	BoneTransformTrack,
	Clip,
	CubicBezier,
	DiscreteKey,
	Interpolation,
	NumberKey,
	PointEnabledTrack,
	Project,
	RectangleEnabledTrack,
	RectangleSizeTrack,
	SlotAttachmentTrack,
	SlotDrawOrderTrack,
	Track
} from './model.ts';
import type { OperationResult } from './operations.ts';

export type CreateClipInput = Readonly<{
	name: string;
	durationSeconds?: number;
	fps?: number;
	loop?: boolean;
}>;

export type DuplicateClipIds = Readonly<{
	id: EntityId;
	trackIds: readonly EntityId[];
	keyIds: readonly (readonly EntityId[])[];
	eventIds: readonly EntityId[];
}>;

export type TrackDefinition =
	| Readonly<{
			kind: 'bone-transform';
			targetId: EntityId;
			property: BoneTransformProperty;
		}>
	| Readonly<{
			kind: 'attachment-transform';
			targetId: EntityId;
			property: BoneTransformProperty;
		}>
	| Readonly<{
			kind: 'attachment-opacity';
			targetId: EntityId;
		}>
	| Readonly<{
			kind: 'slot-attachment';
			targetId: EntityId;
		}>
	| Readonly<{
			kind: 'slot-draw-order';
		}>
	| Readonly<{
			kind: 'point-enabled';
			targetId: EntityId;
		}>
	| Readonly<{
			kind: 'rectangle-size';
			targetId: EntityId;
			property: 'width' | 'height';
		}>
	| Readonly<{
			kind: 'rectangle-enabled';
			targetId: EntityId;
		}>;

export type NumberKeyInput = Readonly<{
	timeSeconds: number;
	value: number;
	interpolation?: Interpolation;
	curve?: CubicBezier | null;
}>;

export type AttachmentKeyInput = Readonly<{
	timeSeconds: number;
	value: EntityId | null;
}>;

export type DrawOrderKeyInput = Readonly<{
	timeSeconds: number;
	value: readonly EntityId[];
}>;

export type BooleanKeyInput = Readonly<{
	timeSeconds: number;
	value: boolean;
}>;

const success = function success<TValue>(value: TValue): OperationResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(
	code: 'not-found' | 'invalid-name' | 'invalid-value' | 'invalid-reference' | 'duplicate-id' | 'invalid-id',
	message: string
): OperationResult<never> {
	return { ok: false, error: { code, message } };
};

const normalizedName = function normalizedName(name: string): string | undefined {
	const value = name.trim();

	return value.length > 0 ? value : undefined;
};

const findClip = function findClip(project: Project, clipId: EntityId): Clip | undefined {
	return project.clips.find((clip) => clip.id === clipId);
};

const findAttachment = function findAttachment(
	project: Project,
	attachmentId: EntityId
): Attachment | undefined {
	return project.attachments.find((attachment) => attachment.id === attachmentId);
};

const allEntityIds = function allEntityIds(project: Project): readonly EntityId[] {
	return [
		project.id,
		...project.assets.map((asset) => asset.id),
		...project.bones.map((bone) => bone.id),
		...project.slots.map((slot) => slot.id),
		...project.attachments.map((attachment) => attachment.id),
		...project.clips.map((clip) => clip.id),
		...project.clips.flatMap((clip) => [
			...clip.tracks.map((track) => track.id),
			...clip.tracks.flatMap((track) => track.keys.map((key) => key.id)),
			...clip.events.map((event) => event.id)
		])
	];
};

const allocateId = function allocateId(
	project: Project,
	idFactory: () => EntityId
): OperationResult<EntityId> {
	const id = idFactory();

	if (!isEntityId(id)) {
		return failure('invalid-id', 'Entity ID factories must return UUID v4 IDs.');
	}
	if (allEntityIds(project).includes(id)) {
		return failure('duplicate-id', 'Generated entity ID is already in use.');
	}

	return success(id);
};

const updateClip = function updateClip(
	project: Project,
	clipId: EntityId,
	update: (clip: Clip) => Clip
): OperationResult<Project> {
	if (!findClip(project, clipId)) {
		return failure('not-found', 'Animation clip does not exist.');
	}

	return success({
		...project,
		clips: project.clips.map((clip) => clip.id === clipId ? update(clip) : clip)
	});
};

const updateTrack = function updateTrack(
	project: Project,
	clipId: EntityId,
	trackId: EntityId,
	update: (track: Track) => Track
): OperationResult<Project> {
	const clip = findClip(project, clipId);

	if (!clip) {
		return failure('not-found', 'Animation clip does not exist.');
	}
	if (!clip.tracks.some((track) => track.id === trackId)) {
		return failure('not-found', 'Animation track does not exist.');
	}

	return updateClip(project, clipId, (currentClip) => ({
		...currentClip,
		tracks: currentClip.tracks.map((track) => track.id === trackId ? update(track) : track)
	}));
};

const isTargetDefinition = function isTargetDefinition(
	track: Track,
	definition: TrackDefinition
): boolean {
	if (track.kind !== definition.kind) {
		return false;
	}
	if (track.kind === 'slot-draw-order') {
		return true;
	}
	if (!('targetId' in definition) || track.targetId !== definition.targetId) {
		return false;
	}

	return !('property' in definition) || !('property' in track) || track.property === definition.property;
};

const definitionTargetExists = function definitionTargetExists(
	project: Project,
	definition: TrackDefinition
): boolean {
	if (definition.kind === 'slot-draw-order') {
		return project.slots.length > 0;
	}
	if (definition.kind === 'bone-transform') {
		return project.bones.some((bone) => bone.id === definition.targetId);
	}
	if (definition.kind === 'slot-attachment') {
		return project.slots.some((slot) => slot.id === definition.targetId);
	}
	if (definition.kind === 'point-enabled') {
		return project.attachments.some((attachment) => attachment.id === definition.targetId && attachment.kind === 'point');
	}
	if (definition.kind === 'rectangle-size' || definition.kind === 'rectangle-enabled') {
		return project.attachments.some((attachment) => attachment.id === definition.targetId && attachment.kind === 'rectangle');
	}

	return project.attachments.some((attachment) => attachment.id === definition.targetId);
};

const createTrackFromDefinition = function createTrackFromDefinition(
	id: EntityId,
	definition: TrackDefinition
): Track {
	if (definition.kind === 'bone-transform') {
		const track: BoneTransformTrack = { ...definition, id, keys: [] };
		return track;
	}
	if (definition.kind === 'attachment-transform') {
		const track: AttachmentTransformTrack = { ...definition, id, keys: [] };
		return track;
	}
	if (definition.kind === 'attachment-opacity') {
		const track: AttachmentOpacityTrack = { ...definition, id, keys: [] };
		return track;
	}
	if (definition.kind === 'slot-attachment') {
		const track: SlotAttachmentTrack = { ...definition, id, keys: [] };
		return track;
	}
	if (definition.kind === 'slot-draw-order') {
		const track: SlotDrawOrderTrack = { kind: definition.kind, id, keys: [] };
		return track;
	}
	if (definition.kind === 'point-enabled') {
		const track: PointEnabledTrack = { ...definition, id, keys: [] };
		return track;
	}
	if (definition.kind === 'rectangle-size') {
		const track: RectangleSizeTrack = { ...definition, id, keys: [] };
		return track;
	}

	const track: RectangleEnabledTrack = { ...definition, id, keys: [] };
	return track;
};

const isNumberTrack = function isNumberTrack(
	track: Track
): track is BoneTransformTrack | AttachmentTransformTrack | AttachmentOpacityTrack | RectangleSizeTrack {
	return track.kind === 'bone-transform'
		|| track.kind === 'attachment-transform'
		|| track.kind === 'attachment-opacity'
		|| track.kind === 'rectangle-size';
};

const removeKeyFromTrack = function removeKeyFromTrack(
	track: Track,
	keyId: EntityId
): Track {
	if (isNumberTrack(track)) {
		return { ...track, keys: track.keys.filter((key) => key.id !== keyId) };
	}
	if (track.kind === 'slot-attachment') {
		return { ...track, keys: track.keys.filter((key) => key.id !== keyId) };
	}
	if (track.kind === 'slot-draw-order') {
		return { ...track, keys: track.keys.filter((key) => key.id !== keyId) };
	}
	if (track.kind === 'point-enabled') {
		return { ...track, keys: track.keys.filter((key) => key.id !== keyId) };
	}

	return { ...track, keys: track.keys.filter((key) => key.id !== keyId) };
};

const isFiniteCurve = function isFiniteCurve(curve: CubicBezier): boolean {
	return [curve.x1, curve.y1, curve.x2, curve.y2].every(Number.isFinite)
		&& curve.x1 >= 0
		&& curve.x1 <= 1
		&& curve.x2 >= 0
		&& curve.x2 <= 1;
};

const isValidKeyTime = function isValidKeyTime(clip: Clip, timeSeconds: number): boolean {
	return Number.isFinite(timeSeconds) && timeSeconds >= 0 && timeSeconds <= clip.durationSeconds;
};

const createNumberKey = function createNumberKey(
	id: EntityId,
	input: NumberKeyInput
): OperationResult<NumberKey> {
	const interpolation = input.interpolation ?? 'linear';
	const curve = input.curve ?? null;

	if (!Number.isFinite(input.value)) {
		return failure('invalid-value', 'Numeric key values must be finite.');
	}
	if (interpolation === 'bezier' && (!curve || !isFiniteCurve(curve))) {
		return failure('invalid-value', 'Bezier keys require finite control points with normalized X values.');
	}
	if (interpolation !== 'bezier' && curve !== null) {
		return failure('invalid-value', 'Only Bezier keys may contain curve metadata.');
	}

	return success({ id, timeSeconds: input.timeSeconds, value: input.value, interpolation, curve });
};

export const createClip = function createClip(
	project: Project,
	input: CreateClipInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const name = normalizedName(input.name);
	const durationSeconds = input.durationSeconds ?? 1;
	const fps = input.fps ?? 12;

	if (!name) {
		return failure('invalid-name', 'Clip names must contain at least one non-whitespace character.');
	}
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(fps) || fps <= 0) {
		return failure('invalid-value', 'Clip duration and FPS must be positive finite numbers.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const clip: Clip = {
		id: id.value,
		name: name,
		durationSeconds,
		fps,
		loop: input.loop ?? true,
		tracks: [],
		events: []
	};

	return success({ ...project, clips: [...project.clips, clip] });
};

export const renameClip = function renameClip(
	project: Project,
	clipId: EntityId,
	name: string
): OperationResult<Project> {
	const normalized = normalizedName(name);

	if (!normalized) {
		return failure('invalid-name', 'Clip names must contain at least one non-whitespace character.');
	}

	return updateClip(project, clipId, (clip) => ({ ...clip, name: normalized }));
};

export const deleteClip = function deleteClip(
	project: Project,
	clipId: EntityId
): OperationResult<Project> {
	if (!findClip(project, clipId)) {
		return failure('not-found', 'Animation clip does not exist.');
	}

	return success({ ...project, clips: project.clips.filter((clip) => clip.id !== clipId) });
};

type KeyWithId = Readonly<{ id: EntityId }>;

const cloneKeys = function cloneKeys<TKey extends KeyWithId>(
	keys: readonly TKey[],
	ids: readonly EntityId[]
): readonly TKey[] {
	return keys.map((key, index) => {
		const id = ids[index];

		return id ? { ...key, id } : key;
	});
};

const cloneTrack = function cloneTrack(
	track: Track,
	trackId: EntityId,
	keyIds: readonly EntityId[]
): Track {
	if (track.kind === 'bone-transform') {
		return { ...track, id: trackId, keys: cloneKeys(track.keys, keyIds) };
	}
	if (track.kind === 'attachment-transform') {
		return { ...track, id: trackId, keys: cloneKeys(track.keys, keyIds) };
	}
	if (track.kind === 'attachment-opacity') {
		return { ...track, id: trackId, keys: cloneKeys(track.keys, keyIds) };
	}
	if (track.kind === 'slot-attachment') {
		return { ...track, id: trackId, keys: cloneKeys(track.keys, keyIds) };
	}
	if (track.kind === 'slot-draw-order') {
		return { ...track, id: trackId, keys: cloneKeys(track.keys, keyIds) };
	}
	if (track.kind === 'point-enabled') {
		return { ...track, id: trackId, keys: cloneKeys(track.keys, keyIds) };
	}
	if (track.kind === 'rectangle-size') {
		return { ...track, id: trackId, keys: cloneKeys(track.keys, keyIds) };
	}

	return { ...track, id: trackId, keys: cloneKeys(track.keys, keyIds) };
};

export const duplicateClip = function duplicateClip(
	project: Project,
	clipId: EntityId,
	ids: DuplicateClipIds
): OperationResult<Project> {
	const clip = findClip(project, clipId);
	const existingIds = allEntityIds(project);
	const newIds = [
		ids.id,
		...ids.trackIds,
		...ids.keyIds.flat(),
		...ids.eventIds
	];

	if (!clip) {
		return failure('not-found', 'Animation clip does not exist.');
	}
	if (ids.trackIds.length !== clip.tracks.length
		|| ids.keyIds.length !== clip.tracks.length
		|| ids.eventIds.length !== clip.events.length
		|| ids.keyIds.some((keyIds, index) => keyIds.length !== (clip.tracks[index]?.keys.length ?? -1))) {
		return failure('invalid-value', 'Clip duplication IDs do not match the source clip.');
	}
	if (newIds.some((id) => !isEntityId(id)) || new Set(newIds).size !== newIds.length || newIds.some((id) => existingIds.includes(id))) {
		return failure('invalid-id', 'Clip duplication IDs must be unique unused UUID v4 IDs.');
	}

	const tracks = clip.tracks.map((track, trackIndex) => {
		const trackId = ids.trackIds[trackIndex];
		const keyIds = ids.keyIds[trackIndex];

		return trackId && keyIds ? cloneTrack(track, trackId, keyIds) : track;
	});
	const events = clip.events.map((event, index) => {
		const eventId = ids.eventIds[index];

		return eventId ? { ...event, id: eventId } : event;
	});
	const duplicate: Clip = {
		...clip,
		id: ids.id,
		name: `${clip.name} copy`,
		tracks,
		events
	};

	return success({ ...project, clips: [...project.clips, duplicate] });
};

export const createTrack = function createTrack(
	project: Project,
	clipId: EntityId,
	definition: TrackDefinition,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const clip = findClip(project, clipId);

	if (!clip) {
		return failure('not-found', 'Animation clip does not exist.');
	}
	if (!definitionTargetExists(project, definition)) {
		return failure('invalid-reference', 'Animation track target does not exist or has the wrong type.');
	}
	if (clip.tracks.some((track) => isTargetDefinition(track, definition))) {
		return failure('invalid-value', 'A clip may contain only one track for a target property.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	return updateClip(project, clipId, (currentClip) => ({
		...currentClip,
		tracks: [...currentClip.tracks, createTrackFromDefinition(id.value, definition)]
	}));
};

export const deleteTrack = function deleteTrack(
	project: Project,
	clipId: EntityId,
	trackId: EntityId
): OperationResult<Project> {
	const clip = findClip(project, clipId);

	if (!clip || !clip.tracks.some((track) => track.id === trackId)) {
		return failure('not-found', 'Animation track does not exist.');
	}

	return updateClip(project, clipId, (currentClip) => ({
		...currentClip,
		tracks: currentClip.tracks.filter((track) => track.id !== trackId)
	}));
};

export const addNumberKey = function addNumberKey(
	project: Project,
	clipId: EntityId,
	trackId: EntityId,
	input: NumberKeyInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const clip = findClip(project, clipId);
	const track = clip?.tracks.find((candidate) => candidate.id === trackId);

	if (!clip || !track) {
		return failure('not-found', 'Animation track does not exist.');
	}
	if (!isNumberTrack(track)) {
		return failure('invalid-value', 'This track does not accept numeric keys.');
	}
	if (track.kind === 'attachment-opacity' && (input.value < 0 || input.value > 1)) {
		return failure('invalid-value', 'Opacity keys must be within [0, 1].');
	}
	if (track.kind === 'rectangle-size' && input.value <= 0) {
		return failure('invalid-value', 'Rectangle size keys must be positive.');
	}
	if (!isValidKeyTime(clip, input.timeSeconds)) {
		return failure('invalid-value', 'Key time must be inside the clip duration.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const key = createNumberKey(id.value, input);

	if (!key.ok) {
		return key;
	}

	const keys = insertKeyByTime(track.keys, key.value);

	if (!keys) {
		return failure('invalid-value', 'A track may contain only one key at a given time.');
	}

	return updateTrack(project, clipId, trackId, (currentTrack) => (
		isNumberTrack(currentTrack) ? { ...currentTrack, keys } : currentTrack
	));
};

export const addAttachmentKey = function addAttachmentKey(
	project: Project,
	clipId: EntityId,
	trackId: EntityId,
	input: AttachmentKeyInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const clip = findClip(project, clipId);
	const track = clip?.tracks.find((candidate) => candidate.id === trackId);

	if (!clip || !track) {
		return failure('not-found', 'Animation track does not exist.');
	}
	if (track.kind !== 'slot-attachment') {
		return failure('invalid-value', 'This track does not accept attachment keys.');
	}
	if (!isValidKeyTime(clip, input.timeSeconds)) {
		return failure('invalid-value', 'Key time must be inside the clip duration.');
	}
	if (input.value !== null) {
		const attachment = findAttachment(project, input.value);
		const slot = project.slots.find((candidate) => candidate.id === track.targetId);
		if (!attachment || attachment.kind !== 'image' || !slot || attachment.slotId !== slot.id) {
			return failure('invalid-reference', 'Attachment key must reference an image in the tracked slot.');
		}
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const key: DiscreteKey<EntityId | null> = { id: id.value, ...input };
	const keys = insertKeyByTime(track.keys, key);

	if (!keys) {
		return failure('invalid-value', 'A track may contain only one key at a given time.');
	}

	return updateTrack(project, clipId, trackId, (currentTrack) => currentTrack.kind === 'slot-attachment'
		? { ...currentTrack, keys }
		: currentTrack);
};

export const addDrawOrderKey = function addDrawOrderKey(
	project: Project,
	clipId: EntityId,
	trackId: EntityId,
	input: DrawOrderKeyInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const clip = findClip(project, clipId);
	const track = clip?.tracks.find((candidate) => candidate.id === trackId);
	const slotIds = project.slots.map((slot) => slot.id);
	const validOrder = input.value.length === slotIds.length
		&& new Set(input.value).size === slotIds.length
		&& input.value.every((slotId) => slotIds.includes(slotId));

	if (!clip || !track) {
		return failure('not-found', 'Animation track does not exist.');
	}
	if (track.kind !== 'slot-draw-order') {
		return failure('invalid-value', 'This track does not accept draw-order keys.');
	}
	if (!isValidKeyTime(clip, input.timeSeconds) || !validOrder) {
		return failure('invalid-value', 'Draw-order keys need a complete slot order inside the clip duration.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const key: DiscreteKey<readonly EntityId[]> = { id: id.value, ...input, value: [...input.value] };
	const keys = insertKeyByTime(track.keys, key);

	if (!keys) {
		return failure('invalid-value', 'A track may contain only one key at a given time.');
	}

	return updateTrack(project, clipId, trackId, (currentTrack) => currentTrack.kind === 'slot-draw-order'
		? { ...currentTrack, keys }
		: currentTrack);
};

export const addBooleanKey = function addBooleanKey(
	project: Project,
	clipId: EntityId,
	trackId: EntityId,
	input: BooleanKeyInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const clip = findClip(project, clipId);
	const track = clip?.tracks.find((candidate) => candidate.id === trackId);

	if (!clip || !track) {
		return failure('not-found', 'Animation track does not exist.');
	}
	if (track.kind !== 'point-enabled' && track.kind !== 'rectangle-enabled') {
		return failure('invalid-value', 'This track does not accept boolean keys.');
	}
	if (!isValidKeyTime(clip, input.timeSeconds)) {
		return failure('invalid-value', 'Key time must be inside the clip duration.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const key: DiscreteKey<boolean> = { id: id.value, ...input };
	const keys = insertKeyByTime(track.keys, key);

	if (!keys) {
		return failure('invalid-value', 'A track may contain only one key at a given time.');
	}

	return updateTrack(project, clipId, trackId, (currentTrack) => (
		(currentTrack.kind === 'point-enabled' || currentTrack.kind === 'rectangle-enabled')
			? { ...currentTrack, keys }
			: currentTrack
	));
};

export const deleteKey = function deleteKey(
	project: Project,
	clipId: EntityId,
	trackId: EntityId,
	keyId: EntityId
): OperationResult<Project> {
	const clip = findClip(project, clipId);
	const track = clip?.tracks.find((candidate) => candidate.id === trackId);

	if (!clip || !track || !track.keys.some((key) => key.id === keyId)) {
		return failure('not-found', 'Animation key does not exist.');
	}

	return updateTrack(project, clipId, trackId, (currentTrack) => removeKeyFromTrack(currentTrack, keyId));
};

export const updateClipPlayback = function updateClipPlayback(
	project: Project,
	clipId: EntityId,
	settings: Readonly<Partial<Pick<Clip, 'durationSeconds' | 'fps' | 'loop'>>>
): OperationResult<Project> {
	const clip = findClip(project, clipId);

	if (!clip) {
		return failure('not-found', 'Animation clip does not exist.');
	}
	const durationSeconds = settings.durationSeconds ?? clip.durationSeconds;
	const fps = settings.fps ?? clip.fps;

	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(fps) || fps <= 0) {
		return failure('invalid-value', 'Clip duration and FPS must be positive finite numbers.');
	}
	if (clip.tracks.some((track) => track.keys.some((key) => key.timeSeconds > durationSeconds))) {
		return failure('invalid-value', 'Clip duration cannot move before an existing key.');
	}

	return updateClip(project, clipId, (currentClip) => ({
		...currentClip,
		durationSeconds,
		fps,
		loop: settings.loop ?? currentClip.loop
	}));
};

export const ensureDefaultTransform = function ensureDefaultTransform(
	transform: LocalTransform | undefined
): LocalTransform {
	return transform ?? DEFAULT_LOCAL_TRANSFORM;
};
