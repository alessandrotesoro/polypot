import path from "node:path";
import {
	addTranslationEstimates,
	getKnownCost,
	type TranslationCostEstimator,
	type TranslationEstimate,
	unknownTranslationEstimate,
	ZERO_TRANSLATION_ESTIMATE,
} from "./cost.js";
import { getBaseLanguage, normalizeLocale } from "./locales.js";
import type { PotAnalysis, PotSourceString } from "./pot.js";

const ESTIMATED_CHARS_PER_TOKEN = 4;
const ESTIMATED_OUTPUT_TOKEN_MULTIPLIER = 1.35;
const ISO_639_2_LANGUAGE_CODES: Readonly<Record<string, string>> = {
	af: "afr",
	ak: "aka",
	am: "amh",
	ar: "ara",
	az: "aze",
	be: "bel",
	bg: "bul",
	bn: "ben",
	bs: "bos",
	ca: "cat",
	cs: "ces",
	cy: "cym",
	da: "dan",
	de: "deu",
	el: "ell",
	en: "eng",
	es: "spa",
	et: "est",
	eu: "eus",
	fa: "fas",
	fi: "fin",
	fr: "fra",
	ga: "gle",
	gd: "gla",
	gl: "glg",
	gu: "guj",
	he: "heb",
	hi: "hin",
	hr: "hrv",
	hu: "hun",
	hy: "hye",
	id: "ind",
	is: "isl",
	it: "ita",
	ja: "jpn",
	ka: "kat",
	kk: "kaz",
	km: "khm",
	kn: "kan",
	ko: "kor",
	ky: "kir",
	lb: "ltz",
	lo: "lao",
	lt: "lit",
	lv: "lav",
	mg: "mlg",
	mk: "mkd",
	ml: "mal",
	mn: "mon",
	mr: "mar",
	ms: "msa",
	mt: "mlt",
	my: "mya",
	nb: "nob",
	ne: "nep",
	nl: "nld",
	nn: "nno",
	no: "nor",
	or: "ori",
	pa: "pan",
	pl: "pol",
	pt: "por",
	ro: "ron",
	ru: "rus",
	sa: "san",
	sd: "snd",
	sk: "slk",
	sl: "slv",
	sq: "sqi",
	sr: "srp",
	sv: "swe",
	sw: "swa",
	ta: "tam",
	te: "tel",
	tg: "tgk",
	th: "tha",
	tr: "tur",
	uk: "ukr",
	ur: "urd",
	uz: "uzb",
	vi: "vie",
	yo: "yor",
	zh: "zho",
	zu: "zul",
};

export interface TranslateWorkloadOptions {
	readonly batchSize: number;
	readonly estimateCost?: TranslationCostEstimator;
	readonly languages: readonly string[];
	readonly localeFormat: LocaleFormat;
	readonly maxCost?: number;
	readonly maxStringsPerJob?: number;
	readonly maxTotalStrings?: number;
	readonly outputDir: string;
	readonly poFilePrefix?: string;
}

export type LocaleFormat =
	| "iso_639_1"
	| "iso_639_2"
	| "target_lang"
	| "wp_locale";

export type { TranslationEstimate } from "./cost.js";

export interface LanguageWorkPlan {
	readonly batches: number;
	readonly estimate: TranslationEstimate;
	readonly language: string;
	readonly outputFile: string;
	readonly plannedStrings: number;
	readonly skippedByCost: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
}

export interface TranslatePreviewWorkload {
	readonly analysis: PotAnalysis;
	readonly batches: number;
	readonly estimate: TranslationEstimate;
	readonly languages: readonly LanguageWorkPlan[];
	readonly plannedStrings: number;
	readonly skippedByCost: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
}

export function buildTranslateOutputFile(
	options: Pick<
		TranslateWorkloadOptions,
		"localeFormat" | "outputDir" | "poFilePrefix"
	>,
	language: string,
): string {
	return path.join(
		options.outputDir,
		`${options.poFilePrefix ?? ""}${formatOutputLocale(language, options.localeFormat)}.po`,
	);
}

function formatOutputLocale(
	language: string,
	localeFormat: LocaleFormat,
): string {
	const normalized = normalizeLocale(language);
	const languageCode = getBaseLanguage(language);

	switch (localeFormat) {
		case "target_lang":
			return language;
		case "wp_locale":
			return normalized.includes("_")
				? normalized
				: `${languageCode}_${languageCode.toUpperCase()}`;
		case "iso_639_1":
			return languageCode;
		case "iso_639_2":
			return ISO_639_2_LANGUAGE_CODES[languageCode] ?? languageCode;
		default: {
			const _exhaustive: never = localeFormat;
			return _exhaustive;
		}
	}
}

