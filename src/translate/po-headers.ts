import fs from "node:fs/promises";
import { getPluralForms, getPoHeaderLocale } from "./locales.js";

export interface PoHeaderTemplateResult {
	readonly headers: Readonly<Record<string, string>>;
	readonly warning?: string;
}

const DYNAMIC_HEADER_KEYS = new Set([
	"Language",
	"Plural-Forms",
	"PO-Revision-Date",
]);

function isStringRecord(value: unknown): value is Record<string, string> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	return Object.values(value).every((item) => typeof item === "string");
}

function replaceLanguagePlaceholder(
	value: string,
	targetLanguage: string,
): string {
	return value.replaceAll("{{LANGUAGE}}", targetLanguage);
}

function getRevisionDate(date: Date): string {
	return `${date.toISOString().slice(0, 16).replace("T", " ")}+0000`;
}

export async function loadPoHeaderTemplate(
	filePath: string,
): Promise<PoHeaderTemplateResult> {
	try {
		const raw = await fs.readFile(filePath, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (!isStringRecord(parsed)) {
			return {
				headers: {},
				warning:
					"PO header template must be a JSON object with string values.",
			};
		}

		return { headers: parsed };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return {
			headers: {},
			warning: `Could not read PO header template: ${message}`,
		};
	}
}

export function buildPoHeaders(options: {
	readonly baseHeaders?: Readonly<Record<string, string>>;
	readonly date?: Date;
	readonly targetLanguage: string;
	readonly templateHeaders?: Readonly<Record<string, string>>;
}): Record<string, string> {
	const targetLanguage = options.targetLanguage;
	const merged = {
		...(options.baseHeaders ?? {}),
		...(options.templateHeaders ?? {}),
	};
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
