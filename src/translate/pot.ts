import fs from "node:fs/promises";
import {
	type GetTextTranslation,
	type GetTextTranslations,
	po,
} from "gettext-parser";

const DEFAULT_CONTEXT = "";

export interface PotSourceString {
	readonly characters: number;
	readonly context?: string;
	readonly flags: readonly string[];
	readonly id: string;
	readonly plural: boolean;
}

export interface PotAnalysis {
	readonly contextStrings: number;
	readonly filePath: string;
	readonly fuzzyStrings: number;
	readonly pluralStrings: number;
	readonly sourceCharacters: number;
	readonly strings: readonly PotSourceString[];
	readonly totalStrings: number;
}

export interface PotEntry {
	readonly characters: number;
	readonly comments?: GetTextTranslation["comments"];
	readonly context: string;
	readonly extractedComments?: string;
	readonly flags: readonly string[];
	readonly key: string;
	readonly msgctxt?: string;
	readonly msgid: string;
	readonly msgidPlural?: string;
	readonly msgstr: readonly string[];
	readonly obsolete: boolean;
	readonly plural: boolean;
	readonly references: readonly string[];
}

export interface PotDocument {
	readonly analysis: PotAnalysis;
	readonly entries: readonly PotEntry[];
	readonly parsed: GetTextTranslations;
}

function getFlags(translation: GetTextTranslation): readonly string[] {
	const flagText = translation.comments?.flag;
	if (flagText === undefined) return [];

	return flagText
		.split(",")
		.map((flag) => flag.trim())
		.filter((flag) => flag.length > 0);
}

function getReferences(translation: GetTextTranslation): readonly string[] {
	const reference = translation.comments?.reference;
	if (reference === undefined) return [];

	return reference
		.split(/\s+/)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

function buildEntryKey(context: string, msgid: string): string {
	return `${context}\u0004${msgid}`;
}

function getCharacters(translation: GetTextTranslation): number {
	return translation.msgid.length + (translation.msgid_plural?.length ?? 0);
}

function toSourceString(entry: PotEntry): PotSourceString {
	return {
		characters: entry.characters,
		...(entry.msgctxt !== undefined && {
			context: entry.msgctxt,
		}),
		flags: entry.flags,
		id: entry.msgid,
		plural: entry.plural,
	};
}

function toPotEntry(
	context: string,
	translation: GetTextTranslation,
): PotEntry {
	const plural = translation.msgid_plural !== undefined;

	return {
		characters: getCharacters(translation),
		...(translation.comments !== undefined && {
			comments: translation.comments,
		}),
		context,
		...(translation.comments?.extracted !== undefined && {
			extractedComments: translation.comments.extracted,
		}),
		flags: getFlags(translation),
		key: buildEntryKey(context, translation.msgid),
		...(translation.msgctxt !== undefined && {
			msgctxt: translation.msgctxt,
		}),
		msgid: translation.msgid,
		...(translation.msgid_plural !== undefined && {
			msgidPlural: translation.msgid_plural,
		}),
		msgstr: translation.msgstr,
		obsolete: translation.obsolete === true,
		plural,
		references: getReferences(translation),
	};
}

function isSourceEntry(translation: GetTextTranslation): boolean {
	return translation.msgid.length > 0 && translation.obsolete !== true;
}

function buildAnalysis(
	filePath: string,
	entries: readonly PotEntry[],
): PotAnalysis {
	const stats = {
		contextStrings: 0,
		fuzzyStrings: 0,
		pluralStrings: 0,
		sourceCharacters: 0,
		strings: [] as PotSourceString[],
	};

	for (const entry of entries) {
		const sourceString = toSourceString(entry);
		stats.strings.push(sourceString);
		stats.sourceCharacters += sourceString.characters;
		if (sourceString.context !== undefined) stats.contextStrings += 1;
		if (sourceString.flags.includes("fuzzy")) stats.fuzzyStrings += 1;
		if (sourceString.plural) stats.pluralStrings += 1;
	}

	return {
		contextStrings: stats.contextStrings,
		filePath,
		fuzzyStrings: stats.fuzzyStrings,
		pluralStrings: stats.pluralStrings,
		sourceCharacters: stats.sourceCharacters,
		strings: stats.strings,
		totalStrings: stats.strings.length,
	};
}

export function entryNeedsTranslation(entry: PotEntry): boolean {
	if (entry.msgstr.length === 0) return true;

	return entry.msgstr.every((value) => {
		const trimmed = value.trim();
		return trimmed.length === 0 || trimmed.startsWith("[DRY RUN]");
	});
}

export function getTranslatableEntries(
	entries: readonly PotEntry[],
	options: { readonly forceTranslate?: boolean } = {},
): readonly PotEntry[] {
	if (options.forceTranslate === true) return entries;

	return entries.filter(entryNeedsTranslation);
}

export async function readPotDocument(filePath: string): Promise<PotDocument> {
	const content = await fs.readFile(filePath);
	const parsed = po.parse(content, { validation: false });
	const entries: PotEntry[] = [];

	for (const [contextKey, context] of Object.entries(parsed.translations)) {
		for (const translation of Object.values(context)) {
			if (!isSourceEntry(translation)) continue;
			entries.push(
				toPotEntry(contextKey || DEFAULT_CONTEXT, translation),
			);
		}
	}

	return {
		analysis: buildAnalysis(filePath, entries),
		entries,
		parsed,
	};
}

export async function analyzePotFile(filePath: string): Promise<PotAnalysis> {
	return (await readPotDocument(filePath)).analysis;
}
