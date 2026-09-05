import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import * as v from 'valibot';
import { ENTITY_ID_PATTERN, type EntityId } from '../domain/ids.ts';
import { ARCHIVE_FORMAT, IMAGE_EXTENSION_BY_MIME_TYPE, PROJECT_SCHEMA_VERSION, ARCHIVE_VERSION, type SupportedImageMimeType } from '../domain/schema.ts';
import type { ImageAsset, Project } from '../domain/model.ts';
import { validateImageBytes } from '../assets/images.ts';
import { parseProject } from './project-schema.ts';

export type ArchiveManifestAsset = Readonly<{
	id: EntityId;
	path: string;
	mimeType: SupportedImageMimeType;
	byteLength: number;
	sha256: string;
}>;

export type ArchiveManifest = Readonly<{
	format: typeof ARCHIVE_FORMAT;
	archiveVersion: typeof ARCHIVE_VERSION;
	projectSchemaVersion: typeof PROJECT_SCHEMA_VERSION;
	projectId: EntityId;
	projectFile: 'project.json';
	assets: readonly ArchiveManifestAsset[];
}>;

export type ArchiveError = Readonly<{
	code: 'invalid-project' | 'missing-asset' | 'invalid-manifest' | 'invalid-archive' | 'integrity-failure';
	message: string;
}>;

export type ArchiveResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: ArchiveError }>;

export type ArchiveImport = Readonly<{
	project: Project;
	assets: ReadonlyMap<EntityId, Uint8Array>;
}>;

const manifestSchema = v.object({
	format: v.literal(ARCHIVE_FORMAT),
	archiveVersion: v.literal(1),
	projectSchemaVersion: v.literal(1),
	projectId: v.pipe(v.string(), v.regex(ENTITY_ID_PATTERN)),
	projectFile: v.literal('project.json'),
	assets: v.array(v.object({
		id: v.pipe(v.string(), v.regex(ENTITY_ID_PATTERN)),
		path: v.string(),
		mimeType: v.picklist(['image/png', 'image/jpeg', 'image/webp']),
		byteLength: v.pipe(v.number(), v.finite()),
		sha256: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/))
	}))
});

const archiveSuccess = function archiveSuccess<TValue>(value: TValue): ArchiveResult<TValue> {
	return { ok: true, value };
};

const archiveFailure = function archiveFailure(
	code: ArchiveError['code'],
	message: string
): ArchiveResult<never> {
	return { ok: false, error: { code, message } };
};

const stableJson = function stableJson(value: unknown): Uint8Array {
	return strToU8(`${JSON.stringify(value, null, 2)}\n`);
};

const sha256 = async function sha256(bytes: Uint8Array): Promise<string> {
	const digestInput = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(digestInput).set(bytes);
	const digest = await crypto.subtle.digest('SHA-256', digestInput);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
};

const archiveAssetPath = function archiveAssetPath(asset: ImageAsset): string {
	return `assets/${asset.id}.${IMAGE_EXTENSION_BY_MIME_TYPE[asset.mimeType]}`;
};

const isExpectedAssetPath = function isExpectedAssetPath(
	path: string,
	asset: ImageAsset
): boolean {
	return path === archiveAssetPath(asset);
};

const jsonFromBytes = function jsonFromBytes(bytes: Uint8Array, label: string): ArchiveResult<unknown> {
	try {
		return archiveSuccess(JSON.parse(strFromU8(bytes)));
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown JSON parse failure.';
		return archiveFailure('invalid-archive', `Could not parse ${label}: ${message}`);
	}
};

const manifestFromBytes = function manifestFromBytes(bytes: Uint8Array): ArchiveResult<ArchiveManifest> {
	const json = jsonFromBytes(bytes, 'manifest.json');

	if (!json.ok) {
		return json;
	}

	const parsed = v.safeParse(manifestSchema, json.value);

	return parsed.success
		? archiveSuccess(parsed.output)
		: archiveFailure('invalid-manifest', 'Manifest does not match archive schema version 1.');
};

const projectAssetById = function projectAssetById(
	project: Project,
	id: EntityId
): ImageAsset | undefined {
	return project.assets.find((asset) => asset.id === id);
};

const hasUniqueManifestEntries = function hasUniqueManifestEntries(
	manifest: ArchiveManifest
): boolean {
	const ids = manifest.assets.map((asset) => asset.id);
	const paths = manifest.assets.map((asset) => asset.path);

	return new Set(ids).size === ids.length && new Set(paths).size === paths.length;
};

const validateManifestAgainstProject = function validateManifestAgainstProject(
	manifest: ArchiveManifest,
	project: Project
): ArchiveResult<null> {
	if (manifest.projectId !== project.id) {
		return archiveFailure('invalid-manifest', 'Manifest project ID does not match project.json.');
	}
	if (manifest.projectSchemaVersion !== project.schemaVersion) {
		return archiveFailure('invalid-manifest', 'Manifest and project schema versions do not match.');
	}
	if (!hasUniqueManifestEntries(manifest) || manifest.assets.length !== project.assets.length) {
		return archiveFailure('invalid-manifest', 'Manifest must list every project asset exactly once.');
	}

	const invalidEntries = manifest.assets.filter((entry) => {
		const asset = projectAssetById(project, entry.id);
		return !asset || !isExpectedAssetPath(entry.path, asset) || entry.byteLength < 0;
	});

	return invalidEntries.length === 0
		? archiveSuccess(null)
		: archiveFailure('invalid-manifest', 'Manifest asset entries do not match project assets.');
};

