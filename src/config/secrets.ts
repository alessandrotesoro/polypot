export interface PolypotSecrets {
	readonly openaiApiKey?: string;
	readonly hasOpenaiApiKey: boolean;
}

export const EMPTY_SECRETS: PolypotSecrets = Object.freeze({
	hasOpenaiApiKey: false,
});

export function createPolypotSecrets(openaiApiKey?: string): PolypotSecrets {
	const normalized = openaiApiKey?.trim();
	return {
		...(normalized !== undefined &&
			normalized.length > 0 && { openaiApiKey: normalized }),
		hasOpenaiApiKey: normalized !== undefined && normalized.length > 0,
	};
}
