import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import type { PotEntry } from "../../src/translate/pot.js";
import {
	buildDictionaryResponse,
	buildSystemPrompt,
	buildXmlPrompt,
	loadPromptTemplate,
} from "../../src/translate/prompts.js";

function entry(
	msgid: string,
	options: Partial<
		Pick<PotEntry, "extractedComments" | "msgidPlural" | "msgctxt">
	> = {},
): PotEntry {
	return {
		characters: msgid.length + (options.msgidPlural?.length ?? 0),
		context: options.msgctxt ?? "",
		flags: [],
		key: `${options.msgctxt ?? ""}\u0004${msgid}`,
		msgid,
		...(options.extractedComments !== undefined && {
			extractedComments: options.extractedComments,
		}),
		...(options.msgctxt !== undefined && { msgctxt: options.msgctxt }),
		...(options.msgidPlural !== undefined && {
			msgidPlural: options.msgidPlural,
		}),
		msgstr: [""],
		obsolete: false,
		plural: options.msgidPlural !== undefined,
		references: [],
	};
}

describe("translation prompts", () => {
	it("loads prompt templates and replaces variables", async () => {
		const directory = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-prompt-"),
		);
		const promptFile = path.join(directory, "prompt.md");

		try {
			await fs.writeFile(
				promptFile,
				"Translate {{SOURCE_LANGUAGE}} to {{TARGET_LANGUAGE}} with {{PLURAL_COUNT}} forms.",
			);

			const template = await loadPromptTemplate(promptFile);
			const prompt = buildSystemPrompt({
				pluralCount: 2,
				sourceLanguage: "en_US",
				targetLanguage: "fr_FR",
				template: template.prompt,
			});

			expect(prompt).to.equal("Translate en_US to fr_FR with 2 forms.");
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});

	it("builds XML prompts with context, comments, placeholders, and plurals", () => {
		const prompt = buildXmlPrompt({
			dictionaryMatches: [{ source: "cart", target: "panier" }],
			entries: [
				entry("Hello %s", {
					extractedComments: "translators: user name",
					msgctxt: "dashboard",
				}),
				entry("%d file", { msgidPlural: "%d files" }),
			],
			pluralCount: 2,
			targetLanguage: "fr_FR",
		});

		expect(prompt.dictionaryCount).to.equal(1);
		expect(prompt.xmlPrompt).to.include('dictionary="true"');
		expect(prompt.xmlPrompt).to.include('context="dashboard"');
		expect(prompt.xmlPrompt).to.include('c="translators: user name"');
		expect(prompt.xmlPrompt).to.include('placeholders="%s"');
		expect(prompt.xmlPrompt).to.include("<singular>%d file</singular>");
		expect(prompt.xmlPrompt).to.include("<f1>translation for form 1</f1>");
	});

	it("builds dictionary response examples", () => {
		expect(
			buildDictionaryResponse([{ source: "cart", target: "panier" }]),
		).to.equal('<t i="1">panier</t>');
	});
});
