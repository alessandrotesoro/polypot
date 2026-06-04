import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { po } from "gettext-parser";
import { createPolypotSecrets } from "../../src/config/secrets.js";
import type { OpenAITranslateBatchResult } from "../../src/providers/openai/translate.js";
import {
	type ExecuteTranslateOptions,
	executeTranslate,
	type TranslateBatchFunction,
} from "../../src/translate/executor.js";

const FIXTURE_DIR = path.resolve("test/fixtures/translate");

async function makeProject(): Promise<{
	readonly cleanup: () => Promise<void>;
	readonly directory: string;
	readonly existingPoFile: string;
	readonly potFile: string;
}> {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "polypot-wp-fixture-"),
	);
	const potFile = path.join(directory, "wordpress-plugin.pot");
	const existingPoFile = path.join(directory, "existing-fr_FR.po");
	await fs.copyFile(path.join(FIXTURE_DIR, "wordpress-plugin.pot"), potFile);
	await fs.copyFile(
		path.join(FIXTURE_DIR, "existing-fr_FR.po"),
		existingPoFile,
	);

	return {
		cleanup: async () => {
			await fs.rm(directory, { recursive: true, force: true });
		},
		directory,
		existingPoFile,
		potFile,
	};
}

function buildOptions(
	project: {
		readonly directory: string;
		readonly existingPoFile?: string;
		readonly potFile: string;
	},
	overrides: Partial<ExecuteTranslateOptions> = {},
): ExecuteTranslateOptions {
	return {
		abortOnFailure: false,
		batchSize: 2,
		dictionaryPath: path.join(project.directory, "dictionaries"),
		dryRun: false,
		forceTranslate: false,
		jobs: 1,
		localeFormat: "target_lang",
		maxRetries: 0,
		model: "gpt-5.4-mini",
		outputDir: path.join(project.directory, "languages"),
		potFilePath: project.potFile,
		retryDelay: 0,
		secrets: createPolypotSecrets("sk-test"),
		skipLanguageOnFailure: false,
		sourceLanguage: "en_US",
		targetLanguages: ["fr_FR"],
		temperature: 0.1,
		timeout: 60,
		useDictionary: false,
		...(project.existingPoFile !== undefined && {
			inputPoPath: project.existingPoFile,
		}),
		...overrides,
	};
}

function translationFor(msgid: string, plural: boolean): readonly string[] {
	if (plural) return ["%d produit", "%d produits"];
	const translations: Readonly<Record<string, string>> = {
		"<strong>Important</strong>: check [setting_link].":
			"<strong>Important</strong> : verifiez [setting_link].",
		"Add to cart": "Ajouter au panier",
		"Price: %s": "Prix : %s",
		View: "Voir",
	};

	return [translations[msgid] ?? `${msgid} FR`];
}

const fixtureTranslateBatch: TranslateBatchFunction = async (
	options,
): Promise<OpenAITranslateBatchResult> => ({
	debug: { messages: [] },
	dryRun: false,
	missingEntries: [],
	ok: true,
	translations: options.entries.map((entry) => ({
		entry,
		msgstr: translationFor(entry.msgid, entry.plural),
	})),
	validationStats: {
		blankedStrings: [],
		placeholderMismatches: 0,
		pluralFormIssues: 0,
	},
});

describe("translate WordPress fixture integration", () => {
	it("preserves existing translations and fills untranslated WordPress entries", async () => {
		const project = await makeProject();
		const requestedEntries: string[] = [];

		try {
			const result = await executeTranslate(
				buildOptions(project),
				async (options) => {
					requestedEntries.push(
						...options.entries.map((entry) => entry.msgid),
					);
					return fixtureTranslateBatch(options);
				},
			);
			const parsed = po.parse(
				await fs.readFile(
					path.join(project.directory, "languages/fr_FR.po"),
				),
				{ validation: false },
			);

			expect(result.status).to.equal("completed");
			expect(result.results[0]).to.deep.include({
				mergedFromExisting: 1,
				plannedStrings: 4,
				translated: 4,
			});
			expect(requestedEntries).not.to.include("Add to cart");
			expect(parsed.headers["Language"]).to.equal("fr-FR");
			expect(parsed.headers["Plural-Forms"]).to.equal(
				"nplurals=2; plural=(n > 1);",
			);
			expect(
				parsed.translations[""]?.["Add to cart"]?.msgstr,
			).to.deep.equal(["Ajouter au panier"]);
			expect(
				parsed.translations["button"]?.["View"]?.msgstr,
			).to.deep.equal(["Voir"]);
			expect(
				parsed.translations[""]?.["%d product"]?.msgstr,
			).to.deep.equal(["%d produit", "%d produits"]);
		} finally {
			await project.cleanup();
		}
	});

	it("keeps a parseable partial PO file when a later batch fails", async () => {
		const project = await makeProject();
		let calls = 0;

		try {
			const result = await executeTranslate(
				buildOptions(
					{
						directory: project.directory,
						potFile: project.potFile,
					},
					{ batchSize: 2 },
				),
				async (options) => {
					if (!options.dryRun) calls += 1;
					if (calls > 1) {
						return {
							error: "provider failed",
							ok: false,
							retryable: true,
						};
					}

					return fixtureTranslateBatch(options);
				},
			);
			const parsed = po.parse(
				await fs.readFile(
					path.join(project.directory, "languages/fr_FR.po"),
				),
				{ validation: false },
			);

			expect(result.status).to.equal("failed");
			expect(result.results[0]).to.deep.include({
				failed: 3,
				translated: 2,
			});
			expect(
				parsed.translations[""]?.["Add to cart"]?.msgstr,
			).to.deep.equal(["Ajouter au panier"]);
			expect(
				parsed.translations[""]?.["Price: %s"]?.msgstr,
			).to.deep.equal([""]);
		} finally {
			await project.cleanup();
		}
	});
});
