import {
	getSetupLanguageDisplayName,
	normalizeSetupLanguageInput,
	normalizeSetupLanguageValues,
} from "./setup/languages.js";

const PATH_LIKE_LANGUAGE_PATTERN = /[\\/]|(^[a-zA-Z]:)|\.\./;

export const LANGUAGE_VALUE_ERROR =
	"Language values cannot be blank or contain path separators, drive prefixes, dot segments, or control characters.";

function hasControlCharacter(value: string): boolean {
	return Array.from(value).some((character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127;
	});
}

export function isSafeLanguageValue(value: string): boolean {
	const normalized = value.trim();

	return (
		normalized.length > 0 &&
		!hasControlCharacter(normalized) &&
		!PATH_LIKE_LANGUAGE_PATTERN.test(normalized)
	);
}

export function normalizeLanguageValue(value: string): string {
	return normalizeSetupLanguageInput(value);
}

export function normalizeLanguageValues(
	values: readonly string[],
): readonly string[] {
	return normalizeSetupLanguageValues(values);
}

export function getLanguageDisplayName(value: string): string {
	return getSetupLanguageDisplayName(value);
}
