import { zlibSync } from 'fflate';
import type { RgbaFrame } from './trim.ts';

export type PngResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHUNK_IHDR = Uint8Array.from([73, 72, 68, 82]);
const CHUNK_IDAT = Uint8Array.from([73, 68, 65, 84]);
const CHUNK_IEND = Uint8Array.from([73, 69, 78, 68]);

const crcTable = Array.from({ length: 256 }, (_, value) => Array.from({ length: 8 }, () => 0).reduce(
	(crc: number) => (crc & 1) === 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1,
	value
) >>> 0);

const crc32 = function crc32(bytes: Uint8Array): number {
	return (bytes.reduce((crc, byte) => crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
};

const concatBytes = function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
	const output = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));

	parts.reduce((offset, part) => {
		output.set(part, offset);
		return offset + part.byteLength;
	}, 0);

	return output;
};

const pngChunk = function pngChunk(type: Uint8Array, data: Uint8Array): Uint8Array {
	const crcInput = concatBytes([type, data]);
	const chunk = new Uint8Array(12 + data.byteLength);
	const view = new DataView(chunk.buffer);

	view.setUint32(0, data.byteLength);
	chunk.set(type, 4);
	chunk.set(data, 8);
	view.setUint32(8 + data.byteLength, crc32(crcInput));

	return chunk;
};

const headerData = function headerData(frame: RgbaFrame): Uint8Array {
	const data = new Uint8Array(13);
	const view = new DataView(data.buffer);

	view.setUint32(0, frame.width);
	view.setUint32(4, frame.height);
	data[8] = 8;
	data[9] = 6;

	return data;
};

const scanlineData = function scanlineData(frame: RgbaFrame): Uint8Array {
	const rowByteLength = frame.width * 4;
	const data = new Uint8Array((rowByteLength + 1) * frame.height);

	Array.from({ length: frame.height }, (_, row) => row).forEach((row) => {
		const sourceStart = row * rowByteLength;
		const targetStart = row * (rowByteLength + 1);

		data.set(frame.pixels.subarray(sourceStart, sourceStart + rowByteLength), targetStart + 1);
	});

	return data;
};

const validFrame = function validFrame(frame: RgbaFrame): boolean {
	return Number.isInteger(frame.width)
		&& Number.isInteger(frame.height)
		&& frame.width > 0
		&& frame.height > 0
		&& frame.pixels.byteLength === frame.width * frame.height * 4;
};

export const encodeRgbaPng = function encodeRgbaPng(frame: RgbaFrame): PngResult<Uint8Array> {
	if (!validFrame(frame)) {
		return { ok: false, error: 'RGBA frame dimensions do not match its pixel buffer.' };
	}

	const compressed = zlibSync(scanlineData(frame));

	return {
		ok: true,
		value: concatBytes([
			PNG_SIGNATURE,
			pngChunk(CHUNK_IHDR, headerData(frame)),
			pngChunk(CHUNK_IDAT, compressed),
			pngChunk(CHUNK_IEND, new Uint8Array())
		])
	};
};
