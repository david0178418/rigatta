import type { EventPayload, JsonValue } from './model.ts';

export const MAX_EVENT_NAME_LENGTH = 64;
export const MAX_EVENT_KEY_LENGTH = 64;
export const MAX_EVENT_PAYLOAD_ENTRIES = 64;
export const MAX_EVENT_PAYLOAD_DEPTH = 6;

type JsonRecord = Readonly<Record<string, unknown>>;

const isJsonRecord = function isJsonRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const normalizeEventName = function normalizeEventName(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const normalized = value.trim();

	return normalized.length > 0 && normalized.length <= MAX_EVENT_NAME_LENGTH
		? normalized
		: undefined;
};

const isJsonValue = function isJsonValue(value: unknown, depth: number): value is JsonValue {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') {
		return true;
	}
	if (typeof value === 'number') {
		return Number.isFinite(value);
	}
	if (depth >= MAX_EVENT_PAYLOAD_DEPTH) {
		return false;
	}
	if (Array.isArray(value)) {
		return value.length <= MAX_EVENT_PAYLOAD_ENTRIES
			&& value.every((item) => isJsonValue(item, depth + 1));
	}
	if (!isJsonRecord(value)) {
		return false;
	}

	const entries = Object.entries(value);

	return entries.length <= MAX_EVENT_PAYLOAD_ENTRIES
		&& entries.every(([key, nested]) => key.length > 0
			&& key.length <= MAX_EVENT_KEY_LENGTH
			&& isJsonValue(nested, depth + 1));
};

export const isEventPayload = function isEventPayload(value: unknown): value is EventPayload {
	return isJsonRecord(value) && isJsonValue(value, 0);
};
