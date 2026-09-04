import {
	DEFAULT_LOCAL_TRANSFORM,
	type Point
} from '../domain/coordinates.ts';
import { reduceProject, type ProjectCommand } from '../domain/commands.ts';
import { createEntityId, isEntityId, type EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';
import {
	type CreateImageAssetInput,
	type OperationError,
	type OperationResult
} from '../domain/operations.ts';
import { localPointForBone, evaluateBoneWorldMatrices } from '../domain/transforms.ts';
import { validateProject } from '../domain/validation.ts';
import { isSupportedImageMimeType } from '../domain/schema.ts';
import { validateImageBytes } from './images.ts';
import type {
	AssetImportEntriesResult,
	AssetImportEntry,
	ImportedImage
} from './import.ts';

export type SingleImageImportPlacementPlan = Readonly<{
	commands: readonly ProjectCommand[];
	assetId: EntityId;
	rootBoneId: EntityId | undefined;
	boneId: EntityId;
	slotId: EntityId;
	attachmentId: EntityId;
	localPoint: Point;
	asset: CreateImageAssetInput;
}>;

export type BulkImportedAsset = Readonly<{
	image: ImportedImage;
	assetId: EntityId;
}>;

export type BulkImportConflict = Readonly<{
	image: ImportedImage;
	existingAssetId: EntityId;
}>;

export type BulkImportIssue = Readonly<{
	relativePath: string;
	reason: string;
}>;

export type BulkImportPlan = Readonly<{
	commands: readonly ProjectCommand[];
	imported: readonly BulkImportedAsset[];
	skipped: readonly BulkImportIssue[];
	conflicting: readonly BulkImportConflict[];
	invalid: readonly BulkImportIssue[];
	unsupported: readonly BulkImportIssue[];
	eligibleAssetIds: readonly EntityId[];
}>;

export type BulkImportResult = BulkImportPlan;

const success = function success<TValue>(value: TValue): OperationResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(
	code: OperationError['code'],
	message: string
): OperationResult<never> {
	return { ok: false, error: { code, message } };
};

const isFinitePoint = function isFinitePoint(point: Point): boolean {
	return Number.isFinite(point.x) && Number.isFinite(point.y);
};

const isSafeRelativePath = function isSafeRelativePath(path: string): boolean {
	const normalizedPath = path.replaceAll('\\', '/');
	const segments = normalizedPath.split('/');

	return normalizedPath.length > 0
		&& !normalizedPath.startsWith('/')
		&& !segments.some((segment) => segment === '..')
		&& segments.every((segment) => segment.length > 0 && segment !== '.');
};

const positiveInteger = function positiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
};

const projectValidationError = function projectValidationError(
	project: Project
): OperationError | undefined {
	const diagnostic = validateProject(project)[0];

	return diagnostic
		? { code: 'invalid-value', message: `Cannot import into an invalid project: ${diagnostic.message}` }
		: undefined;
};

const assetInputFor = function assetInputFor(
	image: ImportedImage
): OperationResult<CreateImageAssetInput> {
	if (image.name.trim().length === 0) {
		return failure('invalid-name', 'Imported image names must contain at least one non-whitespace character.');
	}
	if (!isSafeRelativePath(image.relativePath)) {
		return failure('invalid-value', 'Imported image paths must be safe, non-empty relative paths.');
	}
	if (!isSupportedImageMimeType(image.mimeType)) {
		return failure('invalid-value', 'Imported image MIME type is not supported.');
	}
	if (!positiveInteger(image.width) || !positiveInteger(image.height)) {
		return failure('invalid-value', 'Imported image dimensions must be positive integers.');
	}
	const validated = validateImageBytes(image.bytes, image.mimeType);

	if (!validated.ok) {
		return failure('invalid-value', `${image.relativePath}: ${validated.error}`);
	}
	if (validated.value.width !== image.width || validated.value.height !== image.height) {
		return failure('invalid-value', `${image.relativePath}: imported dimensions do not match the image bytes.`);
	}

	return success({
		name: image.name,
		relativePath: image.relativePath,
		mimeType: image.mimeType,
		width: image.width,
		height: image.height
	});
};

const projectEntityIds = function projectEntityIds(project: Project): readonly EntityId[] {
	return [
		project.id,
		...project.assets.map((asset) => asset.id),
		...project.bones.map((bone) => bone.id),
		...project.slots.map((slot) => slot.id),
		...project.attachments.map((attachment) => attachment.id),
		...project.clips.flatMap((clip) => [
			clip.id,
			...clip.tracks.map((track) => track.id),
			...clip.tracks.flatMap((track) => track.keys.map((key) => key.id)),
			...clip.events.map((event) => event.id)
		])
	];
};

const allocateFreshId = function allocateFreshId(
	project: Project,
	usedIds: readonly EntityId[],
	idFactory: () => string
): OperationResult<EntityId> {
	try {
		const candidate: unknown = idFactory();
		const projectIds = projectEntityIds(project);

		if (!isEntityId(candidate)) {
			return failure('invalid-id', 'Import ID allocation returned an invalid entity ID.');
		}
		if (projectIds.includes(candidate) || usedIds.includes(candidate)) {
			return failure('duplicate-id', 'Import ID allocation returned an ID that is already in use.');
		}

		return success(candidate);
	} catch {
		return failure('invalid-id', 'Import ID allocation failed.');
	}
};

