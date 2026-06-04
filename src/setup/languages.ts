interface SetupLanguage {
	readonly value: string;
	readonly label: string;
}

export interface SetupLanguageChoice {
	readonly value: string;
	readonly name: string;
	readonly checked?: boolean;
}

export const SETUP_LANGUAGES: readonly SetupLanguage[] = [
	{ value: "en_US", label: "English (US)" },
	{ value: "it_IT", label: "Italian" },
	{ value: "fr_FR", label: "French (France)" },
	{ value: "es_ES", label: "Spanish (Spain)" },
	{ value: "de_DE", label: "German" },
	{ value: "pt_BR", label: "Portuguese (Brazil)" },
	{ value: "zh_CN", label: "Chinese (Simplified)" },
	{ value: "zh_TW", label: "Chinese (Traditional)" },
	{ value: "ja_JP", label: "Japanese" },
	{ value: "ko_KR", label: "Korean" },
	{ value: "nl_NL", label: "Dutch" },
	{ value: "pl_PL", label: "Polish" },
	{ value: "ru_RU", label: "Russian" },
	{ value: "sv_SE", label: "Swedish" },
	{ value: "tr_TR", label: "Turkish" },
	{ value: "uk_UA", label: "Ukrainian" },
	{ value: "af_ZA", label: "Afrikaans" },
	{ value: "ak_GH", label: "Akan" },
	{ value: "am_ET", label: "Amharic" },
	{ value: "ar_AR", label: "Arabic" },
	{ value: "az_AZ", label: "Azerbaijani" },
	{ value: "be_BY", label: "Belarusian" },
	{ value: "bg_BG", label: "Bulgarian" },
	{ value: "bn_BD", label: "Bengali (Bangladesh)" },
	{ value: "bn_IN", label: "Bengali (India)" },
	{ value: "bs_BA", label: "Bosnian" },
	{ value: "ca_ES", label: "Catalan" },
	{ value: "cs_CZ", label: "Czech" },
	{ value: "cy_GB", label: "Welsh" },
	{ value: "da_DK", label: "Danish" },
	{ value: "de_AT", label: "German (Austria)" },
	{ value: "de_CH", label: "German (Switzerland)" },
	{ value: "el_GR", label: "Greek" },
	{ value: "en_GB", label: "English (UK)" },
	{ value: "en_AU", label: "English (Australia)" },
	{ value: "en_CA", label: "English (Canada)" },
	{ value: "en_NZ", label: "English (New Zealand)" },
	{ value: "en_ZA", label: "English (South Africa)" },
	{ value: "es_MX", label: "Spanish (Mexico)" },
	{ value: "es_AR", label: "Spanish (Argentina)" },
	{ value: "es_CL", label: "Spanish (Chile)" },
	{ value: "es_CO", label: "Spanish (Colombia)" },
	{ value: "es_PE", label: "Spanish (Peru)" },
	{ value: "es_VE", label: "Spanish (Venezuela)" },
	{ value: "et_EE", label: "Estonian" },
	{ value: "eu_ES", label: "Basque" },
	{ value: "fa_IR", label: "Persian" },
	{ value: "fi_FI", label: "Finnish" },
	{ value: "fr_CA", label: "French (Canada)" },
	{ value: "fr_BE", label: "French (Belgium)" },
	{ value: "fr_CH", label: "French (Switzerland)" },
	{ value: "fy_NL", label: "Western Frisian" },
	{ value: "ga_IE", label: "Irish" },
	{ value: "gd_GB", label: "Scottish Gaelic" },
	{ value: "gl_ES", label: "Galician" },
	{ value: "gu_IN", label: "Gujarati" },
	{ value: "he_IL", label: "Hebrew" },
	{ value: "hi_IN", label: "Hindi" },
	{ value: "hr_HR", label: "Croatian" },
	{ value: "hu_HU", label: "Hungarian" },
	{ value: "hy_AM", label: "Armenian" },
	{ value: "id_ID", label: "Indonesian" },
	{ value: "is_IS", label: "Icelandic" },
	{ value: "ka_GE", label: "Georgian" },
	{ value: "kk_KZ", label: "Kazakh" },
	{ value: "km_KH", label: "Khmer" },
	{ value: "kn_IN", label: "Kannada" },
	{ value: "ky_KG", label: "Kyrgyz" },
	{ value: "lb_LU", label: "Luxembourgish" },
	{ value: "lo_LA", label: "Lao" },
	{ value: "lt_LT", label: "Lithuanian" },
	{ value: "lv_LV", label: "Latvian" },
	{ value: "mg_MG", label: "Malagasy" },
	{ value: "mk_MK", label: "Macedonian" },
	{ value: "ml_IN", label: "Malayalam" },
	{ value: "mn_MN", label: "Mongolian" },
	{ value: "mr_IN", label: "Marathi" },
	{ value: "ms_MY", label: "Malay" },
	{ value: "mt_MT", label: "Maltese" },
	{ value: "my_MM", label: "Burmese" },
	{ value: "nb_NO", label: "Norwegian (Bokmal)" },
	{ value: "ne_NP", label: "Nepali" },
	{ value: "nl_BE", label: "Dutch (Belgium)" },
	{ value: "nn_NO", label: "Norwegian (Nynorsk)" },
	{ value: "no_NO", label: "Norwegian" },
	{ value: "or_IN", label: "Oriya" },
	{ value: "pa_IN", label: "Punjabi" },
	{ value: "pt_PT", label: "Portuguese (Portugal)" },
	{ value: "ro_RO", label: "Romanian" },
	{ value: "sa_IN", label: "Sanskrit" },
	{ value: "sd_PK", label: "Sindhi" },
	{ value: "sk_SK", label: "Slovak" },
	{ value: "sl_SI", label: "Slovenian" },
	{ value: "sq_AL", label: "Albanian" },
	{ value: "sr_RS", label: "Serbian" },
	{ value: "sw_KE", label: "Swahili" },
	{ value: "ta_IN", label: "Tamil" },
	{ value: "ta_LK", label: "Tamil (Sri Lanka)" },
	{ value: "te_IN", label: "Telugu" },
	{ value: "tg_TJ", label: "Tajik" },
	{ value: "th_TH", label: "Thai" },
	{ value: "ur_PK", label: "Urdu" },
	{ value: "uz_UZ", label: "Uzbek" },
	{ value: "vi_VN", label: "Vietnamese" },
	{ value: "yo_NG", label: "Yoruba" },
	{ value: "zh_HK", label: "Chinese (Hong Kong)" },
	{ value: "zh_SG", label: "Chinese (Singapore)" },
	{ value: "zu_ZA", label: "Zulu" },
] as const;

