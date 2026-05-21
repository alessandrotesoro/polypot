const PATH_LIKE_LANGUAGE_PATTERN = /[\\/]|(^[a-zA-Z]:)|\.\./;

export const LANGUAGE_VALUE_ERROR =
	"Language values cannot be blank or contain path separators, drive prefixes, or dot segments.";

export function isSafeLanguageValue(value: string): boolean {
	const normalized = value.trim();

	return (
		normalized.length > 0 &&
		normalized === value &&
		!PATH_LIKE_LANGUAGE_PATTERN.test(normalized)
	);
}
