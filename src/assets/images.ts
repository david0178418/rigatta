import {
	SUPPORTED_IMAGE_MIME_TYPES,
	type SupportedImageMimeType
} from '../domain/schema.ts';

export type ImageSize = Readonly<{
	width: number;
	height: number;
}>;

export type ValidatedImage = Readonly<{
	bytes: Uint8Array;
	mimeType: SupportedImageMimeType;
	width: number;
	height: number;
}>;

export type DecodedImage = ValidatedImage & Readonly<{
	bitmap: ImageBitmap;
}>;

export type ImageValidationResult<TValue = ValidatedImage> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

const pngSignature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webpRiffSignature = Uint8Array.from([0x52, 0x49, 0x46, 0x46]);
const webpSignature = Uint8Array.from([0x57, 0x45, 0x42, 0x50]);

const matchesAt = function matchesAt(
	bytes: Uint8Array,
	signature: Uint8Array,
	offset: number = 0
): boolean {
	return signature.every((value, index) => bytes[offset + index] === value);
};

const readUint16BigEndian = function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
	return bytes[offset] * 256 + bytes[offset + 1];
};

const readUint24LittleEndian = function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
	return bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
};

const readUint32BigEndian = function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
	return bytes[offset] * 16777216
		+ bytes[offset + 1] * 65536
		+ bytes[offset + 2] * 256
		+ bytes[offset + 3];
};

const readUint16LittleEndian = function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
	return bytes[offset] + bytes[offset + 1] * 256;
};

const validSize = function validSize(size: ImageSize | undefined): size is ImageSize {
	if (!size) {
		return false;
	}

	return Number.isInteger(size.width)
		&& Number.isInteger(size.height)
		&& size.width > 0
		&& size.height > 0;
};

const pngSize = function pngSize(bytes: Uint8Array): ImageSize | undefined {
	if (bytes.length < 24 || !matchesAt(bytes, pngSignature) || !matchesAt(bytes, Uint8Array.from([0x49, 0x48, 0x44, 0x52]), 12)) {
		return undefined;
	}

	return { width: readUint32BigEndian(bytes, 16), height: readUint32BigEndian(bytes, 20) };
};

const isJpegSizeMarker = function isJpegSizeMarker(marker: number): boolean {
	return [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
};

const jpegSizeFromOffset = function jpegSizeFromOffset(
	bytes: Uint8Array,
	offset: number
): ImageSize | undefined {
	if (offset + 4 > bytes.length || bytes[offset] !== 0xff) {
		return undefined;
	}

	const marker = bytes[offset + 1];

	if (marker === 0xd8 || marker === 0xd9) {
		return jpegSizeFromOffset(bytes, offset + 2);
	}
	if (marker === 0xda || marker === 0x00 || marker === 0xff) {
		return undefined;
	}

	const segmentLength = readUint16BigEndian(bytes, offset + 2);

	if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) {
		return undefined;
	}
	if (isJpegSizeMarker(marker)) {
		return offset + 9 <= bytes.length
			? { width: readUint16BigEndian(bytes, offset + 7), height: readUint16BigEndian(bytes, offset + 5) }
			: undefined;
	}

	return jpegSizeFromOffset(bytes, offset + 2 + segmentLength);
};

const jpegSize = function jpegSize(bytes: Uint8Array): ImageSize | undefined {
	return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8
		? jpegSizeFromOffset(bytes, 2)
		: undefined;
};

const webpChunkSize = function webpChunkSize(bytes: Uint8Array, chunk: string): ImageSize | undefined {
	if (!matchesAt(bytes, webpRiffSignature) || !matchesAt(bytes, webpSignature, 8) || bytes.length < 30) {
		return undefined;
	}

	const chunkBytes = Uint8Array.from(chunk, (character) => character.charCodeAt(0));

	if (matchesAt(bytes, chunkBytes, 12) && chunk === 'VP8X') {
		return {
			width: readUint24LittleEndian(bytes, 24) + 1,
			height: readUint24LittleEndian(bytes, 27) + 1
		};
	}
	if (matchesAt(bytes, chunkBytes, 12) && chunk === 'VP8 ') {
		return bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a
			? { width: readUint16LittleEndian(bytes, 26) & 0x3fff, height: readUint16LittleEndian(bytes, 28) & 0x3fff }
			: undefined;
	}
	if (matchesAt(bytes, chunkBytes, 12) && chunk === 'VP8L') {
		return bytes.length >= 25 && bytes[20] === 0x2f
			? {
					width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]),
					height: 1 + (((bytes[24] & 0xf) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6))
				}
			: undefined;
	}

	return undefined;
};

const webpSize = function webpSize(bytes: Uint8Array): ImageSize | undefined {
	return webpChunkSize(bytes, 'VP8X') ?? webpChunkSize(bytes, 'VP8 ') ?? webpChunkSize(bytes, 'VP8L');
};

const signatureMatchesMime = function signatureMatchesMime(
	bytes: Uint8Array,
	mimeType: SupportedImageMimeType
): boolean {
	if (mimeType === 'image/png') {
		return matchesAt(bytes, pngSignature);
	}
	if (mimeType === 'image/jpeg') {
		return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	}

	return matchesAt(bytes, webpRiffSignature) && matchesAt(bytes, webpSignature, 8);
};

const sizeForMime = function sizeForMime(
	bytes: Uint8Array,
	mimeType: SupportedImageMimeType
): ImageSize | undefined {
	if (mimeType === 'image/png') {
		return pngSize(bytes);
	}
	if (mimeType === 'image/jpeg') {
		return jpegSize(bytes);
	}

	return webpSize(bytes);
};

export const mimeTypeFromFileName = function mimeTypeFromFileName(
	fileName: string
): SupportedImageMimeType | undefined {
	const extension = fileName.toLowerCase().split('.').at(-1);

	return extension === 'png'
		? 'image/png'
		: extension === 'jpg' || extension === 'jpeg'
			? 'image/jpeg'
			: extension === 'webp'
				? 'image/webp'
				: undefined;
};

export const validateImageBytes = function validateImageBytes(
	bytes: Uint8Array,
	mimeType: SupportedImageMimeType
): ImageValidationResult {
	if (!SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType)) {
		return { ok: false, error: `Unsupported image MIME type: ${mimeType}` };
	}
	if (!signatureMatchesMime(bytes, mimeType)) {
		return { ok: false, error: 'Image signature does not match its MIME type.' };
	}

	const size = sizeForMime(bytes, mimeType);

	return validSize(size)
		? { ok: true, value: { bytes, mimeType, width: size.width, height: size.height } }
		: { ok: false, error: 'Image dimensions could not be decoded.' };
};

export const decodeImageBlob = async function decodeImageBlob(
	blob: Blob,
	mimeType: SupportedImageMimeType
): Promise<ImageValidationResult<DecodedImage>> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	const validated = validateImageBytes(bytes, mimeType);

	if (!validated.ok) {
		return validated;
	}
	if (typeof createImageBitmap !== 'function') {
		return { ok: false, error: 'This browser cannot decode imported images.' };
	}

	try {
		const bitmap = await createImageBitmap(blob);

		return {
			ok: true,
			value: { ...validated.value, bitmap, width: bitmap.width, height: bitmap.height }
		};
	} catch (error: unknown) {
		return {
			ok: false,
			error: error instanceof Error ? `Image decoding failed: ${error.message}` : 'Image decoding failed.'
		};
	}
};
