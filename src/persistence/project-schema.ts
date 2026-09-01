import * as v from 'valibot';
import { ENTITY_ID_PATTERN } from '../domain/ids.ts';
import type { JsonValue, Project } from '../domain/model.ts';
import { validateProject, type ValidationDiagnostic } from '../domain/validation.ts';

const entityIdSchema = v.pipe(v.string(), v.regex(ENTITY_ID_PATTERN));
const finiteNumberSchema = v.pipe(v.number(), v.finite());
const localTransformSchema = v.object({
	x: finiteNumberSchema,
	y: finiteNumberSchema,
	rotation: finiteNumberSchema,
	scaleX: finiteNumberSchema,
	scaleY: finiteNumberSchema,
	shearX: finiteNumberSchema,
	shearY: finiteNumberSchema
});
const cubicBezierSchema = v.object({
	x1: finiteNumberSchema,
	y1: finiteNumberSchema,
	x2: finiteNumberSchema,
	y2: finiteNumberSchema
});

const jsonValueSchema: v.GenericSchema<JsonValue> = v.lazy(() => v.union([
	v.string(),
	v.number(),
	v.boolean(),
	v.null_(),
	v.array(jsonValueSchema),
	v.record(v.string(), jsonValueSchema)
]));

const numberKeySchema = v.object({
	id: entityIdSchema,
	timeSeconds: finiteNumberSchema,
	value: finiteNumberSchema,
	interpolation: v.picklist(['stepped', 'linear', 'bezier']),
	curve: v.nullable(cubicBezierSchema)
});
const attachmentKeySchema = v.object({
	id: entityIdSchema,
	timeSeconds: finiteNumberSchema,
	value: v.nullable(entityIdSchema)
});
const drawOrderKeySchema = v.object({
	id: entityIdSchema,
	timeSeconds: finiteNumberSchema,
	value: v.array(entityIdSchema)
});
const booleanKeySchema = v.object({
	id: entityIdSchema,
	timeSeconds: finiteNumberSchema,
	value: v.boolean()
});

const imageAssetSchema = v.object({
	id: entityIdSchema,
	name: v.string(),
	relativePath: v.string(),
	mimeType: v.picklist(['image/png', 'image/jpeg', 'image/webp']),
	width: finiteNumberSchema,
	height: finiteNumberSchema
});
const boneSchema = v.object({
	id: entityIdSchema,
	name: v.string(),
	parentId: v.nullable(entityIdSchema),
	transform: localTransformSchema
});
const slotSchema = v.object({
	id: entityIdSchema,
	name: v.string(),
	boneId: entityIdSchema,
	setupAttachmentId: v.nullable(entityIdSchema)
});
const imageAttachmentSchema = v.object({
	id: entityIdSchema,
	kind: v.literal('image'),
	name: v.string(),
	slotId: entityIdSchema,
	assetId: entityIdSchema,
	transform: localTransformSchema,
	opacity: finiteNumberSchema,
	pivotX: finiteNumberSchema,
	pivotY: finiteNumberSchema
});
const pointAttachmentSchema = v.object({
	id: entityIdSchema,
	kind: v.literal('point'),
	name: v.string(),
	boneId: entityIdSchema,
	transform: localTransformSchema,
	enabled: v.boolean()
});
const rectangleAttachmentSchema = v.object({
	id: entityIdSchema,
	kind: v.literal('rectangle'),
	name: v.string(),
	boneId: entityIdSchema,
	transform: localTransformSchema,
	width: finiteNumberSchema,
	height: finiteNumberSchema,
	enabled: v.boolean()
});
const attachmentSchema = v.variant('kind', [
	imageAttachmentSchema,
	pointAttachmentSchema,
	rectangleAttachmentSchema
]);

const trackSchema = v.variant('kind', [
	v.object({
		id: entityIdSchema,
		kind: v.literal('bone-transform'),
		targetId: entityIdSchema,
		property: v.picklist(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY']),
		keys: v.array(numberKeySchema)
	}),
	v.object({
		id: entityIdSchema,
		kind: v.literal('attachment-transform'),
		targetId: entityIdSchema,
		property: v.picklist(['x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY']),
		keys: v.array(numberKeySchema)
	}),
	v.object({
		id: entityIdSchema,
		kind: v.literal('attachment-opacity'),
		targetId: entityIdSchema,
		keys: v.array(numberKeySchema)
	}),
	v.object({
		id: entityIdSchema,
		kind: v.literal('slot-attachment'),
		targetId: entityIdSchema,
		keys: v.array(attachmentKeySchema)
	}),
	v.object({
		id: entityIdSchema,
		kind: v.literal('slot-draw-order'),
		keys: v.array(drawOrderKeySchema)
	}),
	v.object({
		id: entityIdSchema,
		kind: v.literal('point-enabled'),
		targetId: entityIdSchema,
		keys: v.array(booleanKeySchema)
	}),
	v.object({
		id: entityIdSchema,
		kind: v.literal('rectangle-size'),
		targetId: entityIdSchema,
		property: v.picklist(['width', 'height']),
		keys: v.array(numberKeySchema)
	}),
	v.object({
		id: entityIdSchema,
		kind: v.literal('rectangle-enabled'),
		targetId: entityIdSchema,
		keys: v.array(booleanKeySchema)
	})
]);

const eventSchema = v.object({
	id: entityIdSchema,
	timeSeconds: finiteNumberSchema,
	name: v.string(),
	payload: v.record(v.string(), jsonValueSchema)
});
const clipSchema = v.object({
	id: entityIdSchema,
	name: v.string(),
	durationSeconds: finiteNumberSchema,
	fps: finiteNumberSchema,
	loop: v.boolean(),
	tracks: v.array(trackSchema),
	events: v.array(eventSchema)
});
const exportSettingsSchema = v.object({
	mode: v.picklist(['grid', 'packed']),
	maxTextureSize: finiteNumberSchema,
	padding: finiteNumberSchema,
	extrudeEdges: v.boolean()
});

export const projectSchema = v.object({
	schemaVersion: v.literal(1),
	id: entityIdSchema,
	name: v.string(),
	logicalCanvas: v.object({
		width: finiteNumberSchema,
		height: finiteNumberSchema
	}),
	assets: v.array(imageAssetSchema),
	bones: v.array(boneSchema),
	boneOrder: v.array(entityIdSchema),
	slots: v.array(slotSchema),
	attachments: v.array(attachmentSchema),
	setupDrawOrder: v.array(entityIdSchema),
	clips: v.array(clipSchema),
	exportSettings: exportSettingsSchema
});

export type ProjectSchemaOutput = v.InferOutput<typeof projectSchema>;

export type ProjectParseResult =
	| Readonly<{ success: true; project: Project; diagnostics: readonly [] }>
	| Readonly<{ success: false; project: undefined; diagnostics: readonly (string | ValidationDiagnostic)[] }>;

export const parseProject = function parseProject(input: unknown): ProjectParseResult {
	const parsed = v.safeParse(projectSchema, input);

	if (!parsed.success) {
		return {
			success: false,
			project: undefined,
			diagnostics: parsed.issues.map((issue) => issue.message)
		};
	}

	const semanticDiagnostics = validateProject(parsed.output);

	return semanticDiagnostics.length === 0
		? { success: true, project: parsed.output, diagnostics: [] }
		: { success: false, project: undefined, diagnostics: semanticDiagnostics };
};

export const isProjectData = function isProjectData(input: unknown): input is Project {
	return parseProject(input).success;
};
