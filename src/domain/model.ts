import type { LocalTransform } from './coordinates.ts';
import { createEntityId, type EntityId } from './ids.ts';
import { PROJECT_SCHEMA_VERSION, type SupportedImageMimeType } from './schema.ts';

export type CanvasSize = Readonly<{
	width: number;
	height: number;
}>;

export type ImageAsset = Readonly<{
	id: EntityId;
	name: string;
	relativePath: string;
	mimeType: SupportedImageMimeType;
	width: number;
	height: number;
}>;

export type Bone = Readonly<{
	id: EntityId;
	name: string;
	parentId: EntityId | null;
	transform: LocalTransform;
}>;

export type Slot = Readonly<{
	id: EntityId;
	name: string;
	boneId: EntityId;
	setupAttachmentId: EntityId | null;
}>;

export type ImageAttachment = Readonly<{
	id: EntityId;
	kind: 'image';
	name: string;
	slotId: EntityId;
	assetId: EntityId;
	transform: LocalTransform;
	opacity: number;
	pivotX: number;
	pivotY: number;
}>;

export type PointAttachment = Readonly<{
	id: EntityId;
	kind: 'point';
	name: string;
	boneId: EntityId;
	transform: LocalTransform;
	enabled: boolean;
}>;

export type RectangleAttachment = Readonly<{
	id: EntityId;
	kind: 'rectangle';
	name: string;
	boneId: EntityId;
	transform: LocalTransform;
	width: number;
	height: number;
	enabled: boolean;
}>;

export type Attachment = ImageAttachment | PointAttachment | RectangleAttachment;

export type CubicBezier = Readonly<{
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}>;

export type Interpolation = 'stepped' | 'linear' | 'bezier';

export type NumberKey = Readonly<{
	id: EntityId;
	timeSeconds: number;
	value: number;
	interpolation: Interpolation;
	curve: CubicBezier | null;
}>;

export type DiscreteKey<TValue> = Readonly<{
	id: EntityId;
	timeSeconds: number;
	value: TValue;
}>;

export type BoneTransformProperty =
	| 'x'
	| 'y'
	| 'rotation'
	| 'scaleX'
	| 'scaleY'
	| 'shearX'
	| 'shearY';

export type AttachmentTransformProperty = BoneTransformProperty;

export type Track =
	| Readonly<{
			id: EntityId;
			kind: 'bone-transform';
			targetId: EntityId;
			property: BoneTransformProperty;
			keys: readonly NumberKey[];
		}>
	| Readonly<{
			id: EntityId;
			kind: 'attachment-transform';
			targetId: EntityId;
			property: AttachmentTransformProperty;
			keys: readonly NumberKey[];
		}>
	| Readonly<{
			id: EntityId;
			kind: 'attachment-opacity';
			targetId: EntityId;
			keys: readonly NumberKey[];
		}>
	| Readonly<{
			id: EntityId;
			kind: 'slot-attachment';
			targetId: EntityId;
			keys: readonly DiscreteKey<EntityId | null>[];
		}>
	| Readonly<{
			id: EntityId;
			kind: 'slot-draw-order';
			keys: readonly DiscreteKey<readonly EntityId[]>[];
		}>
	| Readonly<{
			id: EntityId;
			kind: 'point-enabled';
			targetId: EntityId;
			keys: readonly DiscreteKey<boolean>[];
		}>
	| Readonly<{
			id: EntityId;
			kind: 'rectangle-size';
			targetId: EntityId;
			property: 'width' | 'height';
			keys: readonly NumberKey[];
		}>
	| Readonly<{
			id: EntityId;
			kind: 'rectangle-enabled';
			targetId: EntityId;
			keys: readonly DiscreteKey<boolean>[];
		}>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
	| JsonPrimitive
	| readonly JsonValue[]
 	| JsonObject;

export interface JsonObject {
	readonly [key: string]: JsonValue;
}

export type EventKey = Readonly<{
	id: EntityId;
	timeSeconds: number;
	name: string;
	payload: Readonly<Record<string, JsonValue>>;
}>;

export type Clip = Readonly<{
	id: EntityId;
	name: string;
	durationSeconds: number;
	fps: number;
	loop: boolean;
	tracks: readonly Track[];
	events: readonly EventKey[];
}>;

export type ExportSettings = Readonly<{
	mode: 'grid' | 'packed';
	maxTextureSize: number;
	padding: number;
	extrudeEdges: boolean;
}>;

export type Project = Readonly<{
	schemaVersion: typeof PROJECT_SCHEMA_VERSION;
	id: EntityId;
	name: string;
	logicalCanvas: CanvasSize;
	assets: readonly ImageAsset[];
	bones: readonly Bone[];
	slots: readonly Slot[];
	attachments: readonly Attachment[];
	setupDrawOrder: readonly EntityId[];
	clips: readonly Clip[];
	exportSettings: ExportSettings;
}>;

export type ProjectSeed = Readonly<{
	id?: EntityId;
	name?: string;
	logicalCanvas?: CanvasSize;
}>;

export const DEFAULT_CANVAS_SIZE = {
	width: 1024,
	height: 1024
} as const satisfies CanvasSize;

export const DEFAULT_EXPORT_SETTINGS = {
	mode: 'grid',
	maxTextureSize: 4096,
	padding: 1,
	extrudeEdges: false
} as const satisfies ExportSettings;

export const createEmptyProject = function createEmptyProject(
	seed: ProjectSeed = {},
	idFactory: () => EntityId = createEntityId
): Project {
	return {
		schemaVersion: PROJECT_SCHEMA_VERSION,
		id: seed.id ?? idFactory(),
		name: seed.name ?? 'Untitled project',
		logicalCanvas: seed.logicalCanvas ?? DEFAULT_CANVAS_SIZE,
		assets: [],
		bones: [],
		slots: [],
		attachments: [],
		setupDrawOrder: [],
		clips: [],
		exportSettings: DEFAULT_EXPORT_SETTINGS
	};
};
