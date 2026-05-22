import fs from "node:fs/promises";
import path from "node:path";
import type { PotEntry } from "./pot.js";

export interface DictionaryMatch {
	readonly source: string;
	readonly target: string;
}

export type TranslationDictionary = Readonly<Record<string, string>>;

export interface DictionaryLoadResult {
	readonly dictionary: TranslationDictionary;
	readonly filePath?: string;
	readonly warning?: string;
}

function getCandidatePaths(
	dictionaryPath: string,
	targetLanguage: string,
): readonly string[] {
	const language = targetLanguage.toLowerCase().replaceAll("_", "-");
	const baseLanguage = language.split("-")[0] ?? language;
	const candidates = [
		path.join(dictionaryPath, `dictionary-${language}.json`),
		path.join(dictionaryPath, `dictionary-${baseLanguage}.json`),
		path.join(dictionaryPath, "dictionary.json"),
	];

	return [...new Set(candidates)];
}

function isStringRecord(value: unknown): value is Record<string, string> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	return Object.entries(value).every(
		([key, item]) =>
			key.trim().length > 0 &&
			typeof item === "string" &&
			item.trim().length > 0,
	);
}

function normalizeDictionary(
	dictionary: Record<string, string>,
): TranslationDictionary {
	const normalized: Record<string, string> = {};

	for (const [source, target] of Object.entries(dictionary)) {
		normalized[source.toLowerCase()] = target;
	}

	return normalized;
}

export async function loadDictionary(options: {
	readonly dictionaryPath: string;
	readonly targetLanguage: string;
}): Promise<DictionaryLoadResult> {
	for (const filePath of getCandidatePaths(
		options.dictionaryPath,
		options.targetLanguage,
	)) {
		try {
			const content = await fs.readFile(filePath, "utf8");
			const parsed: unknown = JSON.parse(content);
			if (!isStringRecord(parsed)) {
				return {
					dictionary: {},
					filePath,
					warning:
						"Dictionary must be a JSON object with non-empty string values.",
				};
			}

			return {
				dictionary: normalizeDictionary(parsed),
				filePath,
			};
		} catch (error) {
			const code =
				typeof error === "object" && error !== null && "code" in error
					? error.code
					: undefined;
			if (code === "ENOENT") continue;

			const message =
				error instanceof Error ? error.message : String(error);

			return {
				dictionary: {},
				filePath,
				warning: `Could not load dictionary: ${message}`,
			};
		}
	}

	return { dictionary: {} };
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findDictionaryMatches(
	entries: readonly PotEntry[],
	dictionary: TranslationDictionary,
): readonly DictionaryMatch[] {
	if (entries.length === 0) return [];

	const text = entries
		.map((entry) => [entry.msgid, entry.msgidPlural ?? ""].join(" "))
		.join(" ")
		.toLowerCase();
	const matches: DictionaryMatch[] = [];

	for (const [source, target] of Object.entries(dictionary)) {
		const pattern = new RegExp(`\\b${escapeRegExp(source)}\\b`);
		if (pattern.test(text)) {
			matches.push({ source, target });
		}
	}

	return matches;
}
