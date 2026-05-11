interface SetupLanguage {
  readonly value: string
  readonly label: string
}

export interface SetupLanguageChoice {
  readonly value: string
  readonly name: string
  readonly checked?: boolean
}

export const SETUP_LANGUAGES: readonly SetupLanguage[] = [
  {value: 'en_US', label: 'English (US)'},
  {value: 'it_IT', label: 'Italian'},
  {value: 'fr_FR', label: 'French (France)'},
  {value: 'es_ES', label: 'Spanish (Spain)'},
  {value: 'de_DE', label: 'German'},
  {value: 'pt_BR', label: 'Portuguese (Brazil)'},
  {value: 'zh_CN', label: 'Chinese (Simplified)'},
  {value: 'zh_TW', label: 'Chinese (Traditional)'},
  {value: 'ja_JP', label: 'Japanese'},
  {value: 'ko_KR', label: 'Korean'},
  {value: 'nl_NL', label: 'Dutch'},
  {value: 'pl_PL', label: 'Polish'},
  {value: 'ru_RU', label: 'Russian'},
  {value: 'sv_SE', label: 'Swedish'},
  {value: 'tr_TR', label: 'Turkish'},
  {value: 'uk_UA', label: 'Ukrainian'},
  {value: 'af_ZA', label: 'Afrikaans'},
  {value: 'ak_GH', label: 'Akan'},
  {value: 'am_ET', label: 'Amharic'},
  {value: 'ar_AR', label: 'Arabic'},
  {value: 'az_AZ', label: 'Azerbaijani'},
  {value: 'be_BY', label: 'Belarusian'},
  {value: 'bg_BG', label: 'Bulgarian'},
  {value: 'bn_BD', label: 'Bengali (Bangladesh)'},
  {value: 'bn_IN', label: 'Bengali (India)'},
  {value: 'bs_BA', label: 'Bosnian'},
  {value: 'ca_ES', label: 'Catalan'},
  {value: 'cs_CZ', label: 'Czech'},
  {value: 'cy_GB', label: 'Welsh'},
  {value: 'da_DK', label: 'Danish'},
  {value: 'de_AT', label: 'German (Austria)'},
  {value: 'de_CH', label: 'German (Switzerland)'},
  {value: 'el_GR', label: 'Greek'},
  {value: 'en_GB', label: 'English (UK)'},
  {value: 'en_AU', label: 'English (Australia)'},
  {value: 'en_CA', label: 'English (Canada)'},
  {value: 'en_NZ', label: 'English (New Zealand)'},
  {value: 'en_ZA', label: 'English (South Africa)'},
  {value: 'es_MX', label: 'Spanish (Mexico)'},
  {value: 'es_AR', label: 'Spanish (Argentina)'},
  {value: 'es_CL', label: 'Spanish (Chile)'},
  {value: 'es_CO', label: 'Spanish (Colombia)'},
  {value: 'es_PE', label: 'Spanish (Peru)'},
  {value: 'es_VE', label: 'Spanish (Venezuela)'},
  {value: 'et_EE', label: 'Estonian'},
  {value: 'eu_ES', label: 'Basque'},
  {value: 'fa_IR', label: 'Persian'},
  {value: 'fi_FI', label: 'Finnish'},
  {value: 'fr_CA', label: 'French (Canada)'},
  {value: 'fr_BE', label: 'French (Belgium)'},
  {value: 'fr_CH', label: 'French (Switzerland)'},
  {value: 'fy_NL', label: 'Western Frisian'},
  {value: 'ga_IE', label: 'Irish'},
  {value: 'gd_GB', label: 'Scottish Gaelic'},
  {value: 'gl_ES', label: 'Galician'},
  {value: 'gu_IN', label: 'Gujarati'},
  {value: 'he_IL', label: 'Hebrew'},
  {value: 'hi_IN', label: 'Hindi'},
  {value: 'hr_HR', label: 'Croatian'},
  {value: 'hu_HU', label: 'Hungarian'},
  {value: 'hy_AM', label: 'Armenian'},
  {value: 'id_ID', label: 'Indonesian'},
  {value: 'is_IS', label: 'Icelandic'},
  {value: 'ka_GE', label: 'Georgian'},
  {value: 'kk_KZ', label: 'Kazakh'},
  {value: 'km_KH', label: 'Khmer'},
  {value: 'kn_IN', label: 'Kannada'},
  {value: 'ky_KG', label: 'Kyrgyz'},
  {value: 'lb_LU', label: 'Luxembourgish'},
  {value: 'lo_LA', label: 'Lao'},
  {value: 'lt_LT', label: 'Lithuanian'},
  {value: 'lv_LV', label: 'Latvian'},
  {value: 'mg_MG', label: 'Malagasy'},
  {value: 'mk_MK', label: 'Macedonian'},
  {value: 'ml_IN', label: 'Malayalam'},
  {value: 'mn_MN', label: 'Mongolian'},
  {value: 'mr_IN', label: 'Marathi'},
  {value: 'ms_MY', label: 'Malay'},
  {value: 'mt_MT', label: 'Maltese'},
  {value: 'my_MM', label: 'Burmese'},
  {value: 'nb_NO', label: 'Norwegian (Bokmal)'},
  {value: 'ne_NP', label: 'Nepali'},
  {value: 'nl_BE', label: 'Dutch (Belgium)'},
  {value: 'nn_NO', label: 'Norwegian (Nynorsk)'},
  {value: 'no_NO', label: 'Norwegian'},
  {value: 'or_IN', label: 'Oriya'},
  {value: 'pa_IN', label: 'Punjabi'},
  {value: 'pt_PT', label: 'Portuguese (Portugal)'},
  {value: 'ro_RO', label: 'Romanian'},
  {value: 'sa_IN', label: 'Sanskrit'},
  {value: 'sd_PK', label: 'Sindhi'},
  {value: 'sk_SK', label: 'Slovak'},
  {value: 'sl_SI', label: 'Slovenian'},
  {value: 'sq_AL', label: 'Albanian'},
  {value: 'sr_RS', label: 'Serbian'},
  {value: 'sw_KE', label: 'Swahili'},
  {value: 'ta_IN', label: 'Tamil'},
  {value: 'ta_LK', label: 'Tamil (Sri Lanka)'},
  {value: 'te_IN', label: 'Telugu'},
  {value: 'tg_TJ', label: 'Tajik'},
  {value: 'th_TH', label: 'Thai'},
  {value: 'ur_PK', label: 'Urdu'},
  {value: 'uz_UZ', label: 'Uzbek'},
  {value: 'vi_VN', label: 'Vietnamese'},
  {value: 'yo_NG', label: 'Yoruba'},
  {value: 'zh_HK', label: 'Chinese (Hong Kong)'},
  {value: 'zh_SG', label: 'Chinese (Singapore)'},
  {value: 'zu_ZA', label: 'Zulu'},
] as const

const languageByValue = new Map(SETUP_LANGUAGES.map((language) => [language.value, language]))

function normalizedValues(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0)
}

export function formatSetupLanguage(value: string): string {
  const language = languageByValue.get(value)
  return language === undefined ? `${value} (custom)` : `${language.label} (${language.value})`
}

export function setupLanguageChoices(options: {
  readonly selected?: readonly string[]
} = {}): SetupLanguageChoice[] {
  const selected = new Set(normalizedValues(options.selected ?? []))
  const choices = SETUP_LANGUAGES.map((language) => ({
    value: language.value,
    name: formatSetupLanguage(language.value),
    ...(selected.has(language.value) && {checked: true}),
  }))

  for (const value of selected) {
    if (!languageByValue.has(value)) {
      choices.push({
        value,
        name: formatSetupLanguage(value),
        checked: true,
      })
    }
  }

  return choices
}
