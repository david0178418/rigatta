export type EntityId = string;

export const ENTITY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isEntityId = function isEntityId(value: unknown): value is EntityId {
	return typeof value === 'string' && ENTITY_ID_PATTERN.test(value);
};

const randomUuid = function randomUuid(): string {
	return crypto.randomUUID();
};

export const createEntityId = function createEntityId(
	nextUuid: () => string = randomUuid
): EntityId {
	const candidate = nextUuid().toLowerCase();

	if (!isEntityId(candidate)) {
		throw new RangeError(`Generated entity ID is not a UUID v4: ${candidate}`);
	}

	return candidate;
};

export const parseEntityId = function parseEntityId(value: unknown): EntityId | undefined {
	return isEntityId(value) ? value : undefined;
};