type PlacementIds = Readonly<{
	assetId: EntityId;
	rootBoneId: EntityId | undefined;
	slotId: EntityId;
	attachmentId: EntityId;
}>;

const placementIdsFor = function placementIdsFor(
	project: Project,
	createRoot: boolean,
	idFactory: () => string
): OperationResult<PlacementIds> {
	const assetId = allocateFreshId(project, [], idFactory);

	if (!assetId.ok) {
		return assetId;
	}

	const afterAsset = [assetId.value];
	const rootBoneId = createRoot
		? allocateFreshId(project, afterAsset, idFactory)
		: success<EntityId | undefined>(undefined);

	if (!rootBoneId.ok) {
		return rootBoneId;
	}

	const afterRoot = rootBoneId.value ? [...afterAsset, rootBoneId.value] : afterAsset;
	const slotId = allocateFreshId(project, afterRoot, idFactory);

	if (!slotId.ok) {
		return slotId;
	}

	const attachmentId = allocateFreshId(project, [...afterRoot, slotId.value], idFactory);

	if (!attachmentId.ok) {
		return attachmentId;
	}

	return success({
		assetId: assetId.value,
		rootBoneId: rootBoneId.value,
		slotId: slotId.value,
		attachmentId: attachmentId.value
	});
};

const applyCommands = function applyCommands(
	project: Project,
	commands: readonly ProjectCommand[]
): OperationResult<Project> {
	return commands.reduce<OperationResult<Project>>(
		(result, command) => result.ok ? reduceProject(result.value, command) : result,
		success(project)
	);
};

const imagePlacementCommandsFor = function imagePlacementCommandsFor(
	asset: CreateImageAssetInput,
	assetId: EntityId,
	rootBoneId: EntityId | undefined,
	boneId: EntityId,
	slotId: EntityId,
	attachmentId: EntityId,
	localPoint: Point
): readonly ProjectCommand[] {
	return [
		{
			kind: 'add-image-assets',
			assets: [{ id: assetId, asset }]
		},
		...(rootBoneId
			? [{ kind: 'create-bone' as const, id: rootBoneId, input: { name: 'root', parentId: null } }]
			: []),
		{
			kind: 'create-slot',
			id: slotId,
			input: { name: asset.name, boneId }
		},
		{
			kind: 'create-image-attachment',
			id: attachmentId,
			input: {
				name: asset.name,
				slotId,
				assetId,
				transform: { ...DEFAULT_LOCAL_TRANSFORM, x: localPoint.x, y: localPoint.y }
			}
		},
		{ kind: 'assign-slot-attachment', slotId, attachmentId }
	];
};

export const planSingleImageImportAndPlace = function planSingleImageImportAndPlace(
	project: Project,
	image: ImportedImage,
	logicalDropPoint: Point,
	selectedBoneId: EntityId | undefined,
	idFactory: () => string = createEntityId
): OperationResult<SingleImageImportPlacementPlan> {
	const projectError = projectValidationError(project);

	if (projectError) {
		return { ok: false, error: projectError };
	}
	if (!isFinitePoint(logicalDropPoint)) {
		return failure('invalid-value', 'Logical drop points must contain finite coordinates.');
	}

	const asset = assetInputFor(image);

	if (!asset.ok) {
		return asset;
	}
	if (project.assets.some((candidate) => candidate.relativePath === asset.value.relativePath)) {
		return failure('duplicate-asset-path', 'An image with this relative path is already imported.');
	}

	const roots = project.bones.filter((bone) => bone.parentId === null);

	if (roots.length > 1) {
		return failure('invalid-reference', 'A project with multiple root bones cannot receive an image drop.');
	}
	if (roots.length === 0 && project.bones.length > 0) {
		return failure('invalid-reference', 'A project with bones but no root cannot receive an image drop.');
	}

	const selectedBone = roots.length === 1 && selectedBoneId
		? project.bones.find((bone) => bone.id === selectedBoneId)
		: undefined;

	if (roots.length === 1 && !selectedBone) {
		return selectedBoneId
			? failure('not-found', 'The selected bone no longer exists in the project.')
			: failure('invalid-reference', 'Select a bone before dropping an image on the canvas.');
	}
	if (roots.length === 0 && selectedBoneId) {
		return failure('not-found', 'The selected bone no longer exists in the empty project.');
	}

	const localPoint = selectedBone
		? localPointForBone(evaluateBoneWorldMatrices(project), selectedBone.id, logicalDropPoint)
		: logicalDropPoint;

	if (!localPoint) {
		return failure('invalid-pose', 'The selected bone transform cannot receive an image at that position.');
	}

	const createRoot = roots.length === 0;
	const ids = placementIdsFor(project, createRoot, idFactory);

	if (!ids.ok) {
		return ids;
	}

	const boneId = selectedBone?.id ?? ids.value.rootBoneId;

	if (!boneId) {
		return failure('invalid-reference', 'An image drop could not resolve its target bone.');
	}

	const commands = imagePlacementCommandsFor(
		asset.value,
		ids.value.assetId,
		ids.value.rootBoneId,
		boneId,
		ids.value.slotId,
		ids.value.attachmentId,
		localPoint
	);
	const reduced = applyCommands(project, commands);

	if (!reduced.ok) {
		return reduced;
	}

	return success({
		commands,
		assetId: ids.value.assetId,
		rootBoneId: ids.value.rootBoneId,
		boneId,
		slotId: ids.value.slotId,
		attachmentId: ids.value.attachmentId,
		localPoint,
		asset: asset.value
	});
};

