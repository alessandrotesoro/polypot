import path from "node:path";
import { getBaseLanguage, normalizeLocale } from "./locales.js";
import type { PotAnalysis } from "./pot.js";

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

export interface LanguageWorkPlan {
	readonly batches: number;
	readonly language: string;
	readonly outputFile: string;
	readonly plannedStrings: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
}

export interface TranslatePreviewWorkload {
	readonly analysis: PotAnalysis;
	readonly batches: number;
	readonly languages: readonly LanguageWorkPlan[];
	readonly plannedStrings: number;
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

export function buildTranslateWorkload(
	options: TranslateWorkloadOptions,
	analysis: PotAnalysis,
): TranslatePreviewWorkload {
	let remainingStrings = options.maxTotalStrings ?? Number.POSITIVE_INFINITY;
	const languages: LanguageWorkPlan[] = [];
	let totalBatches = 0;
	let totalPlannedStrings = 0;
	let totalSkippedByLimit = 0;

	for (const language of options.languages) {
		const stringLimit = Math.min(
			analysis.totalStrings,
			options.maxStringsPerJob ?? analysis.totalStrings,
			remainingStrings,
		);
		const plannedStrings = stringLimit;
		const batches =
			plannedStrings === 0
				? 0
				: Math.ceil(plannedStrings / options.batchSize);
		const skippedByLimit = analysis.totalStrings - stringLimit;

		remainingStrings -= plannedStrings;
		totalBatches += batches;
		totalPlannedStrings += plannedStrings;
		totalSkippedByLimit += skippedByLimit;

		languages.push({
			batches,
			language,
			outputFile: buildTranslateOutputFile(options, language),
			plannedStrings,
			skippedByLimit,
			sourceStrings: analysis.totalStrings,
		});
	}

	return {
		analysis,
		batches: totalBatches,
		languages,
		plannedStrings: totalPlannedStrings,
		skippedByLimit: totalSkippedByLimit,
		sourceStrings: analysis.totalStrings * options.languages.length,
	};
}
