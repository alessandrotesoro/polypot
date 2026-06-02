import type { GetTextTranslation } from "gettext-parser";
import type { PotEntry } from "./pot.js";

const DRY_RUN_PREFIX = "[DRY RUN]";

export interface TranslationCompletenessOptions {
	readonly entry: Pick<PotEntry, "plural">;
	readonly msgstr: readonly string[] | undefined;
	readonly pluralCount: number;
	readonly translationFlags?: readonly string[];
}

export function getTranslationFlags(
	translation: Pick<GetTextTranslation, "comments"> | undefined,
): readonly string[] {
	const flagText = translation?.comments?.flag;
	if (flagText === undefined) return [];

	return flagText
		.split(",")
		.map((flag) => flag.trim())
		.filter((flag) => flag.length > 0);
}

function isUsableTranslationValue(value: string | undefined): boolean {
	const trimmed = value?.trim() ?? "";
	return trimmed.length > 0 && !trimmed.startsWith(DRY_RUN_PREFIX);
}

export function isCompleteExistingTranslation(
	options: TranslationCompletenessOptions,
): boolean {
	if ((options.translationFlags ?? []).includes("fuzzy")) return false;
	if (options.msgstr === undefined || options.msgstr.length === 0) {
		return false;
	}

	const requiredSlots = options.entry.plural ? options.pluralCount : 1;
	for (let index = 0; index < requiredSlots; index += 1) {
		if (!isUsableTranslationValue(options.msgstr[index])) return false;
	}

	return true;
}

export function entryNeedsTranslation(
	entry: PotEntry,
	options: { readonly pluralCount?: number } = {},
): boolean {
	const pluralCount = options.pluralCount ?? Math.max(1, entry.msgstr.length);

	return !isCompleteExistingTranslation({
		entry,
		msgstr: entry.msgstr,
		pluralCount,
		translationFlags: entry.flags,
	});
}