const decodeArchive = function decodeArchive(
	archiveBytes: Uint8Array
): ArchiveResult<ReturnType<typeof unzipSync>> {
	try {
		return archiveSuccess(unzipSync(archiveBytes));
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown ZIP decode failure.';
		return archiveFailure('invalid-archive', `Could not read .${ARCHIVE_FORMAT} archive: ${message}`);
	}
};

export const exportProjectArchive = async function exportProjectArchive(
	project: Project,
	assets: ReadonlyMap<EntityId, Uint8Array>
): Promise<ArchiveResult<Uint8Array>> {
	const projectParse = parseProject(project);

	if (!projectParse.success) {
		return archiveFailure('invalid-project', 'Cannot export an invalid project.');
	}

	const assetBytes = project.assets.map((asset) => ({
		asset,
		bytes: assets.get(asset.id)
	}));
	const missingAsset = assetBytes.find(({ bytes }) => !bytes);

	if (missingAsset) {
		return archiveFailure('missing-asset', `No bytes were supplied for asset ${missingAsset.asset.id}.`);
	}

	const manifestAssets = await Promise.all(assetBytes.map(async ({ asset, bytes }) => ({
		id: asset.id,
		path: archiveAssetPath(asset),
		mimeType: asset.mimeType,
		byteLength: bytes?.byteLength ?? 0,
		sha256: await sha256(bytes ?? new Uint8Array())
	})));
const manifest: ArchiveManifest = {
		format: ARCHIVE_FORMAT,
		archiveVersion: ARCHIVE_VERSION,
		projectSchemaVersion: project.schemaVersion,
		projectId: project.id,
		projectFile: 'project.json',
		assets: [...manifestAssets].sort((left, right) => left.id.localeCompare(right.id))
	};
	const archiveEntries: Record<string, Uint8Array> = {
		'manifest.json': stableJson(manifest),
		'project.json': stableJson(project)
	};
	const assetEntries = assetBytes.reduce<Record<string, Uint8Array>>((entries, item) => {
		if (item.bytes) {
			return { ...entries, [archiveAssetPath(item.asset)]: item.bytes };
		}

		return entries;
	}, {});

	return archiveSuccess(zipSync({ ...archiveEntries, ...assetEntries }, { level: 6 }));
};

export const importProjectArchive = async function importProjectArchive(
	archiveBytes: Uint8Array
): Promise<ArchiveResult<ArchiveImport>> {
	const decodedArchive = decodeArchive(archiveBytes);

	if (!decodedArchive.ok) {
		return decodedArchive;
	}

	const entries = decodedArchive.value;

	const manifestBytes = entries['manifest.json'];
	const projectBytes = entries['project.json'];

	if (!manifestBytes || !projectBytes) {
		return archiveFailure('invalid-archive', 'Archive must contain manifest.json and project.json.');
	}

	const manifest = manifestFromBytes(manifestBytes);

	if (!manifest.ok) {
		return manifest;
	}

	const projectJson = jsonFromBytes(projectBytes, 'project.json');

	if (!projectJson.ok) {
		return projectJson;
	}

	const project = parseProject(projectJson.value);

	if (!project.success) {
		return archiveFailure('invalid-project', 'project.json failed schema or reference validation.');
	}

	const manifestValidation = validateManifestAgainstProject(manifest.value, project.project);

	if (!manifestValidation.ok) {
		return manifestValidation;
	}

	const declaredPaths = new Set(['manifest.json', 'project.json', ...manifest.value.assets.map((asset) => asset.path)]);
	const unexpectedPaths = Object.keys(entries).filter((path) => !declaredPaths.has(path));

	if (unexpectedPaths.length > 0 || manifest.value.assets.some((asset) => !asset.path.startsWith('assets/'))) {
		return archiveFailure('invalid-archive', 'Archive contains an undeclared file or an unsafe asset path.');
	}

	const verifiedAssets = await Promise.all(manifest.value.assets.map(async (manifestAsset) => {
		const bytes = entries[manifestAsset.path];

		if (!bytes) {
			return archiveFailure('missing-asset', `Archive is missing ${manifestAsset.path}.`);
		}

		const digest = await sha256(bytes);
		const image = validateImageBytes(bytes, manifestAsset.mimeType);
		const projectAsset = projectAssetById(project.project, manifestAsset.id);

		return digest === manifestAsset.sha256
			&& bytes.byteLength === manifestAsset.byteLength
			&& image.ok
			&& projectAsset?.width === image.value.width
			&& projectAsset.height === image.value.height
			? archiveSuccess({ id: manifestAsset.id, bytes })
			: archiveFailure('integrity-failure', `Asset integrity or dimensions check failed for ${manifestAsset.path}.`);
	}));
	const failedAsset = verifiedAssets.find((result) => !result.ok);

	if (failedAsset && !failedAsset.ok) {
		return failedAsset;
	}

	return archiveSuccess({
		project: project.project,
		assets: new Map(verifiedAssets.flatMap((result) => result.ok ? [[result.value.id, result.value.bytes] as const] : []))
	});
};
