import type { PotEntry } from "./pot.js";

const PRINTF_PLACEHOLDER_PATTERN =
	/%(?:\d+\$[-+0 '#]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[bcdeEfFgGosuxX]|[-+0 '#]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[bcdeEfFgGosuxX](?![A-Za-z]))/g;
const NUMERIC_PLACEHOLDER_PATTERN =
	/^%(?:\d+\$)?[-+0 '#]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[dfueEfFgGuxX]$/;
const TAG_TOKEN_PATTERN = /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*?)?\/?>/g;
const SHORTCODE_TOKEN_PATTERN =
	/\[(?:\/[A-Za-z][A-Za-z0-9_:-]*|[A-Za-z][A-Za-z0-9_:-]*(?:(?:\s+[^\]\s=]+=(?:"[^"]*"|'[^']*'|[^\]\s]+))*\s*\/?)?)\]/g;

export interface ProtectedTokens {
	readonly printf: readonly string[];
	readonly shortcodes: readonly string[];
	readonly tags: readonly string[];
}

export interface TranslationValidationIssue {
	readonly entryKey: string;
	readonly expected: readonly string[];
	readonly form: number;
	readonly got: readonly string[];
	readonly reason:
		| "placeholder_mismatch"
		| "printf_placeholder_mismatch"
		| "plural_form_count"
		| "shortcode_mismatch"
		| "tag_mismatch";
}

export interface TranslationValidationStats {
	readonly blankedStrings: readonly TranslationValidationIssue[];
	readonly placeholderMismatches: number;
	readonly pluralFormIssues: number;
	readonly shortcodeMismatches?: number;
	readonly tagMismatches?: number;
}

export interface ValidatedTranslation {
	readonly issues: readonly TranslationValidationIssue[];
	readonly msgstr: readonly string[];
}

export function createEmptyValidationStats(): TranslationValidationStats {
	return {
		blankedStrings: [],
		placeholderMismatches: 0,
		pluralFormIssues: 0,
		shortcodeMismatches: 0,
		tagMismatches: 0,
	};
}

export function extractPlaceholders(value: string): readonly string[] {
	return (
		value
			.replaceAll("%%", "\u0000\u0000")
			.match(PRINTF_PLACEHOLDER_PATTERN) ?? []
	);
}

export function extractProtectedTokens(value: string): ProtectedTokens {
	return {
		printf: extractPlaceholders(value),
		shortcodes: value.match(SHORTCODE_TOKEN_PATTERN) ?? [],
		tags: value.match(TAG_TOKEN_PATTERN) ?? [],
	};
}

function hasExplicitPosition(placeholder: string): boolean {
	return /^%\d+\$/.test(placeholder);
}

function placeholdersMatch(
	expected: readonly string[],
	got: readonly string[],
): boolean {
	if (arraysEqual(expected, got)) return true;
	if (
		expected.length > 0 &&
		expected.every(hasExplicitPosition) &&
		got.every(hasExplicitPosition)
	) {
		return arraysEqual([...expected].sort(), [...got].sort());
	}

	return false;
}

function countValues(values: readonly string[]): Map<string, number> {
	const counts = new Map<string, number>();

	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}

	return counts;
}

function arraysEqual(
	first: readonly string[],
	second: readonly string[],
): boolean {
	if (first.length !== second.length) return false;

	return first.every((value, index) => value === second[index]);
}

function canDropNumericPlaceholders(options: {
	readonly expected: readonly string[];
	readonly form: number;
	readonly got: readonly string[];
	readonly pluralCount: number;
}): boolean {
	const smallCountForm =
		options.form === 0 || (options.pluralCount === 6 && options.form <= 2);
	if (!smallCountForm) return false;

	const expectedCounts = countValues(options.expected);
	const gotCounts = countValues(options.got);

	for (const [placeholder, expectedCount] of expectedCounts) {
		const gotCount = gotCounts.get(placeholder) ?? 0;
		if (gotCount === expectedCount) continue;
		if (gotCount !== 0 || !NUMERIC_PLACEHOLDER_PATTERN.test(placeholder)) {
			return false;
		}
	}

	for (const [placeholder, gotCount] of gotCounts) {
		if (gotCount > (expectedCounts.get(placeholder) ?? 0)) return false;
	}

	return true;
}

function normalizeBoundaryNbsp(value: string, source: string): string {
	if (!value.includes("\u00A0")) return value;

	let result = value;
	const sourceLeading = source.match(/^(\s*)/)?.[1] ?? "";
	const sourceTrailing = source.match(/(\s*)$/)?.[1] ?? "";
	const valueLeading = result.match(/^(\s*)/)?.[1] ?? "";
	const valueTrailing = result.match(/(\s*)$/)?.[1] ?? "";

	if (sourceLeading.length > 0 && valueLeading.includes("\u00A0")) {
		result =
			valueLeading.replaceAll("\u00A0", " ") +
			result.slice(valueLeading.length);
	}

	if (sourceTrailing.length > 0 && valueTrailing.includes("\u00A0")) {
		result =
			result.slice(0, -valueTrailing.length) +
			valueTrailing.replaceAll("\u00A0", " ");
	}

	return result;
}

function getSourceForForm(entry: PotEntry, form: number): string {
	return form === 0 ? entry.msgid : (entry.msgidPlural ?? entry.msgid);
}

function pushMismatchIssue(options: {
	readonly entry: PotEntry;
	readonly expected: readonly string[];
	readonly form: number;
	readonly got: readonly string[];
	readonly issues: TranslationValidationIssue[];
	readonly reason: TranslationValidationIssue["reason"];
}): void {
	options.issues.push({
		entryKey: options.entry.key,
		expected: options.expected,
		form: options.form,
		got: options.got,
		reason: options.reason,
	});
}

export function validateEntryTranslation(options: {
	readonly entry: PotEntry;
	readonly msgstr: readonly string[];
	readonly pluralCount: number;
}): ValidatedTranslation {
	const expectedLength = options.entry.plural ? options.pluralCount : 1;
	const issues: TranslationValidationIssue[] = [];
	const msgstr = Array.from({ length: expectedLength }, (_, index) =>
		normalizeBoundaryNbsp(
			options.msgstr[index] ?? "",
			getSourceForForm(options.entry, index),
		),
	);

	if (options.msgstr.length !== expectedLength) {
		issues.push({
			entryKey: options.entry.key,
			expected: [],
			form: -1,
			got: [],
			reason: "plural_form_count",
		});
	}

	for (let form = 0; form < msgstr.length; form += 1) {
		const translation = msgstr[form];
		if (translation === undefined || translation.length === 0) continue;

		const source = getSourceForForm(options.entry, form);
		const expected = extractProtectedTokens(source);
		const got = extractProtectedTokens(translation);
		const printfValid =
			placeholdersMatch(expected.printf, got.printf) ||
			(options.entry.plural &&
				canDropNumericPlaceholders({
					expected: expected.printf,
					form,
					got: got.printf,
					pluralCount: options.pluralCount,
				}));
		const tagValid = arraysEqual(expected.tags, got.tags);
		const shortcodeValid = arraysEqual(expected.shortcodes, got.shortcodes);

		if (!printfValid || !tagValid || !shortcodeValid) {
			msgstr[form] = "";
		}

		if (!printfValid) {
			pushMismatchIssue({
				entry: options.entry,
				expected: expected.printf,
				form,
				got: got.printf,
				issues,
				reason: "printf_placeholder_mismatch",
			});
		}

		if (!tagValid) {
			pushMismatchIssue({
				entry: options.entry,
				expected: expected.tags,
				form,
				got: got.tags,
				issues,
				reason: "tag_mismatch",
			});
		}

		if (!shortcodeValid) {
			pushMismatchIssue({
				entry: options.entry,
				expected: expected.shortcodes,
				form,
				got: got.shortcodes,
				issues,
				reason: "shortcode_mismatch",
			});
		}
	}

	return {
		issues,
		msgstr,
	};
}

export function summarizeValidationIssues(
	issues: readonly TranslationValidationIssue[],
): TranslationValidationStats {
	return {
		blankedStrings: issues,
		placeholderMismatches: issues.filter(
			(issue) =>
				issue.reason === "printf_placeholder_mismatch" ||
				issue.reason === "placeholder_mismatch",
		).length,
		pluralFormIssues: issues.filter(
			(issue) => issue.reason === "plural_form_count",
		).length,
		shortcodeMismatches: issues.filter(
			(issue) => issue.reason === "shortcode_mismatch",
		).length,
		tagMismatches: issues.filter((issue) => issue.reason === "tag_mismatch")
			.length,
	};
}
