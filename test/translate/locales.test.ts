import { expect } from "chai";
import {
	DEFAULT_PLURAL_FORMS,
	getPluralCount,
	getPluralForms,
	getPoHeaderLocale,
	normalizeLocale,
} from "../../src/translate/locales.js";

describe("translate locales", () => {
	it("normalizes locale separators", () => {
		expect(normalizeLocale("fr-FR")).to.equal("fr_FR");
		expect(normalizeLocale("French")).to.equal("fr_FR");
		expect(normalizeLocale("fra")).to.equal("fr_FR");
		expect(getPoHeaderLocale("pt_BR")).to.equal("pt-BR");
	});

	it("resolves specific and base-language plural forms", () => {
		expect(getPluralCount(getPluralForms("fr_FR"))).to.equal(2);
		expect(getPluralForms("fr")).to.equal(getPluralForms("fr_FR"));
		expect(getPluralCount(getPluralForms("ru_RU"))).to.equal(3);
		expect(getPluralCount(getPluralForms("ar"))).to.equal(6);
		expect(getPluralCount(getPluralForms("ja"))).to.equal(1);
		expect(getPluralCount(getPluralForms("pt_BR"))).to.equal(2);
	});

	it("falls back to the default plural form for unknown locales", () => {
		expect(getPluralForms("zz_ZZ")).to.equal(DEFAULT_PLURAL_FORMS);
		expect(getPluralCount("not a plural form")).to.equal(2);
	});
});
