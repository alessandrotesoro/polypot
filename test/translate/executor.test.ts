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
	type TranslationProgressEvent,
} from "../../src/translate/executor.js";

const POT_FIXTURE = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"

msgid "Hello"
msgstr ""

msgid "Save"
msgstr ""

msgid "%d file"
msgid_plural "%d files"
msgstr[0] ""
msgstr[1] ""
`;

async function makeProject(): Promise<{
	readonly cleanup: () => Promise<void>;
	readonly directory: string;
	readonly potFile: string;
}> {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "polypot-executor-"),
	);
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

function buildOptions(
	project: { readonly directory: string; readonly potFile: string },
	overrides: Partial<ExecuteTranslateOptions> = {},
): ExecuteTranslateOptions {
	return {
		abortOnFailure: false,
		batchSize: 2,
		dictionaryPath: path.join(project.directory, "dictionaries"),
		dryRun: false,
		forceTranslate: false,
		jobs: 2,
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
		...overrides,
	};
}

const fakeTranslateBatch: TranslateBatchFunction = async (
	options,
): Promise<OpenAITranslateBatchResult> => ({
	debug: { messages: [] },
	dryRun: false,
	missingEntries: [],
	ok: true,
	translations: options.entries.map((entry) => ({
		entry,
		msgstr: entry.plural
			? ["Un fichier", "%d fichiers"]
			: [`${entry.msgid} FR`],
	})),
	validationStats: {
		blankedStrings: [],
		placeholderMismatches: 0,
		pluralFormIssues: 0,
	},
});

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

describe("executeTranslate", () => {
	it("translates planned strings and writes a PO file", async () => {
		const project = await makeProject();

		try {
			const events: TranslationProgressEvent[] = [];
			const result = await executeTranslate(
				buildOptions(project, {
					onProgress: (event) => events.push(event),
				}),
				fakeTranslateBatch,
			);
			const outputFile = path.join(
				project.directory,
				"languages/fr_FR.po",
			);
			const parsed = po.parse(await fs.readFile(outputFile), {
				validation: false,
			});

			expect(result.status).to.equal("completed");
			expect(result.results[0]).to.deep.include({
				batches: 2,
				failed: 0,
				language: "fr_FR",
				plannedStrings: 3,
				state: "completed",
				status: "completed",
				translated: 3,
			});
			expect(parsed.translations[""]?.["Hello"]?.msgstr).to.deep.equal([
				"Hello FR",
			]);
			expect(events.map((event) => event.phase)).to.include.members([
				"language-started",
				"batch-started",
				"batch-completed",
				"language-completed",
			]);
		} finally {
			await project.cleanup();
		}
	});

	it("does not write translated output in dry-run mode", async () => {
		const project = await makeProject();

		try {
			const result = await executeTranslate(
				buildOptions(project, { dryRun: true }),
				fakeTranslateBatch,
			);

			expect(result.status).to.equal("dry-run");
			expect(result.results[0]?.status).to.equal("dry-run");
			expect(result.results[0]?.state).to.equal("dry_run");
			try {
				await fs.access(
					path.join(project.directory, "languages/fr_FR.po"),
				);
				throw new Error("expected dry-run output file to be absent");
			} catch (error) {
				expect((error as NodeJS.ErrnoException).code).to.equal(
					"ENOENT",
				);
			}
		} finally {
			await project.cleanup();
		}
	});

	it("copies source strings when target base language matches the source", async () => {
		const project = await makeProject();

		try {
			const result = await executeTranslate(
				buildOptions(project, {
					sourceLanguage: "en_US",
					targetLanguages: ["en_GB"],
				}),
				async () => {
					throw new Error("provider should not be called");
				},
			);
			const parsed = po.parse(
				await fs.readFile(
					path.join(project.directory, "languages/en_GB.po"),
				),
				{ validation: false },
			);

			expect(result.status).to.equal("completed");
			expect(parsed.translations[""]?.["Hello"]?.msgstr).to.deep.equal([
				"Hello",
			]);
		} finally {
			await project.cleanup();
		}
	});

	it("marks failed batches without reporting full success", async () => {
		const project = await makeProject();

		try {
			const result = await executeTranslate(
				buildOptions(project, { batchSize: 20 }),
				async () => ({
					error: "failed",
					ok: false,
					retryable: true,
				}),
			);

			expect(result.status).to.equal("failed");
			expect(result.results[0]).to.deep.include({
				failed: 3,
				state: "provider_failed",
				status: "failed",
				translated: 0,
			});
		} finally {
			await project.cleanup();
		}
	});

	it("returns ordered not-started rows for later languages after abort failure", async () => {
		const project = await makeProject();

		try {
			const result = await executeTranslate(
				buildOptions(project, {
					abortOnFailure: true,
					targetLanguages: ["fr_FR", "es_ES"],
				}),
				async () => ({
					error: "failed",
					ok: false,
					retryable: true,
				}),
			);

			expect(result.results.map((item) => item.language)).to.deep.equal([
				"fr_FR",
				"es_ES",
			]);
			expect(result.results[1]).to.deep.include({
				skipReason: "abort-on-failure",
				state: "not_started",
				status: "skipped",
			});
		} finally {
			await project.cleanup();
		}
	});

	it("counts validation-rejected translations as failed", async () => {
		const project = await makeProject();

		try {
			const result = await executeTranslate(
				buildOptions(project, { batchSize: 2 }),
				async (options) => ({
					debug: { messages: [] },
					dryRun: false,
					missingEntries: [],
					ok: true,
					translations: options.entries.map((entry) => ({
						entry,
						msgstr: [`${entry.msgid} FR`],
					})),
					validationStats: {
						blankedStrings: [
							{
								entryKey: options.entries[0]?.key ?? "",
								expected: ["%s"],
								form: 0,
								got: [],
								reason: "placeholder_mismatch",
							},
						],
						placeholderMismatches: 1,
						pluralFormIssues: 0,
					},
				}),
			);
			const output = po.parse(
				await fs.readFile(
					path.join(project.directory, "languages/fr_FR.po"),
				),
				{ validation: false },
			);

			expect(result.status).to.equal("failed");
			expect(result.results[0]).to.deep.include({
				failed: 2,
				state: "validation_failed",
				translated: 1,
			});
			expect(output.translations[""]?.["Hello"]?.msgstr).to.deep.equal([
				"",
			]);
			expect(output.translations[""]?.["Save"]?.msgstr).to.deep.equal([
				"Save FR",
			]);
		} finally {
			await project.cleanup();
		}
	});

	it("processes languages concurrently when global accounting does not require ordering", async () => {
		const project = await makeProject();
		let active = 0;
		let maxActive = 0;

		try {
			const result = await executeTranslate(
				buildOptions(project, {
					jobs: 2,
					targetLanguages: ["fr_FR", "es_ES"],
				}),
				async (options) => {
					active += 1;
					maxActive = Math.max(maxActive, active);
					await delay(20);
					active -= 1;
					return fakeTranslateBatch(options);
				},
			);

			expect(result.status).to.equal("completed");
			expect(result.results.map((item) => item.language)).to.deep.equal([
				"fr_FR",
				"es_ES",
			]);
			expect(maxActive).to.be.greaterThan(1);
		} finally {
			await project.cleanup();
		}
	});

	it("fails when an explicit prompt template cannot be read", async () => {
		const project = await makeProject();
		const dictionaryDir = path.join(project.directory, "dictionaries");
		await fs.mkdir(dictionaryDir);
		await fs.writeFile(
			path.join(dictionaryDir, "dictionary-fr-fr.json"),
			"[]",
		);

		try {
			const result = await executeTranslate(
				buildOptions(project, {
					dictionaryPath: dictionaryDir,
					promptFilePath: path.join(project.directory, "missing.md"),
					useDictionary: true,
				}),
				fakeTranslateBatch,
			);

			expect(result.status).to.equal("failed");
			expect(result.results[0]).to.deep.include({
				failed: 0,
				state: "execution_failed",
				status: "failed",
				translated: 0,
			});
			expect(result.results[0]?.error).to.include(
				"Could not read prompt template",
			);
		} finally {
			await project.cleanup();
		}
	});

	it("fails when an explicit prompt template is empty", async () => {
		const project = await makeProject();
		const promptFile = path.join(project.directory, "prompt.md");
		await fs.writeFile(promptFile, "  \n");

		try {
			const result = await executeTranslate(
				buildOptions(project, { promptFilePath: promptFile }),
				fakeTranslateBatch,
			);

			expect(result.status).to.equal("failed");
			expect(result.results[0]).to.deep.include({
				failed: 0,
				state: "execution_failed",
				status: "failed",
				translated: 0,
			});
			expect(result.results[0]?.error).to.include("Prompt file is empty");
		} finally {
			await project.cleanup();
		}
	});

	it("fails malformed existing PO merges without overwriting output", async () => {
		const project = await makeProject();
		const existingPoPath = path.join(project.directory, "broken.po");
		await fs.writeFile(existingPoPath, "\0\0");

		try {
			const result = await executeTranslate(
				buildOptions(project, {
					inputPoPath: existingPoPath,
				}),
				fakeTranslateBatch,
			);

			expect(result.status).to.equal("failed");
			expect(result.results[0]?.state).to.equal("merge_failed");
			expect(result.results[0]?.error).to.include(
				"Could not merge existing PO file",
			);
			try {
				await fs.access(
					path.join(project.directory, "languages/fr_FR.po"),
				);
				expect.fail("expected output file not to be written");
			} catch (error) {
				expect((error as NodeJS.ErrnoException).code).to.equal(
					"ENOENT",
				);
			}
		} finally {
			await project.cleanup();
		}
	});
});
