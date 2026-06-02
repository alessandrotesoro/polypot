import { expect } from "chai";
import {
	entryNeedsTranslation,
	getTranslationFlags,
	isCompleteExistingTranslation,
} from "../../src/translate/completeness.js";
import type { PotEntry } from "../../src/translate/pot.js";

describe("translation completeness", () => {
	it("accepts complete singular and plural translations", () => {
		expect(
			isCompleteExistingTranslation({
				entry: { plural: false },
				msgstr: ["Bonjour"],
				pluralCount: 1,
			}),
		).to.equal(true);
		expect(
			isCompleteExistingTranslation({
				entry: { plural: true },
				msgstr: ["%d fichier", "%d fichiers"],
				pluralCount: 2,
			}),
		).to.equal(true);
	});

	it("rejects missing plural slots, fuzzy entries, and dry-run placeholders", () => {
		expect(
			isCompleteExistingTranslation({
				entry: { plural: true },
				msgstr: ["%d fichier"],
				pluralCount: 2,
			}),
		).to.equal(false);
		expect(
			isCompleteExistingTranslation({
				entry: { plural: false },
				msgstr: ["Bonjour"],
				pluralCount: 1,
				translationFlags: ["fuzzy"],
			}),
		).to.equal(false);
		expect(
			isCompleteExistingTranslation({
				entry: { plural: false },
				msgstr: ["[DRY RUN] Bonjour"],
				pluralCount: 1,
			}),
		).to.equal(false);
	});

	it("parses gettext flags before evaluating existing translations", () => {
		const flags = getTranslationFlags({
			comments: { flag: "php-format, fuzzy" },
		});

		expect(flags).to.deep.equal(["php-format", "fuzzy"]);
	});

	it("uses entry flags when deciding if source entries still need work", () => {
		const entry = {
			characters: 5,
			context: "",
			flags: ["fuzzy"],
			key: "\u0004Hello",
			msgid: "Hello",
			msgstr: ["Bonjour"],
			obsolete: false,
			plural: false,
			references: [],
		} as PotEntry;

		expect(entryNeedsTranslation(entry)).to.equal(true);
	});
});