const DEFAULT_LOCALE_BY_BASE: Readonly<Record<string, string>> = {
	af: "af_ZA",
	ar: "ar_AR",
	az: "az_AZ",
	be: "be_BY",
	bg: "bg_BG",
	bn: "bn_BD",
	bs: "bs_BA",
	ca: "ca_ES",
	cs: "cs_CZ",
	cy: "cy_GB",
	da: "da_DK",
	de: "de_DE",
	el: "el_GR",
	en: "en_US",
	es: "es_ES",
	et: "et_EE",
	eu: "eu_ES",
	fa: "fa_IR",
	fi: "fi_FI",
	fr: "fr_FR",
	fy: "fy_NL",
	ga: "ga_IE",
	gd: "gd_GB",
	gl: "gl_ES",
	gu: "gu_IN",
	he: "he_IL",
	hi: "hi_IN",
	hr: "hr_HR",
	hu: "hu_HU",
	hy: "hy_AM",
	id: "id_ID",
	is: "is_IS",
	it: "it_IT",
	ja: "ja_JP",
	ka: "ka_GE",
	kk: "kk_KZ",
	km: "km_KH",
	kn: "kn_IN",
	ko: "ko_KR",
	ky: "ky_KG",
	lb: "lb_LU",
	lo: "lo_LA",
	lt: "lt_LT",
	lv: "lv_LV",
	mg: "mg_MG",
	mk: "mk_MK",
	ml: "ml_IN",
	mn: "mn_MN",
	mr: "mr_IN",
	ms: "ms_MY",
	mt: "mt_MT",
	my: "my_MM",
	nb: "nb_NO",
	ne: "ne_NP",
	nl: "nl_NL",
	nn: "nn_NO",
	no: "no_NO",
	or: "or_IN",
	pa: "pa_IN",
	pl: "pl_PL",
	pt: "pt_PT",
	ro: "ro_RO",
	ru: "ru_RU",
	sa: "sa_IN",
	sd: "sd_PK",
	sk: "sk_SK",
	sl: "sl_SI",
	sq: "sq_AL",
	sr: "sr_RS",
	sv: "sv_SE",
	sw: "sw_KE",
	ta: "ta_IN",
	te: "te_IN",
	tg: "tg_TJ",
	th: "th_TH",
	tr: "tr_TR",
	uk: "uk_UA",
	ur: "ur_PK",
	uz: "uz_UZ",
	vi: "vi_VN",
	yo: "yo_NG",
	zh: "zh_CN",
	zu: "zu_ZA",
};

