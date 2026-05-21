import fs from "node:fs/promises";
import { type GetTextTranslation, po } from "gettext-parser";

export interface PotSourceString {
	readonly characters: number;
	readonly context?: string;
	readonly flags: readonly string[];
	readonly id: string;
	readonly plural: boolean;
}

export interface PotAnalysis {
	readonly charset: string;
	readonly contextStrings: number;
	readonly filePath: string;
	readonly fuzzyStrings: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly pluralStrings: number;
	readonly sourceCharacters: number;
	readonly strings: readonly PotSourceString[];
	readonly totalStrings: number;
}

function getFlags(translation: GetTextTranslation): readonly string[] {
	const flagText = translation.comments?.flag;
	if (flagText === undefined) return [];

	return flagText
		.split(",")
		.map((flag) => flag.trim())
		.filter((flag) => flag.length > 0);
}

function toSourceString(translation: GetTextTranslation): PotSourceString {
	const plural = translation.msgid_plural !== undefined;
	const pluralCharacters = translation.msgid_plural?.length ?? 0;

	return {
		characters: translation.msgid.length + pluralCharacters,
		...(translation.msgctxt !== undefined && {
			context: translation.msgctxt,
		}),
		flags: getFlags(translation),
		id: translation.msgid,
		plural,
	};
}

function isSourceEntry(translation: GetTextTranslation): boolean {
	return translation.msgid.length > 0 && translation.obsolete !== true;
}

export async function analyzePotFile(filePath: string): Promise<PotAnalysis> {
	const content = await fs.readFile(filePath);
	const parsed = po.parse(content, { validation: false });
	const stats = {
		contextStrings: 0,
		fuzzyStrings: 0,
		pluralStrings: 0,
		sourceCharacters: 0,
		strings: [] as PotSourceString[],
	};

	for (const translation of Object.values(parsed.translations).flatMap(
		(context) => Object.values(context),
	)) {
		if (!isSourceEntry(translation)) continue;

		const sourceString = toSourceString(translation);
		stats.strings.push(sourceString);
		stats.sourceCharacters += sourceString.characters;
		if (sourceString.context !== undefined) stats.contextStrings += 1;
		if (sourceString.flags.includes("fuzzy")) stats.fuzzyStrings += 1;
		if (sourceString.plural) stats.pluralStrings += 1;
	}

	return {
		charset: parsed.charset,
		contextStrings: stats.contextStrings,
		filePath,
		fuzzyStrings: stats.fuzzyStrings,
		headers: parsed.headers,
		pluralStrings: stats.pluralStrings,
		sourceCharacters: stats.sourceCharacters,
		strings: stats.strings,
		totalStrings: stats.strings.length,
	};
}
