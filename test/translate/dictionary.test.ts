import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
	findDictionaryMatches,
	loadDictionary,
} from "../../src/translate/dictionary.js";
import type { PotEntry } from "../../src/translate/pot.js";

function entry(msgid: string): PotEntry {
	return {
		characters: msgid.length,
		context: "",
		flags: [],
		key: `\u0004${msgid}`,
		msgid,
		msgstr: [""],
		obsolete: false,
		plural: false,
		references: [],
	};
}

describe("translation dictionary", () => {
	it("loads the most specific target-language dictionary", async () => {
		const directory = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-dictionary-"),
		);

		try {
			await fs.writeFile(
				path.join(directory, "dictionary-fr.json"),
				JSON.stringify({ Cart: "Panier" }),
			);
			await fs.writeFile(
				path.join(directory, "dictionary-fr-fr.json"),
				JSON.stringify({ Checkout: "Paiement" }),
			);

			const result = await loadDictionary({
				dictionaryPath: directory,
				targetLanguage: "fr_FR",
			});

			expect(result.dictionary).to.deep.equal({ checkout: "Paiement" });
			expect(result.filePath).to.include("dictionary-fr-fr.json");
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});

	it("finds whole-word matches across singular and plural text", () => {
		const matches = findDictionaryMatches(
			[
				entry("View cart"),
				{
					...entry("%d product"),
					msgidPlural: "%d products",
					plural: true,
				},
			],
			{ art: "wrong", cart: "panier", products: "produits" },
		);

		expect(matches).to.deep.equal([
			{ source: "cart", target: "panier" },
			{ source: "products", target: "produits" },
		]);
	});

	it("returns an empty dictionary when files are missing", async () => {
		const result = await loadDictionary({
			dictionaryPath: path.join(os.tmpdir(), "missing-polypot-dict"),
			targetLanguage: "fr_FR",
		});

		expect(result).to.deep.equal({ dictionary: {} });
	});
});