const ISO_639_2_BY_BASE: Readonly<Record<string, string>> = {
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

const languageByValue = new Map(
	SETUP_LANGUAGES.map((language) => [language.value, language]),
);

function aliasKey(value: string): string {
	return value.trim().toLowerCase().replaceAll("_", "-");
}

function addAlias(
	aliases: Map<string, string>,
	alias: string | undefined,
	canonical: string,
): void {
	if (alias === undefined || alias.trim().length === 0) return;
	const key = aliasKey(alias);
	if (!aliases.has(key)) aliases.set(key, canonical);
}

function baseLanguage(value: string): string {
	return value.split("_")[0] ?? value;
}

function labelWithoutRegion(label: string): string {
	return label.replace(/\s+\([^)]*\)$/u, "");
}

function buildLanguageAliases(): ReadonlyMap<string, string> {
	const aliases = new Map<string, string>();

	for (const language of SETUP_LANGUAGES) {
		const base = baseLanguage(language.value);
		const defaultLocale = DEFAULT_LOCALE_BY_BASE[base] ?? language.value;

		addAlias(aliases, language.value, language.value);
		addAlias(aliases, language.value.replaceAll("_", "-"), language.value);
		addAlias(aliases, language.label, language.value);
		addAlias(aliases, labelWithoutRegion(language.label), defaultLocale);
		addAlias(aliases, base, defaultLocale);
		addAlias(aliases, ISO_639_2_BY_BASE[base], defaultLocale);
	}

	return aliases;
}

const languageAliases = buildLanguageAliases();

export function normalizeSetupLanguageInput(value: string): string {
	const trimmed = value.trim();
	const canonical = languageAliases.get(aliasKey(trimmed));

	return canonical ?? trimmed;
}

export function normalizeSetupLanguageValues(
	values: readonly string[],
): string[] {
	return values.map(normalizeSetupLanguageInput);
}

/**
 * Trim locale values and drop blanks.
 *
 * @param values Values to normalize.
 * @returns Trimmed, non-empty locale values.
 */
function normalizedValues(values: readonly string[]): string[] {
	return values
		.map(normalizeSetupLanguageInput)
		.filter((value) => value.length > 0);
}

/**
 * Format a locale code for setup prompts.
 *
 * @param value Value to parse or format.
 * @returns Formatted locale label.
 */
export function formatSetupLanguage(value: string): string {
	const normalized = normalizeSetupLanguageInput(value);
	const language = languageByValue.get(normalized);
	return language === undefined
		? `${normalized} (custom)`
		: `${language.label} (${language.value})`;
}

export function getSetupLanguageDisplayName(value: string): string {
	const normalized = normalizeSetupLanguageInput(value);

	return languageByValue.get(normalized)?.label ?? normalized;
}

/**
 * Build setup prompt choices for locales.
 *
 * @param options Options for the operation.
 * @returns Choices for the setup prompt.
 */
export function setupLanguageChoices(
	options: { readonly selected?: readonly string[] } = {},
): SetupLanguageChoice[] {
	const selected = new Set(normalizedValues(options.selected ?? []));
	const choices = SETUP_LANGUAGES.map((language) => ({
		value: language.value,
		name: formatSetupLanguage(language.value),
		...(selected.has(language.value) && { checked: true }),
	}));

	for (const value of selected) {
		if (!languageByValue.has(value)) {
			choices.push({
				value,
				name: formatSetupLanguage(value),
				checked: true,
			});
		}
	}

	return choices;
}
