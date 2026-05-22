import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
	entryNeedsTranslation,
	getTranslatableEntries,
	readPotDocument,
} from "../../src/translate/pot.js";

const POT_FIXTURE = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

#. translators: greeting shown on dashboard
#: src/dashboard.js:1
msgid "Hello %s"
msgstr ""

#, fuzzy
#: src/actions.js:2
msgctxt "button"
msgid "Post"
msgstr ""

#: src/files.js:3
msgid "%d file"
msgid_plural "%d files"
msgstr[0] ""
msgstr[1] ""

#: src/existing.js:4
msgid "Already translated"
msgstr "Déjà traduit"

#~ msgid "Old"
#~ msgstr ""
`;

async function withPotFile(content: string): Promise<{
	readonly cleanup: () => Promise<void>;
	readonly filePath: string;
}> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "polypot-pot-"));
	const filePath = path.join(directory, "messages.pot");
	await fs.writeFile(filePath, content);

	return {
		cleanup: async () => {
			await fs.rm(directory, { recursive: true, force: true });
		},
		filePath,
	};
}

describe("readPotDocument", () => {
	it("preserves source entry data needed for translation", async () => {
		const fixture = await withPotFile(POT_FIXTURE);

		try {
			const document = await readPotDocument(fixture.filePath);
			const greeting = document.entries.find(
				(entry) => entry.msgid === "Hello %s",
			);
			const contextEntry = document.entries.find(
				(entry) => entry.msgid === "Post",
			);
			const pluralEntry = document.entries.find(
				(entry) => entry.msgid === "%d file",
			);

			expect(document.entries).to.have.length(4);
			expect(document.analysis).to.deep.include({
				contextStrings: 1,
				filePath: fixture.filePath,
				fuzzyStrings: 1,
				pluralStrings: 1,
				totalStrings: 4,
			});
			expect(greeting).to.deep.include({
				extractedComments: "translators: greeting shown on dashboard",
				msgid: "Hello %s",
				plural: false,
			});
			expect(greeting?.references).to.deep.equal(["src/dashboard.js:1"]);
			expect(contextEntry).to.deep.include({
				context: "button",
				msgctxt: "button",
				msgid: "Post",
			});
			expect(contextEntry?.flags).to.deep.equal(["fuzzy"]);
			expect(pluralEntry).to.deep.include({
				msgid: "%d file",
				msgidPlural: "%d files",
				plural: true,
			});
			expect(pluralEntry?.msgstr).to.deep.equal(["", ""]);
		} finally {
			await fixture.cleanup();
		}
	});

	it("classifies entries that need translation", async () => {
		const fixture = await withPotFile(POT_FIXTURE);

		try {
			const document = await readPotDocument(fixture.filePath);
			const translated = document.entries.find(
				(entry) => entry.msgid === "Already translated",
			);
			const untranslated = document.entries.find(
				(entry) => entry.msgid === "Hello %s",
			);

			expect(untranslated).to.not.equal(undefined);
			expect(translated).to.not.equal(undefined);
			if (untranslated === undefined || translated === undefined) {
				throw new Error("expected fixture entries to exist");
			}
			expect(entryNeedsTranslation(untranslated)).to.equal(true);
			expect(entryNeedsTranslation(translated)).to.equal(false);
			expect(getTranslatableEntries(document.entries)).to.have.length(3);
			expect(
				getTranslatableEntries(document.entries, {
					forceTranslate: true,
				}),
			).to.have.length(4);
		} finally {
			await fixture.cleanup();
		}
	});

	it("treats previous dry-run placeholders as needing translation", async () => {
		const fixture = await withPotFile(`msgid ""
msgstr ""

msgid "Hello"
msgstr "[DRY RUN] Would translate: \\"Hello\\""
`);

		try {
			const document = await readPotDocument(fixture.filePath);
			const entry = document.entries[0];

			expect(document.entries).to.have.length(1);
			if (entry === undefined) {
				throw new Error("expected fixture entry to exist");
			}
			expect(entryNeedsTranslation(entry)).to.equal(true);
		} finally {
			await fixture.cleanup();
		}
	});
});
