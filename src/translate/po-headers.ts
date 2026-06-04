import { getPluralForms, getPoHeaderLocale } from "./locales.js";

const DYNAMIC_HEADER_KEYS = new Set([
	"Language",
	"Plural-Forms",
	"PO-Revision-Date",
]);

function replaceLanguagePlaceholder(
	value: string,
	targetLanguage: string,
): string {
	return value.replaceAll("{{LANGUAGE}}", targetLanguage);
}

function getRevisionDate(date: Date): string {
	return `${date.toISOString().slice(0, 16).replace("T", " ")}+0000`;
}

export function buildPoHeaders(options: {
	readonly baseHeaders?: Readonly<Record<string, string>>;
	readonly date?: Date;
	readonly targetLanguage: string;
}): Record<string, string> {
	const targetLanguage = options.targetLanguage;
	const merged = options.baseHeaders ?? {};
	const headers: Record<string, string> = {};

	for (const [key, value] of Object.entries(merged)) {
		if (DYNAMIC_HEADER_KEYS.has(key)) continue;
		headers[key] = replaceLanguagePlaceholder(value, targetLanguage);
	}

	return {
		...headers,
		Language: getPoHeaderLocale(targetLanguage),
		"PO-Revision-Date": getRevisionDate(options.date ?? new Date()),
		"Plural-Forms": getPluralForms(targetLanguage),
	};
}
