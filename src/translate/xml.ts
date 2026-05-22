import type { PotEntry } from "./pot.js";
import {
	summarizeValidationIssues,
	type TranslationValidationIssue,
	type TranslationValidationStats,
	validateEntryTranslation,
} from "./validation.js";

export interface ParsedTranslation {
	readonly entry: PotEntry;
	readonly msgstr: readonly string[];
}

export interface ParseXmlResponseResult {
	readonly missingEntries: readonly PotEntry[];
	readonly translations: readonly ParsedTranslation[];
	readonly validationStats: TranslationValidationStats;
}

export function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function decodeXml(value: string): string {
	return value
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");
}

function getTranslationBlocks(xml: string): readonly string[] {
	return xml.match(/<t[^>]*>[\s\S]*?<\/t>/g) ?? [];
}

function getResponseIndex(block: string): number | undefined {
	const match = /i="(\d+)"/.exec(block);
	if (match?.[1] === undefined) return undefined;

	return Number.parseInt(match[1], 10);
}

function getFormTranslations(block: string, pluralCount: number): string[] {
	const forms: string[] = [];

	for (let index = 0; index < pluralCount; index += 1) {
		const match = new RegExp(`<f${index}>([\\s\\S]*?)</f${index}>`).exec(
			block,
		);
		forms.push(match?.[1] === undefined ? "" : decodeXml(match[1]));
	}

	return forms;
}

function getSingularTranslation(block: string): string {
	const match = /<t[^>]*>([\s\S]*?)<\/t>/.exec(block);
	if (match?.[1] === undefined) return "";

	return decodeXml(match[1]);
}

export function parseXmlResponse(options: {
	readonly dictionaryCount?: number;
	readonly entries: readonly PotEntry[];
	readonly pluralCount: number;
	readonly xml: string;
}): ParseXmlResponseResult {
	const dictionaryCount = options.dictionaryCount ?? 0;
	const translations = new Map<string, ParsedTranslation>();
	const issues: TranslationValidationIssue[] = [];

	for (const block of getTranslationBlocks(options.xml)) {
		const responseIndex = getResponseIndex(block);
		if (responseIndex === undefined || responseIndex <= dictionaryCount) {
			continue;
		}

		const batchIndex = responseIndex - dictionaryCount - 1;
		const entry = options.entries[batchIndex];
		if (entry === undefined) continue;

		const rawMsgstr =
			entry.plural && block.includes("<f0>")
				? getFormTranslations(block, options.pluralCount)
				: [getSingularTranslation(block)];
		const validated = validateEntryTranslation({
			entry,
			msgstr: rawMsgstr,
			pluralCount: options.pluralCount,
		});
		for (const issue of validated.issues) issues.push(issue);
		translations.set(entry.key, {
			entry,
			msgstr: validated.msgstr,
		});
	}

	const missingEntries = options.entries.filter(
		(entry) => !translations.has(entry.key),
	);

	return {
		missingEntries,
		translations: [...translations.values()],
		validationStats: summarizeValidationIssues(issues),
	};
}
