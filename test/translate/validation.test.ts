import { expect } from "chai";
import type { PotEntry } from "../../src/translate/pot.js";
import {
	extractPlaceholders,
	validateEntryTranslation,
} from "../../src/translate/validation.js";

function entry(
	msgid: string,
	options: {
		readonly msgidPlural?: string;
	} = {},
): PotEntry {
	return {
		characters: msgid.length + (options.msgidPlural?.length ?? 0),
		context: "",
		flags: [],
		key: `\u0004${msgid}`,
		msgid,
		...(options.msgidPlural !== undefined && {
			msgidPlural: options.msgidPlural,
		}),
		msgstr: [""],
		obsolete: false,
		plural: options.msgidPlural !== undefined,
		references: [],
	};
}

describe("translation validation", () => {
	it("extracts printf placeholders without treating escaped percent as a placeholder", () => {
		expect(extractPlaceholders("Hello %1$s, %d%% complete")).to.deep.equal([
			"%1$s",
			"%d",
		]);
	});

	it("does not treat natural percentage text as a printf placeholder", () => {
		expect(
			extractPlaceholders("Renew now for 20% discount."),
		).to.deep.equal([]);
	});

	it("extracts positional placeholders adjacent to text", () => {
		expect(
			extractPlaceholders(
				"Please %1$srenew your license%2$s or visit %3$sAccount%4$s.",
			),
		).to.deep.equal(["%1$s", "%2$s", "%3$s", "%4$s"]);
	});

	it("keeps translations with matching placeholders", () => {
		const result = validateEntryTranslation({
			entry: entry("Hello %s"),
			msgstr: ["Bonjour %s"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal(["Bonjour %s"]);
		expect(result.issues).to.deep.equal([]);
	});

	it("rejects reordered unnumbered placeholders", () => {
		const result = validateEntryTranslation({
			entry: entry("%s has %d files"),
			msgstr: ["%d fichiers pour %s"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal([""]);
		expect(result.issues[0]?.reason).to.equal(
			"printf_placeholder_mismatch",
		);
	});

	it("allows reordered positional placeholders", () => {
		const result = validateEntryTranslation({
			entry: entry("%1$s has %2$d files"),
			msgstr: ["%2$d fichiers pour %1$s"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal(["%2$d fichiers pour %1$s"]);
		expect(result.issues).to.deep.equal([]);
	});

	it("blanks translations with missing placeholders", () => {
		const result = validateEntryTranslation({
			entry: entry("Hello %s"),
			msgstr: ["Bonjour"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal([""]);
		expect(result.issues[0]?.reason).to.equal(
			"printf_placeholder_mismatch",
		);
	});

	it("allows numeric placeholders to be dropped in accepted small-count plural forms", () => {
		const result = validateEntryTranslation({
			entry: entry("%d file", { msgidPlural: "%d files" }),
			msgstr: ["One file", "%d files"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal(["One file", "%d files"]);
		expect(result.issues).to.deep.equal([]);
	});

	it("normalizes leading and trailing non-breaking spaces only when source has boundary spaces", () => {
		const result = validateEntryTranslation({
			entry: entry(" Error: "),
			msgstr: ["\u00A0Erreur:\u00A0"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal([" Erreur: "]);
	});

	it("records plural form count issues", () => {
		const result = validateEntryTranslation({
			entry: entry("%d file", { msgidPlural: "%d files" }),
			msgstr: ["%d fichier"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal(["%d fichier", ""]);
		expect(result.issues[0]?.reason).to.equal("plural_form_count");
	});

	it("rejects translations that drop protected HTML tags", () => {
		const result = validateEntryTranslation({
			entry: entry("Click <strong>%s</strong>"),
			msgstr: ["Cliquez %s"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal([""]);
		expect(result.issues.map((issue) => issue.reason)).to.include(
			"tag_mismatch",
		);
	});

	it("rejects translations that drop bracket shortcode tokens", () => {
		const result = validateEntryTranslation({
			entry: entry("[link]View[/link] [count]"),
			msgstr: ["Voir"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal([""]);
		expect(result.issues.map((issue) => issue.reason)).to.include(
			"shortcode_mismatch",
		);
	});

	it("allows bracketed UI text that is not a shortcode to be translated", () => {
		const result = validateEntryTranslation({
			entry: entry("[View page]"),
			msgstr: ["[Voir la page]"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal(["[Voir la page]"]);
		expect(result.issues).to.deep.equal([]);
	});

	it("keeps shortcode tokens with attributes protected", () => {
		const result = validateEntryTranslation({
			entry: entry('[button url="%s"]View[/button]'),
			msgstr: ['Voir <a href="%s">'],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal([""]);
		expect(result.issues.map((issue) => issue.reason)).to.include(
			"shortcode_mismatch",
		);
	});

	it("keeps translations that preserve protected tags and shortcodes", () => {
		const result = validateEntryTranslation({
			entry: entry("Click <strong>%s</strong> [link]"),
			msgstr: ["Cliquez <strong>%s</strong> [link]"],
			pluralCount: 2,
		});

		expect(result.msgstr).to.deep.equal([
			"Cliquez <strong>%s</strong> [link]",
		]);
		expect(result.issues).to.deep.equal([]);
	});
});
