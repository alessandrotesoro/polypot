import path from "node:path";
import type { PotAnalysis, PotSourceString } from "./pot.js";

const ESTIMATED_CHARS_PER_TOKEN = 4;
const ESTIMATED_OUTPUT_TOKEN_MULTIPLIER = 1.35;
const PREVIEW_COST_PER_1000_TOKENS = 0.002;
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

export interface TranslationEstimate {
	readonly cost: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
}

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

function getOutputFile(
	options: TranslateWorkloadOptions,
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
	const normalized = language.replaceAll("-", "_");
	const languageCode = normalized.split("_")[0] ?? normalized;

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
): TranslationEstimate {
	const inputTokens = Math.ceil(sourceCharacters / ESTIMATED_CHARS_PER_TOKEN);
	const outputTokens = Math.ceil(
		inputTokens * ESTIMATED_OUTPUT_TOKEN_MULTIPLIER,
	);
	const totalTokens = inputTokens + outputTokens;

	return {
		cost: (totalTokens / 1000) * PREVIEW_COST_PER_1000_TOKENS,
		inputTokens,
		outputTokens,
		totalTokens,
	};
}

function addEstimates(
	first: TranslationEstimate,
	second: TranslationEstimate,
): TranslationEstimate {
	return {
		cost: first.cost + second.cost,
		inputTokens: first.inputTokens + second.inputTokens,
		outputTokens: first.outputTokens + second.outputTokens,
		totalTokens: first.totalTokens + second.totalTokens,
	};
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
): TranslationEstimate {
	return estimateSourceCharacters(prefixCharacterTotals[count] ?? 0);
}

function selectStringCountWithinBudget(
	prefixCharacterTotals: readonly number[],
	maxCount: number,
	remainingCost: number,
): number {
	if (remainingCost <= 0) return 0;

	let low = 0;
	let high = maxCount;

	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (
			estimatePrefix(prefixCharacterTotals, middle).cost <= remainingCost
		) {
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
	let totalEstimate: TranslationEstimate = {
		cost: 0,
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	};
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
					);
		const estimate = estimatePrefix(prefixCharacterTotals, plannedStrings);
		const batches =
			plannedStrings === 0
				? 0
				: Math.ceil(plannedStrings / options.batchSize);
		const skippedByCost = stringLimit - plannedStrings;
		const skippedByLimit = analysis.totalStrings - stringLimit;

		remainingStrings -= plannedStrings;
		remainingCost -= estimate.cost;
		totalBatches += batches;
		totalEstimate = addEstimates(totalEstimate, estimate);
		totalPlannedStrings += plannedStrings;
		totalSkippedByCost += skippedByCost;
		totalSkippedByLimit += skippedByLimit;

		languages.push({
			batches,
			estimate,
			language,
			outputFile: getOutputFile(options, language),
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