function estimateSourceCharacters(
	sourceCharacters: number,
	estimateCost: TranslationCostEstimator | undefined,
): TranslationEstimate {
	const inputTokens = Math.ceil(sourceCharacters / ESTIMATED_CHARS_PER_TOKEN);
	const outputTokens = Math.ceil(
		inputTokens * ESTIMATED_OUTPUT_TOKEN_MULTIPLIER,
	);
	if (estimateCost !== undefined) return estimateCost(sourceCharacters);

	return unknownTranslationEstimate({
		inputTokens,
		outputTokens,
		unavailableReason: "Provider-specific price estimate is unavailable.",
	});
}

function buildPrefixCharacterTotals(
	sourceStrings: readonly PotSourceString[],
): readonly number[] {
	const totals = [0];
	for (const sourceString of sourceStrings) {
		totals.push((totals.at(-1) ?? 0) + sourceString.characters);
	}

	return totals;
}

function estimatePrefix(
	prefixCharacterTotals: readonly number[],
	count: number,
	estimateCost: TranslationCostEstimator | undefined,
): TranslationEstimate {
	return estimateSourceCharacters(
		prefixCharacterTotals[count] ?? 0,
		estimateCost,
	);
}

function selectStringCountWithinBudget(
	prefixCharacterTotals: readonly number[],
	maxCount: number,
	remainingCost: number,
	estimateCost: TranslationCostEstimator | undefined,
): number {
	if (remainingCost <= 0) return 0;
	if (estimateCost === undefined) return maxCount;

	let low = 0;
	let high = maxCount;

	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		const estimate = estimatePrefix(
			prefixCharacterTotals,
			middle,
			estimateCost,
		);
		const cost = getKnownCost(estimate);
		if (cost !== undefined && cost <= remainingCost) {
			low = middle;
		} else {
			high = middle - 1;
		}
	}

	return low;
}

export function buildTranslateWorkload(
	options: TranslateWorkloadOptions,
	analysis: PotAnalysis,
): TranslatePreviewWorkload {
	let remainingStrings = options.maxTotalStrings ?? Number.POSITIVE_INFINITY;
	let remainingCost = options.maxCost ?? Number.POSITIVE_INFINITY;
	const prefixCharacterTotals = buildPrefixCharacterTotals(analysis.strings);
	const languages: LanguageWorkPlan[] = [];
	let totalBatches = 0;
	let totalEstimate: TranslationEstimate = ZERO_TRANSLATION_ESTIMATE;
	let totalPlannedStrings = 0;
	let totalSkippedByCost = 0;
	let totalSkippedByLimit = 0;

	for (const language of options.languages) {
		const stringLimit = Math.min(
			analysis.totalStrings,
			options.maxStringsPerJob ?? analysis.totalStrings,
			remainingStrings,
		);
		const plannedStrings =
			options.maxCost === undefined
				? stringLimit
				: selectStringCountWithinBudget(
						prefixCharacterTotals,
						stringLimit,
						remainingCost,
						options.estimateCost,
					);
		const estimate = estimatePrefix(
			prefixCharacterTotals,
			plannedStrings,
			options.estimateCost,
		);
		const batches =
			plannedStrings === 0
				? 0
				: Math.ceil(plannedStrings / options.batchSize);
		const skippedByCost = stringLimit - plannedStrings;
		const skippedByLimit = analysis.totalStrings - stringLimit;

		remainingStrings -= plannedStrings;
		remainingCost -= getKnownCost(estimate) ?? 0;
		totalBatches += batches;
		totalEstimate = addTranslationEstimates(totalEstimate, estimate);
		totalPlannedStrings += plannedStrings;
		totalSkippedByCost += skippedByCost;
		totalSkippedByLimit += skippedByLimit;

		languages.push({
			batches,
			estimate,
			language,
			outputFile: buildTranslateOutputFile(options, language),
			plannedStrings,
			skippedByCost,
			skippedByLimit,
			sourceStrings: analysis.totalStrings,
		});
	}

	return {
		analysis,
		batches: totalBatches,
		estimate: totalEstimate,
		languages,
		plannedStrings: totalPlannedStrings,
		skippedByCost: totalSkippedByCost,
		skippedByLimit: totalSkippedByLimit,
		sourceStrings: analysis.totalStrings * options.languages.length,
	};
}
