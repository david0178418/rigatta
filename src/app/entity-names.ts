export const nextAvailableName = function nextAvailableName(
	baseName: string,
	existingNames: readonly string[]
): string {
	const normalizedBaseName = baseName.trim();
	const usedNames = new Set(existingNames.map((name) => name.trim()));
	const candidates = Array.from(
		{ length: existingNames.length + 1 },
		(_, index) => index === 0 ? normalizedBaseName : `${normalizedBaseName} ${index + 1}`
	);

	return candidates.find((candidate) => !usedNames.has(candidate)) ?? `${normalizedBaseName} ${existingNames.length + 2}`;
};
