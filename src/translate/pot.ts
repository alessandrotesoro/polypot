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
	const strings = Object.values(parsed.translations)
		.flatMap((context) => Object.values(context))
		.filter(isSourceEntry)
		.map(toSourceString);

	return {
		charset: parsed.charset,
		contextStrings: strings.filter(
			(sourceString) => sourceString.context !== undefined,
		).length,
		filePath,
		fuzzyStrings: strings.filter((sourceString) =>
			sourceString.flags.includes("fuzzy"),
		).length,
		headers: parsed.headers,
		pluralStrings: strings.filter((sourceString) => sourceString.plural)
			.length,
		sourceCharacters: strings.reduce(
			(total, sourceString) => total + sourceString.characters,
			0,
		),
		strings,
		totalStrings: strings.length,
	};
}
