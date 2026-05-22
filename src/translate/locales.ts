export const DEFAULT_PLURAL_FORMS = "nplurals=2; plural=(n != 1);";

const PLURAL_FORMS: Readonly<Record<string, string>> = {
	af: "nplurals=2; plural=(n != 1);",
	ar: "nplurals=6; plural=(n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 ? 4 : 5);",
	az: "nplurals=2; plural=(n != 1);",
	bg_BG: "nplurals=2; plural=(n != 1);",
	bn_BD: "nplurals=2; plural=(n != 1);",
	ca: "nplurals=2; plural=(n != 1);",
	cs: "nplurals=3; plural=(n==1) ? 0 : (n>=2 && n<=4) ? 1 : 2;",
	cs_CZ: "nplurals=3; plural=(n==1) ? 0 : (n>=2 && n<=4) ? 1 : 2;",
	cy: "nplurals=4; plural=(n==1) ? 0 : (n==2) ? 1 : (n != 8 && n != 11) ? 2 : 3;",
	da_DK: "nplurals=2; plural=(n != 1);",
	de: "nplurals=2; plural=(n != 1);",
	de_CH: "nplurals=2; plural=(n != 1);",
	de_DE: "nplurals=2; plural=(n != 1);",
	el: "nplurals=2; plural=(n != 1);",
	en: "nplurals=2; plural=(n != 1);",
	en_AU: "nplurals=2; plural=(n != 1);",
	en_CA: "nplurals=2; plural=(n != 1);",
	en_GB: "nplurals=2; plural=(n != 1);",
	en_US: "nplurals=2; plural=(n != 1);",
	en_ZA: "nplurals=2; plural=(n != 1);",
	eo: "nplurals=2; plural=(n != 1);",
	es: "nplurals=2; plural=(n != 1);",
	es_AR: "nplurals=2; plural=(n != 1);",
	es_CL: "nplurals=2; plural=(n != 1);",
	es_CO: "nplurals=2; plural=(n != 1);",
	es_ES: "nplurals=2; plural=(n != 1);",
	es_MX: "nplurals=2; plural=(n != 1);",
	es_PE: "nplurals=2; plural=(n != 1);",
	es_VE: "nplurals=2; plural=(n != 1);",
	et: "nplurals=2; plural=(n != 1);",
	eu: "nplurals=2; plural=(n != 1);",
	fa_IR: "nplurals=1; plural=0;",
	fi: "nplurals=2; plural=(n != 1);",
	fo: "nplurals=2; plural=(n != 1);",
	fr: "nplurals=2; plural=(n > 1);",
	fr_BE: "nplurals=2; plural=(n > 1);",
	fr_CA: "nplurals=2; plural=(n > 1);",
	fr_FR: "nplurals=2; plural=(n > 1);",
	fy: "nplurals=2; plural=(n != 1);",
	ga: "nplurals=5; plural=n==1 ? 0 : n==2 ? 1 : n<7 ? 2 : n<11 ? 3 : 4;",
	gd: "nplurals=4; plural=(n==1 || n==11) ? 0 : (n==2 || n==12) ? 1 : (n > 2 && n < 20) ? 2 : 3;",
	gl_ES: "nplurals=2; plural=(n != 1);",
	he_IL: "nplurals=2; plural=(n != 1);",
	hi_IN: "nplurals=2; plural=(n != 1);",
	hr: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
	hu_HU: "nplurals=2; plural=(n != 1);",
	hy: "nplurals=2; plural=(n != 1);",
	id_ID: "nplurals=1; plural=0;",
	is_IS: "nplurals=2; plural=(n%10!=1 || n%100==11);",
	it: "nplurals=2; plural=(n != 1);",
	it_IT: "nplurals=2; plural=(n != 1);",
	ja: "nplurals=1; plural=0;",
	ka_GE: "nplurals=1; plural=0;",
	ko: "nplurals=1; plural=0;",
	ko_KR: "nplurals=1; plural=0;",
	ku: "nplurals=2; plural=(n != 1);",
	lt_LT: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && (n%100<10 || n%100>=20) ? 1 : 2);",
	lv_LV: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n!=0 ? 1 : 2);",
	mk_MK: "nplurals=2; plural=n==1 || n%10==1 ? 0 : 1;",
	mn: "nplurals=2; plural=(n != 1);",
	ms_MY: "nplurals=1; plural=0;",
	nb_NO: "nplurals=2; plural=(n != 1);",
	ne_NP: "nplurals=2; plural=(n != 1);",
	nl: "nplurals=2; plural=(n != 1);",
	nl_BE: "nplurals=2; plural=(n != 1);",
	nl_NL: "nplurals=2; plural=(n != 1);",
	nn_NO: "nplurals=2; plural=(n != 1);",
	pl: "nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
	pl_PL: "nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
	pt: "nplurals=2; plural=(n != 1);",
	pt_BR: "nplurals=2; plural=(n > 1);",
	pt_PT: "nplurals=2; plural=(n != 1);",
	ro_RO: "nplurals=3; plural=(n==1 ? 0 : (n==0 || (n%100 > 0 && n%100 < 20)) ? 1 : 2);",
	ru: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
	ru_RU: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
	sk_SK: "nplurals=3; plural=(n==1) ? 0 : (n>=2 && n<=4) ? 1 : 2;",
	sl_SI: "nplurals=4; plural=(n%100==1 ? 0 : n%100==2 ? 1 : n%100==3 || n%100==4 ? 2 : 3);",
	sq_AL: "nplurals=2; plural=(n != 1);",
	sr_RS: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
	sv_SE: "nplurals=2; plural=(n != 1);",
	th: "nplurals=1; plural=0;",
	tr: "nplurals=2; plural=(n > 1);",
	tr_TR: "nplurals=2; plural=(n > 1);",
	uk: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
	vi: "nplurals=1; plural=0;",
	zh: "nplurals=1; plural=0;",
	zh_CN: "nplurals=1; plural=0;",
	zh_HK: "nplurals=1; plural=0;",
	zh_TW: "nplurals=1; plural=0;",
};

export function normalizeLocale(locale: string): string {
	return locale.trim().replaceAll("-", "_");
}

export function getBaseLanguage(locale: string): string {
	return normalizeLocale(locale).split("_")[0] ?? normalizeLocale(locale);
}

export function getPoHeaderLocale(locale: string): string {
	return normalizeLocale(locale).replaceAll("_", "-");
}

export function getPluralForms(locale: string): string {
	const normalized = normalizeLocale(locale);
	const baseLanguage = getBaseLanguage(normalized);

	return (
		PLURAL_FORMS[normalized] ??
		PLURAL_FORMS[baseLanguage] ??
		DEFAULT_PLURAL_FORMS
	);
}

export function getPluralCount(pluralForms: string): number {
	const match = /nplurals\s*=\s*(\d+)/.exec(pluralForms);
	if (match?.[1] === undefined) return 2;

	return Number.parseInt(match[1], 10);
}
