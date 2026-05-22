import type { PotEntry } from "./pot.js";

const PRINTF_PLACEHOLDER_PATTERN =
	/%(?:\d+\$)?[-+0 '#]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[bcdeEfFgGosuxX]/g;
const NUMERIC_PLACEHOLDER_PATTERN =
	/^%(?:\d+\$)?[-+0 '#]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[dfueEfFgGuxX]$/;

export interface TranslationValidationIssue {
	readonly entryKey: string;
	readonly expected: readonly string[];
	readonly form: number;
	readonly got: readonly string[];
	readonly reason: "placeholder_mismatch" | "plural_form_count";
}

export interface TranslationValidationStats {
	readonly blankedStrings: readonly TranslationValidationIssue[];
	readonly placeholderMismatches: number;
	readonly pluralFormIssues: number;
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
	};
}

export function extractPlaceholders(value: string): readonly string[] {
	return (
		value
			.replaceAll("%%", "\u0000\u0000")
			.match(PRINTF_PLACEHOLDER_PATTERN) ?? []
	);
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

		const expected = extractPlaceholders(
			getSourceForForm(options.entry, form),
		);
		const got = extractPlaceholders(translation);
		const valid =
			placeholdersMatch(expected, got) ||
			(options.entry.plural &&
				canDropNumericPlaceholders({
					expected,
					form,
					got,
					pluralCount: options.pluralCount,
				}));

		if (!valid) {
			msgstr[form] = "";
			issues.push({
				entryKey: options.entry.key,
				expected,
				form,
				got,
				reason: "placeholder_mismatch",
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
			(issue) => issue.reason === "placeholder_mismatch",
		).length,
		pluralFormIssues: issues.filter(
			(issue) => issue.reason === "plural_form_count",
		).length,
	};
}
