import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { createPolypotSecrets } from "../../src/config/secrets.js";
import {
	buildTranslateExecutionPlan,
	type TranslateInputPlan,
} from "../../src/translate/execution-plan.js";

const POT_FIXTURE = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

msgid "Hello"
msgstr ""

msgid "%d file"
msgid_plural "%d files"
msgstr[0] ""
msgstr[1] ""
`;

const COMPLETE_PO_FIXTURE = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Language: fr_FR\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

msgid "Hello"
msgstr "Bonjour"

msgid "%d file"
msgid_plural "%d files"
msgstr[0] "%d fichier"
msgstr[1] "%d fichiers"
`;

describe("translate execution plan", () => {
	let directory: string;
	let potFile: string;

	beforeEach(async () => {
		directory = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-execution-plan-"),
		);
		potFile = path.join(directory, "messages.pot");
		await fs.writeFile(potFile, POT_FIXTURE);
	});

	afterEach(async () => {
		await fs.rm(directory, { recursive: true, force: true });
	});

	function buildInput(): TranslateInputPlan {
		const outputDir = path.join(directory, "languages");

		return {
			config: {
				forceTranslate: false,
				model: "gpt-5.4-mini",
				potFilePath: potFile,
				provider: "openai",
			},
			preview: {
				batchSize: 2,
				dryRun: false,
				jobs: 1,
				languages: ["fr_FR"],
				localeFormat: "target_lang",
				outputDir,
				outputFormat: "json",
				sourceLanguage: "en_US",
				verboseLevel: 0,
			},
			secrets: createPolypotSecrets("sk-test"),
			settings: {
				behavior: {
					dictionaryPath: path.join(directory, "dictionaries"),
					forceTranslate: false,
					promptFilePath: path.join(directory, "prompt.md"),
					useDictionary: false,
				},
				debug: {
					dryRun: false,
					saveDebugInfo: false,
					verboseLevel: 0,
				},
				limits: {},
				output: {
					localeFormat: "target_lang",
					outputDir,
					outputFormat: "json",
				},
				performance: {
					batchSize: 2,
					jobs: 1,
					timeout: 60,
				},
				provider: {
					model: "gpt-5.4-mini",
					provider: "openai",
					temperature: 0.1,
				},
				retries: {
					abortOnFailure: false,
					maxRetries: 0,
					retryDelay: 500,
					skipLanguageOnFailure: false,
				},
				source: {
					potFilePath: potFile,
					sourceLanguage: "en_US",
					targetLanguages: ["fr_FR"],
				},
			},
		};
	}

	it("blocks missing target languages before reading the POT file", async () => {
		const input = buildInput();
		const result = await buildTranslateExecutionPlan({
			...input,
			preview: { ...input.preview, languages: [] },
			settings: {
				...input.settings,
				source: { ...input.settings.source, targetLanguages: [] },
			},
		});

		expect(result.ok).to.equal(false);
		expect(result.ok ? "" : result.blocker.code).to.equal(
			"missing_target_languages",
		);
	});

	it("detects duplicate PO output paths", async () => {
		const input = buildInput();
		const result = await buildTranslateExecutionPlan({
			...input,
			preview: {
				...input.preview,
				languages: ["fr_FR", "fr_CA"],
				localeFormat: "iso_639_1",
			},
			settings: {
				...input.settings,
				output: {
					...input.settings.output,
					localeFormat: "iso_639_1",
				},
				source: {
					...input.settings.source,
					targetLanguages: ["fr_FR", "fr_CA"],
				},
			},
		});

		expect(result.ok).to.equal(false);
		expect(result.ok ? "" : result.blocker.code).to.equal(
			"duplicate_output_file",
		);
	});

	it("detects collisions between planned writes", async () => {
		const input = buildInput();
		const debugOutputFile = path.join(directory, "languages", "fr_FR.po");
		const result = await buildTranslateExecutionPlan({
			...input,
			settings: {
				...input.settings,
				debug: {
					...input.settings.debug,
					debugOutputFile,
				},
			},
		});

		expect(result.ok).to.equal(false);
		expect(result.ok ? "" : result.blocker.code).to.equal(
			"output_path_collision",
		);
		expect(
			result.ok ? [] : result.blocker.collisions?.[0]?.reservations,
		).to.deep.equal(["po:fr_FR", "debug_output"]);
	});

	it("protects POT and input PO reads from planned writes", async () => {
		const input = buildInput();
		const potCollision = await buildTranslateExecutionPlan({
			...input,
			settings: {
				...input.settings,
				output: {
					...input.settings.output,
					outputFile: potFile,
				},
			},
		});

		expect(potCollision.ok).to.equal(false);
		expect(potCollision.ok ? "" : potCollision.blocker.code).to.equal(
			"output_path_collision",
		);
		expect(
			potCollision.ok
				? undefined
				: potCollision.blocker.suppressOutputFile,
		).to.equal(true);

		const inputPoFile = path.join(directory, "existing.po");
		const inputPoCollision = await buildTranslateExecutionPlan({
			...input,
			settings: {
				...input.settings,
				output: {
					...input.settings.output,
					outputFile: inputPoFile,
				},
				source: {
					...input.settings.source,
					inputPoPath: inputPoFile,
				},
			},
		});

		expect(inputPoCollision.ok).to.equal(false);
		expect(
			inputPoCollision.ok ? "" : inputPoCollision.blocker.code,
		).to.equal("output_path_collision");
		expect(
			inputPoCollision.ok
				? []
				: inputPoCollision.blocker.collisions?.[0]?.reservations,
		).to.deep.equal(["json_output", "input_po"]);
	});

	it("blocks unsupported providers only when provider work is planned", async () => {
		const input = buildInput();
		const blocked = await buildTranslateExecutionPlan({
			...input,
			config: { ...input.config, provider: "gemini" },
			settings: {
				...input.settings,
				provider: { ...input.settings.provider, provider: "gemini" },
			},
		});

		expect(blocked.ok).to.equal(false);
		expect(blocked.ok ? "" : blocked.blocker.code).to.equal(
			"unsupported_provider",
		);

		await fs.mkdir(path.join(directory, "languages"));
		await fs.writeFile(
			path.join(directory, "languages", "fr_FR.po"),
			COMPLETE_PO_FIXTURE,
		);
		const allowed = await buildTranslateExecutionPlan({
			...input,
			config: { ...input.config, provider: "gemini" },
			settings: {
				...input.settings,
				provider: { ...input.settings.provider, provider: "gemini" },
			},
		});

		expect(allowed.ok).to.equal(true);
	});

	it("allows unsupported provider dry-run planning", async () => {
		const input = buildInput();
		const result = await buildTranslateExecutionPlan({
			...input,
			config: { ...input.config, provider: "gemini" },
			preview: {
				...input.preview,
				dryRun: true,
			},
			settings: {
				...input.settings,
				debug: { ...input.settings.debug, dryRun: true },
				provider: { ...input.settings.provider, provider: "gemini" },
			},
		});

		expect(result.ok).to.equal(true);
	});
});
