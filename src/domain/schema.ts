export const APP_NAME = 'Rigatta' as const;
export const ARCHIVE_FORMAT = 'rigatta' as const;
export const COMPANION_METADATA_FILENAME = 'rigatta-metadata.json' as const;
export const PROJECT_SCHEMA_VERSION = 1 as const;
export const ARCHIVE_VERSION = 1 as const;
export const EXPORT_METADATA_SCHEMA_VERSION = 1 as const;

export const SUPPORTED_IMAGE_MIME_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp'
] as const;

export type SupportedImageMimeType = typeof SUPPORTED_IMAGE_MIME_TYPES[number];

export const IMAGE_EXTENSION_BY_MIME_TYPE: Readonly<Record<SupportedImageMimeType, string>> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
};

export const isSupportedImageMimeType = function isSupportedImageMimeType(
	value: unknown
): value is SupportedImageMimeType {
	return typeof value === 'string' && SUPPORTED_IMAGE_MIME_TYPES.some((mimeType) => mimeType === value);
};