const issueFor = function issueFor(
	entry: Extract<AssetImportEntry, { kind: 'skipped' | 'invalid' | 'unsupported' }>
): BulkImportIssue {
	return { relativePath: entry.relativePath, reason: entry.reason };
};

const duplicatePathsFor = function duplicatePathsFor(
	paths: readonly string[]
): ReadonlySet<string> {
	return new Set(paths.filter((path, index) => paths.indexOf(path) !== index));
};

type BulkCandidate = Readonly<{
	image: ImportedImage;
	asset: CreateImageAssetInput;
}>;

type BulkAllocationState = Readonly<{
	entries: readonly BulkImportedAsset[];
	commands: readonly Extract<ProjectCommand, { kind: 'add-image-assets' }>['assets'][number][];
	usedIds: readonly EntityId[];
}>;

const allocateBulkCandidates = function allocateBulkCandidates(
	project: Project,
	candidates: readonly BulkCandidate[],
	idFactory: () => string
): OperationResult<BulkAllocationState> {
	return candidates.reduce<OperationResult<BulkAllocationState>>((result, candidate) => {
		if (!result.ok) {
			return result;
		}

		const id = allocateFreshId(project, result.value.usedIds, idFactory);

		if (!id.ok) {
			return id;
		}

		return success({
			entries: [...result.value.entries, { image: candidate.image, assetId: id.value }],
			commands: [...result.value.commands, { id: id.value, asset: candidate.asset }],
			usedIds: [...result.value.usedIds, id.value]
		});
	}, success({ entries: [], commands: [], usedIds: [] }));
};

export const planBulkImport = function planBulkImport(
	project: Project,
	input: AssetImportEntriesResult,
	idFactory: () => string = createEntityId
): OperationResult<BulkImportPlan> {
	const projectError = projectValidationError(project);

	if (projectError) {
		return { ok: false, error: projectError };
	}

	const skipped = input.entries.flatMap((entry) => entry.kind === 'skipped' ? [issueFor(entry)] : []);
	const invalid = input.entries.flatMap((entry) => entry.kind === 'invalid' ? [issueFor(entry)] : []);
	const unsupported = input.entries.flatMap((entry) => entry.kind === 'unsupported' ? [issueFor(entry)] : []);
	const importedImages = input.entries.flatMap((entry) => entry.kind === 'imported' ? [entry.image] : []);
	const duplicateImportedPaths = duplicatePathsFor(importedImages.map((image) => image.relativePath));
	const existingAssetsByPath = new Map(project.assets.map((asset) => [asset.relativePath, asset] as const));

	const classified = importedImages.reduce<Readonly<{
		candidates: readonly BulkCandidate[];
		conflicting: readonly BulkImportConflict[];
		invalid: readonly BulkImportIssue[];
	}>>((result, image) => {
		const existingAsset = existingAssetsByPath.get(image.relativePath);

		if (existingAsset) {
			return { ...result, conflicting: [...result.conflicting, { image, existingAssetId: existingAsset.id }] };
		}
		if (duplicateImportedPaths.has(image.relativePath)) {
			return {
				...result,
				invalid: [...result.invalid, {
					relativePath: image.relativePath,
					reason: 'The import contains a duplicate relative path.'
				}]
			};
		}

		const asset = assetInputFor(image);

		if (!asset.ok) {
			return {
				...result,
				invalid: [...result.invalid, { relativePath: image.relativePath, reason: asset.error.message }]
			};
		}

		return { ...result, candidates: [...result.candidates, { image, asset: asset.value }] };
	}, { candidates: [], conflicting: [], invalid: [] });

	const allocation = allocateBulkCandidates(project, classified.candidates, idFactory);

	if (!allocation.ok) {
		return allocation;
	}

	const commands: readonly ProjectCommand[] = allocation.value.commands.length > 0
		? [{ kind: 'add-image-assets', assets: allocation.value.commands }]
		: [];
	const reduced = applyCommands(project, commands);

	if (!reduced.ok) {
		return reduced;
	}

	return success({
		commands,
		imported: allocation.value.entries,
		skipped,
		conflicting: classified.conflicting,
		invalid: [...invalid, ...classified.invalid],
		unsupported,
		eligibleAssetIds: allocation.value.entries.map((entry) => entry.assetId)
	});
};
