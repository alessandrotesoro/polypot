import { expect } from "chai";
import {
	formatSetupLanguage,
	normalizeSetupLanguageInput,
	SETUP_LANGUAGES,
	setupLanguageChoices,
} from "../../src/setup/languages.js";

describe("setup language catalog", () => {
	it("includes common WordPress locale codes", () => {
		const values = SETUP_LANGUAGES.map((language) => language.value);

		expect(values).to.include.members([
			"it_IT",
			"fr_FR",
			"es_ES",
			"de_DE",
			"pt_BR",
			"zh_CN",
		]);
	});

	it("formats choices with language names and canonical locale codes", () => {
		const choices = setupLanguageChoices();

		expect(
			choices.find((choice) => choice.value === "it_IT")?.name,
		).to.equal("Italian (it_IT)");
		expect(
			choices.find((choice) => choice.value === "fr_FR")?.name,
		).to.equal("French (France) (fr_FR)");
	});

	it("marks selected languages and preserves unknown custom values", () => {
		const choices = setupLanguageChoices({
			selected: ["fr_FR", "custom_XY", "fr_FR"],
		});
		const selected = choices
			.filter((choice) => choice.checked)
			.map((choice) => choice.value);

		expect(selected).to.deep.equal(["fr_FR", "custom_XY"]);
		expect(
			choices.find((choice) => choice.value === "custom_XY")?.name,
		).to.equal("custom_XY (custom)");
	});

	it("formats known and unknown language values", () => {
		expect(formatSetupLanguage("de_DE")).to.equal("German (de_DE)");
		expect(formatSetupLanguage("French")).to.equal(
			"French (France) (fr_FR)",
		);
		expect(formatSetupLanguage("unknown_XX")).to.equal(
			"unknown_XX (custom)",
		);
	});

	it("normalizes Potomatic-style language inputs", () => {
		expect(normalizeSetupLanguageInput("French")).to.equal("fr_FR");
		expect(normalizeSetupLanguageInput("fr")).to.equal("fr_FR");
		expect(normalizeSetupLanguageInput("fra")).to.equal("fr_FR");
		expect(normalizeSetupLanguageInput("fr-FR")).to.equal("fr_FR");
		expect(normalizeSetupLanguageInput("fr-fr")).to.equal("fr_FR");
		expect(normalizeSetupLanguageInput("Spanish")).to.equal("es_ES");
		expect(normalizeSetupLanguageInput("unknown_XX")).to.equal(
			"unknown_XX",
		);
	});
});
