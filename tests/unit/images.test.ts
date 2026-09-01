import { describe, expect, test } from 'bun:test';
import { mimeTypeFromFileName, validateImageBytes } from '../../src/assets/images.ts';

const pngBytes = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
	0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x20
]);
const jpegBytes = Uint8Array.from([
	0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x20, 0x00, 0x40, 0x03, 0x01, 0x11, 0x00
]);
const webpBytes = Uint8Array.from([
	0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
	0x56, 0x50, 0x38, 0x58, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
	0x3f, 0x00, 0x00, 0x1f, 0x00, 0x00
]);

describe('image validation', () => {
	test('recognizes supported image signatures and dimensions', () => {
		expect(validateImageBytes(pngBytes, 'image/png')).toMatchObject({ ok: true, value: { width: 64, height: 32 } });
		expect(validateImageBytes(jpegBytes, 'image/jpeg')).toMatchObject({ ok: true, value: { width: 64, height: 32 } });
		expect(validateImageBytes(webpBytes, 'image/webp')).toMatchObject({ ok: true, value: { width: 64, height: 32 } });
	});

	test('rejects mismatched signatures and unsupported extensions', () => {
		expect(validateImageBytes(pngBytes, 'image/jpeg')).toMatchObject({ ok: false });
		expect(mimeTypeFromFileName('character.PNG')).toBe('image/png');
		expect(mimeTypeFromFileName('character.jpeg')).toBe('image/jpeg');
		expect(mimeTypeFromFileName('character.tga')).toBeUndefined();
	});
});
