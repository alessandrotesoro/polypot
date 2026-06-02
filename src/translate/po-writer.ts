import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	type GetTextTranslation,
	type GetTextTranslations,
	po,
} from "gettext-parser";
import {
	getTranslationFlags,
	isCompleteExistingTranslation,
} from "./completeness.js";
import { getPluralCount, getPluralForms } from "./locales.js";
import {
	buildPoHeaders,
	loadPoHeaderTemplate,
	type PoHeaderTemplateResult,
} from "./po-headers.js";
import type { PotDocument, PotEntry } from "./pot.js";
import type { ParsedTranslation } from "./xml.js";

export interface ExistingPoMergeResult {
	readonly mergedStrings: number;
	readonly output: GetTextTranslations;
}

export interface PoOutputDocument {
	readonly data: GetTextTranslations;
	readonly headerTemplate: PoHeaderTemplateResult;
	readonly pluralCount: number;
}

function cloneTranslations(data: GetTextTranslations): GetTextTranslations {
	return structuredClone(data);
}

function getContext(
	data: GetTextTranslations,
	context: string,
): Record<string, GetTextTranslation> | undefined {
	return data.translations[context];
}

function getTranslation(
	data: GetTextTranslations,
	entry: PotEntry,
): GetTextTranslation | undefined {
	return getContext(data, entry.context)?.[entry.msgid];
}

function resizePluralForms(
	msgstr: readonly string[],
	pluralCount: number,
): string[] {
	return Array.from(
		{ length: pluralCount },
		(_, index) => msgstr[index] ?? "",
	);
}

function removeFuzzyFlag(translation: GetTextTranslation): void {
	if (translation.comments?.flag === undefined) return;

	const flags = translation.comments.flag
		.split(",")
		.map((flag) => flag.trim())
		.filter((flag) => flag.length > 0 && flag !== "fuzzy");

	if (flags.length > 0) {
		translation.comments.flag = flags.join(", ");
		return;
	}

	delete translation.comments.flag;
	if (Object.keys(translation.comments).length === 0) {
		delete translation.comments;
	}
}

function initializeTargetEntries(
	data: GetTextTranslations,
	entries: readonly PotEntry[],
	pluralCount: number,
): void {
	for (const entry of entries) {
		const translation = getTranslation(data, entry);
		if (translation === undefined) continue;

		translation.msgstr = entry.plural
			? Array.from({ length: pluralCount }, () => "")
			: [""];
	}
}

export async function readPoFile(
	filePath: string,
): Promise<GetTextTranslations> {
	const content = await fs.readFile(filePath);
	return po.parse(content, { validation: false });
}

export async function createPoOutputDocument(options: {
	readonly document: PotDocument;
	readonly poHeaderTemplatePath?: string;
	readonly targetLanguage: string;
}): Promise<PoOutputDocument> {
	const data = cloneTranslations(options.document.parsed);
	const pluralForms = getPluralForms(options.targetLanguage);
	const pluralCount = getPluralCount(pluralForms);
	const headerTemplate =
		options.poHeaderTemplatePath === undefined
			? { headers: {} }
			: await loadPoHeaderTemplate(options.poHeaderTemplatePath);

	data.headers = buildPoHeaders({
		baseHeaders: data.headers,
		targetLanguage: options.targetLanguage,
		templateHeaders: headerTemplate.headers,
	});
	data.charset = "utf-8";
	initializeTargetEntries(data, options.document.entries, pluralCount);

	return {
		data,
		headerTemplate,
		pluralCount,
	};
}

export function mergeExistingPoData(options: {
	readonly entries: readonly PotEntry[];
	readonly existing: GetTextTranslations;
	readonly output: GetTextTranslations;
	readonly pluralCount: number;
}): ExistingPoMergeResult {
	const output = cloneTranslations(options.output);
	let mergedStrings = 0;

	for (const entry of options.entries) {
		const existing = getTranslation(options.existing, entry);
		const target = getTranslation(output, entry);
		if (
			existing === undefined ||
			target === undefined ||
			!isCompleteExistingTranslation({
				entry,
				msgstr: existing.msgstr,
				pluralCount: options.pluralCount,
				translationFlags: getTranslationFlags(existing),
			})
		) {
			continue;
		}

		target.msgstr = entry.plural
			? resizePluralForms(existing.msgstr, options.pluralCount)
			: [existing.msgstr[0] ?? ""];
		removeFuzzyFlag(target);
		mergedStrings += 1;
	}

	return {
		mergedStrings,
		output,
	};
}

export function applyTranslations(options: {
	readonly output: GetTextTranslations;
	readonly translations: readonly ParsedTranslation[];
}): GetTextTranslations {
	for (const item of options.translations) {
		const target = getTranslation(options.output, item.entry);
		if (target !== undefined) {
			target.msgstr = [...item.msgstr];
			removeFuzzyFlag(target);
		}
	}

	return options.output;
}

export function getEntriesWithTranslations(
	entries: readonly PotEntry[],
	output: GetTextTranslations,
): readonly PotEntry[] {
	return entries.map((entry) => ({
		...entry,
		msgstr: getTranslation(output, entry)?.msgstr ?? entry.msgstr,
	}));
}

export async function writePoFile(options: {
	readonly output: GetTextTranslations;
	readonly outputFile: string;
}): Promise<void> {
	const outputDirectory = path.dirname(options.outputFile);
	const temporaryFile = path.join(
		outputDirectory,
		`.${path.basename(options.outputFile)}.${process.pid}.${crypto.randomUUID()}.tmp`,
	);
	await fs.mkdir(outputDirectory, { recursive: true });
	const handle = await fs.open(temporaryFile, "w");

	try {
		await handle.writeFile(po.compile(options.output));
		await handle.sync();
		await handle.close();
		await fs.rename(temporaryFile, options.outputFile);
	} catch (error) {
		await handle.close().catch(() => undefined);
		await fs.rm(temporaryFile, { force: true });
		throw error;
	}
}
