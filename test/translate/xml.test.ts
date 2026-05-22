import { expect } from "chai";
import type { PotEntry } from "../../src/translate/pot.js";
import { parseXmlResponse } from "../../src/translate/xml.js";

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

describe("parseXmlResponse", () => {
	it("parses singular and plural translations", () => {
		const entries = [
			entry("Hello"),
			entry("%d file", { msgidPlural: "%d files" }),
		];
		const result = parseXmlResponse({
			entries,
			pluralCount: 2,
			xml: '<t i="1">Bonjour</t><t i="2"><f0>Un fichier</f0><f1>%d fichiers</f1></t>',
		});

		expect(result.missingEntries).to.deep.equal([]);
		expect(result.translations.map((item) => item.msgstr)).to.deep.equal([
			["Bonjour"],
			["Un fichier", "%d fichiers"],
		]);
	});

	it("accounts for dictionary response indices", () => {
		const entries = [entry("Hello")];
		const result = parseXmlResponse({
			dictionaryCount: 1,
			entries,
			pluralCount: 2,
			xml: '<t i="1">Example</t><t i="2">Bonjour</t>',
		});

		expect(result.translations[0]?.msgstr).to.deep.equal(["Bonjour"]);
	});

	it("reports missing entries and validation issues", () => {
		const entries = [entry("Hello %s"), entry("Save")];
		const result = parseXmlResponse({
			entries,
			pluralCount: 2,
			xml: '<t i="1">Bonjour</t>',
		});

		expect(result.translations[0]?.msgstr).to.deep.equal([""]);
		expect(result.missingEntries.map((item) => item.msgid)).to.deep.equal([
			"Save",
		]);
		expect(result.validationStats.placeholderMismatches).to.equal(1);
	});

	it("ignores extra response entries", () => {
		const result = parseXmlResponse({
			entries: [entry("Hello")],
			pluralCount: 2,
			xml: '<t i="1">Bonjour</t><t i="3">Extra</t>',
		});

		expect(result.translations).to.have.length(1);
		expect(result.missingEntries).to.deep.equal([]);
	});
});
