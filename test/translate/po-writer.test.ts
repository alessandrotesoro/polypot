import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { po } from "gettext-parser";
import {
	applyTranslations,
	createPoOutputDocument,
	mergeExistingPoData,
	readPoFile,
	writePoFile,
} from "../../src/translate/po-writer.js";
import { readPotDocument } from "../../src/translate/pot.js";

const POT_FIXTURE = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

#, fuzzy
#: src/a.js:1
msgid "Hello"
msgstr ""

#: src/a.js:2
msgid "%d file"
msgid_plural "%d files"
msgstr[0] ""
msgstr[1] ""

#: src/a.js:3
msgid "Removed later"
msgstr ""
`;

const EXISTING_PO = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Language: fr-FR\\n"

#: src/a.js:1
msgid "Hello"
msgstr "Bonjour"

#: src/a.js:2
msgid "%d file"
msgid_plural "%d files"
msgstr[0] "%d fichier"
msgstr[1] "%d fichiers"

msgid "Stale"
msgstr "Périmé"
`;

async function makeProject(): Promise<{
	readonly cleanup: () => Promise<void>;
	readonly directory: string;
	readonly potFile: string;
}> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "polypot-po-"));
	const potFile = path.join(directory, "messages.pot");
	await fs.writeFile(potFile, POT_FIXTURE);

	return {
		cleanup: async () => {
			await fs.rm(directory, { recursive: true, force: true });
		},
		directory,
		potFile,
	};
}

describe("PO writer", () => {
	it("creates target PO data with headers and plural slots", async () => {
		const project = await makeProject();

		try {
			const document = await readPotDocument(project.potFile);
			const output = await createPoOutputDocument({
				document,
				targetLanguage: "ja",
			});
			const pluralEntry =
				output.data.translations[""]?.["%d file"]?.msgstr;

			expect(output.pluralCount).to.equal(1);
			expect(output.data.headers).to.deep.include({
				Language: "ja-JP",
				"Plural-Forms": "nplurals=1; plural=0;",
			});
			expect(pluralEntry).to.deep.equal([""]);
		} finally {
			await project.cleanup();
		}
	});

	it("merges existing translations for matching source entries only", async () => {
		const project = await makeProject();

		try {
			const existingPath = path.join(project.directory, "fr_FR.po");
			await fs.writeFile(existingPath, EXISTING_PO);
			const document = await readPotDocument(project.potFile);
			const output = await createPoOutputDocument({
				document,
				targetLanguage: "fr_FR",
			});
			const existing = await readPoFile(existingPath);
			const merged = mergeExistingPoData({
				entries: document.entries,
				existing,
				output: output.data,
				pluralCount: output.pluralCount,
			});

			expect(merged.mergedStrings).to.equal(2);
			expect(
				merged.output.translations[""]?.["Hello"]?.msgstr,
			).to.deep.equal(["Bonjour"]);
			expect(
				merged.output.translations[""]?.["Hello"]?.comments?.flag,
			).to.equal(undefined);
			expect(merged.output.translations[""]?.["Stale"]).to.equal(
				undefined,
			);
		} finally {
			await project.cleanup();
		}
	});

	it("applies translations and writes parseable PO output", async () => {
		const project = await makeProject();

		try {
			const document = await readPotDocument(project.potFile);
			const output = await createPoOutputDocument({
				document,
				targetLanguage: "fr_FR",
			});
			const hello = document.entries.find(
				(entry) => entry.msgid === "Hello",
			);
			expect(hello).to.not.equal(undefined);
			if (hello === undefined) {
				throw new Error("expected Hello entry to exist");
			}

			const translated = applyTranslations({
				output: output.data,
				translations: [{ entry: hello, msgstr: ["Bonjour"] }],
			});
			const outputFile = path.join(
				project.directory,
				"languages/fr_FR.po",
			);
			await writePoFile({ output: translated, outputFile });
			const parsed = po.parse(await fs.readFile(outputFile), {
				validation: false,
			});

			expect(parsed.translations[""]?.["Hello"]?.msgstr).to.deep.equal([
				"Bonjour",
			]);
			expect(parsed.translations[""]?.["Hello"]?.comments?.flag).to.equal(
				undefined,
			);
			expect(parsed.headers["Language"]).to.equal("fr-FR");
		} finally {
			await project.cleanup();
		}
	});
});
