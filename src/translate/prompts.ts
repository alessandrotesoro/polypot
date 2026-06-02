import fs from "node:fs/promises";
import type { DictionaryMatch } from "./dictionary.js";
import type { PotEntry } from "./pot.js";
import { extractProtectedTokens } from "./validation.js";
import { escapeXml } from "./xml.js";

const DEFAULT_TRANSLATION_PROMPT = `You are a professional software localization translator.
Translate the user's XML source entries into the requested target language.
Preserve placeholders, HTML tags, bracket tokens, whitespace, and XML response structure.
Return only <t i="N">...</t> response tags.`;

export interface PromptTemplateResult {
	readonly prompt: string;
	readonly warning?: string;
}

export interface XmlPromptResult {
	readonly dictionaryCount: number;
	readonly xmlPrompt: string;
}

function replacePromptVariables(options: {
	readonly pluralCount: number;
	readonly sourceLanguage: string;
	readonly targetLanguage: string;
	readonly template: string;
}): string {
	return options.template
		.replaceAll("{{SOURCE_LANGUAGE}}", options.sourceLanguage)
		.replaceAll("{{TARGET_LANGUAGE}}", options.targetLanguage)
		.replaceAll("{{TARGET_LANGUAGE_CODE}}", options.targetLanguage)
		.replaceAll("{{PLURAL_COUNT}}", String(options.pluralCount));
}

function getPlaceholderAttribute(entry: PotEntry): string {
	const sourceTokens = [
		extractProtectedTokens(entry.msgid),
		extractProtectedTokens(entry.msgidPlural ?? ""),
	];
	const placeholders = [
		...sourceTokens.flatMap((tokens) => tokens.printf),
		...sourceTokens.flatMap((tokens) => tokens.tags),
		...sourceTokens.flatMap((tokens) => tokens.shortcodes),
	];

	return placeholders.length === 0
		? "none"
		: [...new Set(placeholders)].join(",");
}

function getEntryAttributes(entry: PotEntry, index: number): string {
	const attributes = [
		`i="${index}"`,
		`placeholders="${escapeXml(getPlaceholderAttribute(entry))}"`,
	];

	if (entry.extractedComments !== undefined) {
		attributes.push(`c="${escapeXml(entry.extractedComments)}"`);
	}

	if (entry.msgctxt !== undefined) {
		attributes.push(`context="${escapeXml(entry.msgctxt)}"`);
	}

	return attributes.join(" ");
}

export async function loadPromptTemplate(
	filePath: string | undefined,
): Promise<PromptTemplateResult> {
	if (filePath === undefined) return { prompt: DEFAULT_TRANSLATION_PROMPT };

	try {
		return { prompt: await fs.readFile(filePath, "utf8") };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return {
			prompt: DEFAULT_TRANSLATION_PROMPT,
			warning: `Could not read prompt template: ${message}`,
		};
	}
}

export function buildSystemPrompt(options: {
	readonly pluralCount: number;
	readonly sourceLanguage: string;
	readonly targetLanguage: string;
	readonly template: string;
}): string {
	return replacePromptVariables(options);
}

export function buildDictionaryResponse(
	matches: readonly DictionaryMatch[],
): string {
	return matches
		.map(
			(match, index) =>
				`<t i="${index + 1}">${escapeXml(match.target)}</t>`,
		)
		.join("\n");
}

export function buildXmlPrompt(options: {
	readonly dictionaryMatches?: readonly DictionaryMatch[];
	readonly entries: readonly PotEntry[];
	readonly pluralCount: number;
	readonly targetLanguage: string;
}): XmlPromptResult {
	const dictionaryMatches = options.dictionaryMatches ?? [];
	const lines = [`Translate to ${options.targetLanguage}:`, ""];

	for (const [index, match] of dictionaryMatches.entries()) {
		lines.push(
			`<source i="${index + 1}" dictionary="true">${escapeXml(match.source)}</source>`,
		);
	}

	const startIndex = dictionaryMatches.length + 1;
	for (const [index, entry] of options.entries.entries()) {
		const responseIndex = startIndex + index;
		const attributes = getEntryAttributes(entry, responseIndex);
		if (entry.msgidPlural !== undefined) {
			lines.push(
				`<source ${attributes}>`,
				`  <singular>${escapeXml(entry.msgid)}</singular>`,
				`  <plural>${escapeXml(entry.msgidPlural)}</plural>`,
				"</source>",
			);
		} else {
			lines.push(
				`<source ${attributes}>${escapeXml(entry.msgid)}</source>`,
			);
		}
	}

	lines.push("", "Respond:");
	if (options.entries.some((entry) => entry.plural)) {
		const formTags = Array.from(
			{ length: options.pluralCount },
			(_, index) =>
				`<f${index}>translation for form ${index}</f${index}>`,
		).join("");
		lines.push(
			`For plural entries, provide ${options.pluralCount} forms:`,
			`<t i="N">${formTags}</t>`,
			"For singular entries:",
			'<t i="N">translation</t>',
		);
	} else {
		lines.push('<t i="N">translation</t>');
	}

	return {
		dictionaryCount: dictionaryMatches.length,
		xmlPrompt: lines.join("\n"),
	};
}
