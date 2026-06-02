import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "@oclif/test";
import { expect } from "chai";
import { po } from "gettext-parser";

const EXPECTED_FLAGS = [
	"--provider",
	"--api-key",
	"--model",
	"--temperature",
	"--max-tokens",
	"--source-language",
	"--target-languages",
	"--pot-file-path",
	"--input-po-path",
	"--output-dir",
	"--output-format",
	"--output-file",
	"--po-file-prefix",
	"--locale-format",
	"--force-translate",
	"--use-dictionary",
	"--dictionary-path",
	"--prompt-file-path",
	"--po-header-template-path",
	"--batch-size",
	"--jobs",
	"--timeout",
	"--max-strings-per-job",
	"--max-total-strings",
	"--max-cost",
	"--max-retries",
	"--retry-delay",
	"--abort-on-failure",
	"--skip-language-on-failure",
	"--verbose-level",
	"--dry-run",
	"--save-debug-info",
	"--config",
	"--no-config",
	"--no-env",
];

const POT_FIXTURE = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

#: src/a.js:1
msgid "Hello"
msgstr ""

#, fuzzy
#: src/a.js:2
msgid "Save changes"
msgstr ""

#: src/a.js:3
msgctxt "button"
msgid "Post"
msgstr ""

#: src/a.js:4
msgid "%d file"
msgid_plural "%d files"
msgstr[0] ""
msgstr[1] ""
`;

describe("polypot translate", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		process.exitCode = undefined;
		await Promise.all(
			tempDirs
				.splice(0)
				.map((tempDir) =>
					fs.rm(tempDir, { recursive: true, force: true }),
				),
		);
	});

	async function writePotFixture(): Promise<string> {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-pot-"),
		);
		tempDirs.push(tempDir);
		const potFile = path.join(tempDir, "messages.pot");
		await fs.writeFile(potFile, POT_FIXTURE);

		return potFile;
	}

	async function writeNonFuzzyPotFixture(): Promise<string> {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-pot-"),
		);
		tempDirs.push(tempDir);
		const potFile = path.join(tempDir, "messages.pot");
		await fs.writeFile(potFile, POT_FIXTURE.replace("\n#, fuzzy", ""));

		return potFile;
	}

	async function writeCompletePoFixture(
		outputFile: string,
		language = "fr_FR",
	): Promise<void> {
		await fs.mkdir(path.dirname(outputFile), { recursive: true });
		await fs.writeFile(
			outputFile,
			`msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Language: ${language}\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

msgid "Hello"
msgstr "Bonjour"

msgid "Save changes"
msgstr "Enregistrer les modifications"

msgctxt "button"
msgid "Post"
msgstr "Publier"

msgid "%d file"
msgid_plural "%d files"
msgstr[0] "%d fichier"
msgstr[1] "%d fichiers"
`,
		);
	}

	it("lists all 30+ Potomatic-mirrored flags in --help", async () => {
		const { stdout } = await runCommand(["translate", "--help"]);
		for (const flag of EXPECTED_FLAGS) {
			expect(stdout, `expected --help to list ${flag}`).to.include(flag);
		}
	});

	it("exposes the documented helpGroup labels", async () => {
		const { stdout } = await runCommand(["translate", "--help"]);
		expect(stdout).to.include("PROVIDER FLAGS");
		expect(stdout).to.include("SOURCE FLAGS");
		expect(stdout).to.include("OUTPUT FLAGS");
		expect(stdout).to.include("BEHAVIOR FLAGS");
		expect(stdout).to.include("PERFORMANCE FLAGS");
		expect(stdout).to.include("LIMITS FLAGS");
		expect(stdout).to.include("RETRIES FLAGS");
		expect(stdout).to.include("DEBUG FLAGS");
		expect(stdout).to.include("CONFIG FLAGS");
	});

	it("parses comma-separated --target-languages and short flags", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR,es_ES",
			"-p",
			potFile,
			"-b",
			"30",
			"-j",
			"3",
			"-v",
			"2",
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly implemented: boolean;
			readonly mode: string;
			readonly plan: {
				readonly batchSize: number;
				readonly dryRun: boolean;
				readonly languages: readonly string[];
			};
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(result.implemented).to.equal(true);
		expect(result.mode).to.equal("dry-run");
		expect(result.status).to.equal("dry-run");
		expect(result.plan.languages).to.deep.equal(["fr_FR", "es_ES"]);
		expect(result.plan.batchSize).to.equal(30);
		expect(result.plan.dryRun).to.equal(true);
	});

	it("rejects an invalid --output-format enum value", async () => {
		const { error } = await runCommand([
			"translate",
			"-p",
			"foo.pot",
			"--output-format",
			"yaml",
		]);
		expect(error).to.not.equal(undefined);
	});

	it("rejects an invalid --max-cost value", async () => {
		const { error } = await runCommand([
			"translate",
			"-l",
			"fr_FR",
			"-p",
			"foo.pot",
			"--max-cost",
			"not-a-number",
		]);

		expect(error).to.not.equal(undefined);
		expect(error?.message).to.include(
			"--max-cost must be a non-negative number",
		);
	});

	it("rejects preview numeric values outside documented ranges", async () => {
		const invalidCases = [
			{
				args: ["--batch-size", "0"],
				message: "--batch-size must be an integer between 1 and 100",
			},
			{
				args: ["--jobs", "0"],
				message: "--jobs must be an integer between 1 and 10",
			},
			{
				args: ["--timeout", "9"],
				message: "--timeout must be an integer between 10 and 300",
			},
			{
				args: ["--max-strings-per-job", "0"],
				message:
					"--max-strings-per-job must be an integer greater than or equal to 1",
			},
			{
				args: ["--max-total-strings", "0"],
				message:
					"--max-total-strings must be an integer greater than or equal to 1",
			},
			{
				args: ["--max-cost", "12abc"],
				message: "--max-cost must be a non-negative number",
			},
			{
				args: ["--max-retries", "11"],
				message: "--max-retries must be an integer between 0 and 10",
			},
			{
				args: ["--retry-delay", "499"],
				message:
					"--retry-delay must be an integer between 500 and 30000",
			},
		];

		for (const invalidCase of invalidCases) {
			const { error } = await runCommand([
				"translate",
				"-l",
				"fr_FR",
				"-p",
				"foo.pot",
				"--dry-run",
				...invalidCase.args,
			]);

			expect(
				error,
				`expected ${invalidCase.args.join(" ")} to fail`,
			).to.not.equal(undefined);
			expect(error?.message).to.include(invalidCase.message);
		}
	});

	it("rejects path-like target language values", async () => {
		const invalidValues = [
			"../escape",
			"fr/FR",
			"fr\\FR",
			"",
			"C:fr_FR",
			"fr_\u001B[31mFR",
		];

		for (const language of invalidValues) {
			const { error } = await runCommand([
				"translate",
				"-l",
				language,
				"-p",
				"foo.pot",
				"--dry-run",
			]);

			expect(
				error,
				`expected ${JSON.stringify(language)} to fail`,
			).to.not.equal(undefined);
			if (language.length > 0) {
				expect(error?.message).to.include(
					"--target-languages includes unsafe value",
				);
			}
		}
	});

	it("rejects duplicate target language values", async () => {
		const { error } = await runCommand([
			"translate",
			"-l",
			"fr_FR,fr_FR",
			"-p",
			"foo.pot",
			"--dry-run",
		]);

		expect(error).to.not.equal(undefined);
		expect(error?.message).to.include(
			"--target-languages includes duplicate value",
		);
	});

	it("rejects path-like PO file prefixes", async () => {
		const { error } = await runCommand([
			"translate",
			"-l",
			"fr_FR",
			"-p",
			"foo.pot",
			"--po-file-prefix",
			"../backup/",
			"--dry-run",
		]);

		expect(error).to.not.equal(undefined);
		expect(error?.message).to.include(
			"--po-file-prefix cannot contain path separators",
		);
	});

	it("renders a UI-only translation preview with per-language progress", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--batch-size",
			"20",
			"--dry-run",
			"--verbose-level",
			"2",
		]);

		expect(error).to.equal(undefined);
		expect(stdout).to.include("Translate preview");
		expect(stdout).to.include("Source");
		expect(stdout).to.include("Plan");
		expect(stdout).to.include("Targets");
		expect(stdout).to.include("Runtime");
		expect(stdout).to.include("calculated after existing PO merge");
		expect(stdout).to.include("fr_FR");
		expect(stdout).to.include("Batch");
		expect(stdout).to.include("output");
		expect(stdout).to.include("Preview complete");
		expect(stdout).to.include("Planned");
		expect(stdout).to.include("Outputs");
		expect(stdout).to.include("No translations were written.");
	});

	it("exposes the resolved appConfig defaults in JSON output", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly plan: {
				readonly batchSize: number;
				readonly provider: string;
			};
			readonly analysis: {
				readonly totalStrings: number;
			};
			readonly status: string;
			readonly summary: string;
		};

		expect(error).to.equal(undefined);
		expect(result.status).to.equal("dry-run");
		expect(result.analysis.totalStrings).to.equal(4);
		expect(result.plan.provider).to.equal("openai");
		expect(result.plan.batchSize).to.equal(20);
		expect(result.summary).to.include("No translations were written.");
	});

	it("writes JSON preview output to --output-file", async () => {
		const potFile = await writePotFixture();
		const outputDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-output-"),
		);
		const outputFile = path.join(outputDir, "preview.json");

		try {
			const { stdout, error } = await runCommand([
				"translate",
				"-l",
				"fr_FR",
				"-p",
				potFile,
				"--dry-run",
				"--output-format",
				"json",
				"--output-file",
				outputFile,
			]);
			const output = JSON.parse(
				await fs.readFile(outputFile, "utf8"),
			) as {
				readonly results: readonly {
					readonly language: string;
				}[];
				readonly status: string;
			};

			expect(error).to.equal(undefined);
			expect(stdout).to.include("JSON output written to:");
			expect(stdout).to.not.include("not written");
			expect(output.status).to.equal("dry-run");
			expect(output.results[0]?.language).to.equal("fr_FR");
		} finally {
			await fs.rm(outputDir, { recursive: true, force: true });
		}
	});

	it("writes a PO file without a provider when target base language matches the source", async () => {
		const potFile = await writePotFixture();
		const outputDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-copy-"),
		);
		tempDirs.push(outputDir);

		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"en_GB",
			"-s",
			"en_US",
			"-p",
			potFile,
			"--output-dir",
			outputDir,
		]);
		const result = JSON.parse(stdout) as {
			readonly results: readonly {
				readonly outputFile: string;
				readonly state: string;
				readonly status: string;
				readonly translated: number;
			}[];
			readonly status: string;
		};
		const outputFile = path.join(outputDir, "en_GB.po");
		const parsed = po.parse(await fs.readFile(outputFile), {
			validation: false,
		});

		expect(error).to.equal(undefined);
		expect(result.status).to.equal("completed");
		expect(result.results[0]).to.deep.include({
			outputFile,
			state: "completed",
			status: "completed",
			translated: 4,
		});
		expect(parsed.headers["Language"]).to.equal("en-GB");
		expect(parsed.translations[""]?.["Hello"]?.msgstr).to.deep.equal([
			"Hello",
		]);
	});

	it("allows source-copy output with an unsupported provider", async () => {
		const potFile = await writePotFixture();
		const outputDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-copy-provider-"),
		);
		tempDirs.push(outputDir);

		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"--provider",
			"gemini",
			"-l",
			"en_GB",
			"-s",
			"en_US",
			"-p",
			potFile,
			"--output-dir",
			outputDir,
		]);
		const result = JSON.parse(stdout) as {
			readonly results: readonly {
				readonly status: string;
				readonly translated: number;
			}[];
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(result.status).to.equal("completed");
		expect(result.results[0]).to.deep.include({
			status: "completed",
			translated: 4,
		});
	});

	it("blocks provider translation without an API key", async () => {
		const potFile = await writePotFixture();
		const previousApiKey = process.env["POLYPOT_API_KEY"];
		delete process.env["POLYPOT_API_KEY"];
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"--no-config",
			"--no-env",
			"-l",
			"fr_FR",
			"-p",
			potFile,
		]).finally(() => {
			if (previousApiKey === undefined) {
				delete process.env["POLYPOT_API_KEY"];
			} else {
				process.env["POLYPOT_API_KEY"] = previousApiKey;
			}
		});
		const result = JSON.parse(stdout) as {
			readonly results: readonly {
				readonly error: string;
				readonly failed: number;
				readonly status: string;
			}[];
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(process.exitCode).to.equal(1);
		expect(result.status).to.equal("failed");
		expect(result.results[0]).to.deep.include({
			error: "OpenAI API key is required for translation.",
			failed: 4,
			status: "failed",
		});
	});

	it("allows unsupported provider dry-run when no provider cost gate is requested", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"--provider",
			"gemini",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly results: readonly {
				readonly estimate: {
					readonly costKnown: boolean;
				};
				readonly status: string;
			}[];
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(result.status).to.equal("dry-run");
		expect(result.results[0]?.status).to.equal("dry-run");
		expect(result.results[0]?.estimate.costKnown).to.equal(false);
	});

	it("blocks unsupported provider dry-run when max cost requires an estimator", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"--provider",
			"gemini",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--dry-run",
			"--max-cost",
			"0.01",
		]);
		const result = JSON.parse(stdout) as {
			readonly error: {
				readonly code: string;
			};
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(process.exitCode).to.equal(1);
		expect(result.status).to.equal("blocked");
		expect(result.error.code).to.equal("cost_estimator_unavailable");
	});

	it("blocks unsupported live providers only when provider work is planned", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"--provider",
			"gemini",
			"-l",
			"fr_FR",
			"-p",
			potFile,
		]);
		const result = JSON.parse(stdout) as {
			readonly error: {
				readonly code: string;
			};
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(process.exitCode).to.equal(1);
		expect(result.status).to.equal("blocked");
		expect(result.error.code).to.equal("unsupported_provider");
	});

	it("allows unsupported live providers when existing output leaves no translation work", async () => {
		const potFile = await writeNonFuzzyPotFixture();
		const outputDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-merged-provider-"),
		);
		tempDirs.push(outputDir);
		await writeCompletePoFixture(path.join(outputDir, "fr_FR.po"));

		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"--provider",
			"gemini",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--output-dir",
			outputDir,
		]);
		const result = JSON.parse(stdout) as {
			readonly results: readonly {
				readonly skippedByExisting: number;
				readonly status: string;
				readonly translated: number;
			}[];
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(result.status).to.equal("completed");
		expect(result.results[0]).to.deep.include({
			skippedByExisting: 4,
			status: "skipped",
			translated: 0,
		});
	});

	it("writes --output-file before writing debug output", async () => {
		const previousCwd = process.cwd();
		const projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-debug-failure-"),
		);
		tempDirs.push(projectDir);
		const potFile = path.join(projectDir, "messages.pot");
		const outputFile = path.join(projectDir, "preview.json");
		await fs.writeFile(potFile, POT_FIXTURE);
		await fs.mkdir(path.join(projectDir, ".polypot"));
		await fs.writeFile(path.join(projectDir, ".polypot", "debug"), "");

		try {
			process.chdir(projectDir);
			const { error } = await runCommand([
				"translate",
				"-l",
				"fr_FR",
				"-p",
				potFile,
				"--output-format",
				"json",
				"--output-file",
				outputFile,
				"--save-debug-info",
				"--dry-run",
			]);
			const output = JSON.parse(
				await fs.readFile(outputFile, "utf8"),
			) as {
				readonly debugOutputFile: string;
				readonly status: string;
			};

			expect(error).to.not.equal(undefined);
			expect(output.status).to.equal("dry-run");
			expect(output.debugOutputFile).to.include(".polypot/debug");
		} finally {
			process.chdir(previousCwd);
		}
	});

	it("writes prompt debug details only to the debug file", async () => {
		const previousCwd = process.cwd();
		const projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-debug-output-"),
		);
		tempDirs.push(projectDir);
		const potFile = path.join(projectDir, "messages.pot");
		await fs.writeFile(potFile, POT_FIXTURE);

		try {
			process.chdir(projectDir);
			const { stdout, error } = await runCommand([
				"translate",
				"--json",
				"-l",
				"fr_FR",
				"-p",
				potFile,
				"--dry-run",
				"--save-debug-info",
			]);
			const publicResult = JSON.parse(stdout) as {
				readonly debug?: unknown;
				readonly debugOutputFile: string;
			};
			const debugResult = JSON.parse(
				await fs.readFile(publicResult.debugOutputFile, "utf8"),
			) as {
				readonly debug: readonly unknown[];
			};

			expect(error).to.equal(undefined);
			expect(publicResult.debug).to.equal(undefined);
			expect(debugResult.debug).to.have.length.greaterThan(0);
		} finally {
			process.chdir(previousCwd);
		}
	});

	it("suppresses human success output at --verbose-level 0", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--dry-run",
			"--verbose-level",
			"0",
		]);

		expect(error).to.equal(undefined);
		expect(stdout).to.equal("");
	});

	it("still emits explicit JSON stdout at --verbose-level 0", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--dry-run",
			"--output-format",
			"json",
			"--verbose-level",
			"0",
		]);
		const result = JSON.parse(stdout) as {
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(result.status).to.equal("dry-run");
	});

	it("exposes resolved non-secret translate settings in JSON output", async () => {
		const previousCwd = process.cwd();
		const projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-debug-"),
		);
		tempDirs.push(projectDir);
		const potFile = path.join(projectDir, "messages.pot");
		await fs.writeFile(potFile, POT_FIXTURE);
		process.chdir(projectDir);

		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--input-po-path",
			"base.po",
			"--output-dir",
			"languages",
			"--output-format",
			"json",
			"--po-file-prefix",
			"app-",
			"--locale-format",
			"wp_locale",
			"--use-dictionary",
			"--dictionary-path",
			"dicts",
			"--prompt-file-path",
			"prompt.md",
			"--po-header-template-path",
			"header.json",
			"--batch-size",
			"10",
			"--jobs",
			"3",
			"--timeout",
			"30",
			"--max-strings-per-job",
			"15",
			"--max-total-strings",
			"25",
			"--max-cost",
			"1.25",
			"--max-retries",
			"4",
			"--retry-delay",
			"1000",
			"--abort-on-failure",
			"--skip-language-on-failure",
			"--verbose-level",
			"2",
			"--dry-run",
			"--save-debug-info",
		]).finally(() => {
			process.chdir(previousCwd);
		});
		const result = JSON.parse(stdout) as {
			readonly debugOutputFile: string;
			readonly plan: {
				readonly settings: {
					readonly behavior: {
						readonly dictionaryPath: string;
						readonly poHeaderTemplatePath: string;
						readonly promptFilePath: string;
						readonly useDictionary: boolean;
					};
					readonly debug: {
						readonly saveDebugInfo: boolean;
						readonly verboseLevel: number;
					};
					readonly limits: {
						readonly maxCost: number;
						readonly maxStringsPerJob: number;
						readonly maxTotalStrings: number;
					};
					readonly output: {
						readonly localeFormat: string;
						readonly outputDir: string;
						readonly outputFormat: string;
						readonly poFilePrefix: string;
					};
					readonly performance: {
						readonly timeout: number;
					};
					readonly retries: {
						readonly abortOnFailure: boolean;
						readonly maxRetries: number;
						readonly retryDelay: number;
						readonly skipLanguageOnFailure: boolean;
					};
					readonly source: {
						readonly inputPoPath: string;
						readonly potFilePath: string;
						readonly targetLanguages: readonly string[];
					};
				};
			};
		};
		const settings = result.plan.settings;

		expect(error).to.equal(undefined);
		expect(result.debugOutputFile).to.include(".polypot/debug");
		expect(settings.source).to.deep.include({
			inputPoPath: "base.po",
			potFilePath: potFile,
		});
		expect(settings.source.targetLanguages).to.deep.equal(["fr_FR"]);
		expect(settings.output).to.deep.include({
			localeFormat: "wp_locale",
			outputDir: "languages",
			outputFormat: "json",
			poFilePrefix: "app-",
		});
		expect(settings.behavior).to.deep.include({
			dictionaryPath: "dicts",
			poHeaderTemplatePath: "header.json",
			promptFilePath: "prompt.md",
			useDictionary: true,
		});
		expect(settings.performance.timeout).to.equal(30);
		expect(settings.limits).to.deep.equal({
			maxCost: 1.25,
			maxStringsPerJob: 15,
			maxTotalStrings: 25,
		});
		expect(settings.retries).to.deep.equal({
			abortOnFailure: true,
			maxRetries: 4,
			retryDelay: 1000,
			skipLanguageOnFailure: true,
		});
		expect(settings.debug.saveDebugInfo).to.equal(true);
		expect(settings.debug.verboseLevel).to.equal(2);
	});

	it("keeps JSON language results in requested order", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR,es_ES,de_DE",
			"-p",
			potFile,
			"-j",
			"3",
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly results: readonly {
				readonly language: string;
			}[];
		};

		expect(error).to.equal(undefined);
		expect(
			result.results.map((language) => language.language),
		).to.deep.equal(["fr_FR", "es_ES", "de_DE"]);
	});

	it("uses locale format for planned output filenames", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--output-dir",
			"languages",
			"--locale-format",
			"iso_639_2",
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly results: readonly {
				readonly outputFile: string;
			}[];
		};

		expect(error).to.equal(undefined);
		expect(result.results[0]?.outputFile).to.equal(
			path.join("languages", "fra.po"),
		);
	});

	it("blocks target languages that resolve to the same output file", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"pt_BR,pt_PT",
			"-p",
			potFile,
			"--locale-format",
			"iso_639_1",
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly error: { readonly code: string };
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(result.status).to.equal("blocked");
		expect(result.error.code).to.equal("duplicate_output_file");
		expect(process.exitCode).to.equal(1);
	});

	it("blocks JSON output paths that collide with planned PO output", async () => {
		const potFile = await writePotFixture();
		const outputDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-collision-"),
		);
		tempDirs.push(outputDir);
		const outputFile = path.join(outputDir, "fr_FR.po");
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--output-dir",
			outputDir,
			"--output-format",
			"json",
			"--output-file",
			outputFile,
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly error: {
				readonly code: string;
				readonly collisions: readonly {
					readonly path: string;
					readonly reservations: readonly string[];
				}[];
				readonly suppressOutputFile: boolean;
			};
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(process.exitCode).to.equal(1);
		expect(result.status).to.equal("blocked");
		expect(result.error.code).to.equal("output_path_collision");
		expect(result.error.suppressOutputFile).to.equal(true);
		expect(result.error.collisions[0]?.reservations).to.have.members([
			"po:fr_FR",
			"json_output",
		]);
		try {
			await fs.access(outputFile);
			expect.fail("expected colliding output file not to be written");
		} catch (accessError) {
			expect((accessError as NodeJS.ErrnoException).code).to.equal(
				"ENOENT",
			);
		}
	});

	it("blocks JSON output paths that collide with the input POT file", async () => {
		const potFile = await writePotFixture();
		const before = await fs.readFile(potFile, "utf8");
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--output-format",
			"json",
			"--output-file",
			potFile,
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly error: {
				readonly code: string;
				readonly suppressOutputFile: boolean;
			};
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(process.exitCode).to.equal(1);
		expect(result.status).to.equal("blocked");
		expect(result.error.code).to.equal("output_path_collision");
		expect(result.error.suppressOutputFile).to.equal(true);
		expect(await fs.readFile(potFile, "utf8")).to.equal(before);
	});

	it("blocks a singular input PO path across multiple target languages", async () => {
		const potFile = await writePotFixture();
		const inputPoPath = path.join(path.dirname(potFile), "base.po");
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR,es_ES",
			"-p",
			potFile,
			"--input-po-path",
			inputPoPath,
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly error: {
				readonly code: string;
			};
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(process.exitCode).to.equal(1);
		expect(result.status).to.equal("blocked");
		expect(result.error.code).to.equal("input_po_path_ambiguous");
	});

	it("applies the global string limit to the preview plan", async () => {
		const potFile = await writePotFixture();
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR,es_ES",
			"-p",
			potFile,
			"--max-total-strings",
			"5",
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly results: readonly {
				readonly language: string;
				readonly skippedByLimit: number;
				readonly strings: number;
			}[];
		};
		const frResult = result.results.find(
			(language) => language.language === "fr_FR",
		);
		const esResult = result.results.find(
			(language) => language.language === "es_ES",
		);

		expect(error).to.equal(undefined);
		expect(frResult).to.deep.include({ skippedByLimit: 0, strings: 4 });
		expect(esResult).to.deep.include({ skippedByLimit: 3, strings: 1 });
	});

	it("explains missing target languages without starting work", async () => {
		const { stdout, error } = await runCommand([
			"translate",
			"-p",
			"foo.pot",
			"--dry-run",
		]);

		expect(error).to.equal(undefined);
		expect(stdout).to.include("No target languages are configured");
	});

	it("returns a machine-readable blocker when target languages are missing", async () => {
		const { stdout } = await runCommand([
			"translate",
			"--json",
			"-p",
			"foo.pot",
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly error: {
				readonly code: string;
			};
			readonly status: string;
		};

		expect(process.exitCode).to.equal(1);
		expect(result.status).to.equal("blocked");
		expect(result.error.code).to.equal("missing_target_languages");
	});

	it("returns structured JSON when the POT file cannot be read", async () => {
		const missingPotFile = path.join(
			os.tmpdir(),
			"polypot-missing-messages.pot",
		);
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR",
			"-p",
			missingPotFile,
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly error: {
				readonly code: string;
				readonly potFilePath: string;
			};
			readonly results: readonly unknown[];
			readonly status: string;
			readonly summary: string;
		};

		expect(error).to.equal(undefined);
		expect(result.status).to.equal("blocked");
		expect(result.results).to.deep.equal([]);
		expect(result.error.code).to.equal("pot_analysis_failed");
		expect(result.error.potFilePath).to.equal(missingPotFile);
		expect(result.summary).to.include("Cannot read or parse POT file");
	});

	it("writes structured output when the POT file cannot be parsed", async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-malformed-"),
		);
		tempDirs.push(tempDir);
		const potFile = path.join(tempDir, "messages.pot");
		const outputFile = path.join(tempDir, "preview.json");
		await fs.writeFile(potFile, "\0\0");

		const { error } = await runCommand([
			"translate",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--output-format",
			"json",
			"--output-file",
			outputFile,
			"--dry-run",
		]);
		const result = JSON.parse(await fs.readFile(outputFile, "utf8")) as {
			readonly error: {
				readonly code: string;
				readonly potFilePath: string;
			};
			readonly status: string;
		};

		expect(error).to.equal(undefined);
		expect(result.status).to.equal("blocked");
		expect(result.error).to.deep.include({
			code: "pot_analysis_failed",
			potFilePath: potFile,
		});
	});

	it("strips terminal controls from human path output", async () => {
		const tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-ansi-"),
		);
		tempDirs.push(tempDir);
		const potFile = path.join(tempDir, "messages\u001B[31m.pot");
		const outputFile = path.join(tempDir, "preview\u001B[31m.json");
		await fs.writeFile(potFile, POT_FIXTURE);

		const { stdout, error } = await runCommand([
			"translate",
			"-l",
			"fr_FR",
			"-p",
			potFile,
			"--output-file",
			outputFile,
			"--dry-run",
		]);

		expect(error).to.equal(undefined);
		expect(stdout).to.include("messages.pot");
		expect(stdout).to.include("preview.json");
		expect(stdout).not.to.include("\u001B[31m");
	});

	it("loads project config overrides from the current working directory", async () => {
		const previousCwd = process.cwd();
		const projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-project-"),
		);

		try {
			await fs.mkdir(path.join(projectDir, ".polypot"));
			await fs.writeFile(path.join(projectDir, "foo.pot"), POT_FIXTURE);
			await fs.writeFile(
				path.join(projectDir, ".polypot", "config.yaml"),
				"provider:\n  model: project-model\nsource:\n  sourceLanguage: it_IT\n  targetLanguages:\n    - fr_FR\n",
			);
			process.chdir(projectDir);

			const { stdout, error } = await runCommand([
				"translate",
				"--json",
				"-p",
				"foo.pot",
				"--dry-run",
			]);
			const result = JSON.parse(stdout) as {
				readonly plan: {
					readonly languages: readonly string[];
					readonly model: string;
					readonly sourceLanguage: string;
				};
			};

			expect(error).to.equal(undefined);
			expect(result.plan.model).to.equal("project-model");
			expect(result.plan.sourceLanguage).to.equal("it_IT");
			expect(result.plan.languages).to.deep.equal(["fr_FR"]);
		} finally {
			process.chdir(previousCwd);
			await fs.rm(projectDir, { recursive: true, force: true });
		}
	});

	it("resolves relative POT paths from an explicit project config file", async () => {
		const previousCwd = process.cwd();
		const projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-config-path-"),
		);
		const otherDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-other-cwd-"),
		);

		try {
			await fs.mkdir(path.join(projectDir, ".polypot"));
			await fs.writeFile(
				path.join(projectDir, "messages.pot"),
				POT_FIXTURE,
			);
			const configPath = path.join(projectDir, ".polypot", "config.yaml");
			await fs.writeFile(
				configPath,
				"source:\n  potFilePath: messages.pot\n  targetLanguages:\n    - fr_FR\noutput:\n  outputDir: languages\ndebug:\n  saveDebugInfo: true\n",
			);
			process.chdir(otherDir);

			const { stdout, error } = await runCommand([
				"translate",
				"--json",
				"--config",
				configPath,
				"--dry-run",
			]);
			const result = JSON.parse(stdout) as {
				readonly analysis: {
					readonly filePath: string;
				};
				readonly debugOutputFile: string;
				readonly results: readonly {
					readonly outputFile: string;
				}[];
				readonly status: string;
			};

			expect(error).to.equal(undefined);
			expect(result.status).to.equal("dry-run");
			expect(result.analysis.filePath).to.equal(
				path.join(projectDir, "messages.pot"),
			);
			expect(result.debugOutputFile).to.include(
				path.join(projectDir, ".polypot", "debug"),
			);
			expect(result.results[0]?.outputFile).to.equal(
				path.join(projectDir, "languages", "fr_FR.po"),
			);
			await fs.access(result.debugOutputFile);
		} finally {
			process.chdir(previousCwd);
			await fs.rm(projectDir, { recursive: true, force: true });
			await fs.rm(otherDir, { recursive: true, force: true });
		}
	});

	it("writes config-sourced output files relative to an explicit project config file", async () => {
		const previousCwd = process.cwd();
		const projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-config-output-"),
		);
		const otherDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-translate-other-cwd-"),
		);

		try {
			await fs.mkdir(path.join(projectDir, ".polypot"));
			await fs.writeFile(
				path.join(projectDir, "messages.pot"),
				POT_FIXTURE,
			);
			const configPath = path.join(projectDir, ".polypot", "config.yaml");
			await fs.writeFile(
				configPath,
				"source:\n  potFilePath: messages.pot\n  targetLanguages:\n    - fr_FR\noutput:\n  outputFormat: json\n  outputFile: preview.json\n",
			);
			process.chdir(otherDir);

			const { error } = await runCommand([
				"translate",
				"--config",
				configPath,
				"--dry-run",
				"--verbose-level",
				"0",
			]);
			const outputFile = path.join(projectDir, "preview.json");
			const result = JSON.parse(
				await fs.readFile(outputFile, "utf8"),
			) as {
				readonly status: string;
			};

			expect(error).to.equal(undefined);
			expect(result.status).to.equal("dry-run");
		} finally {
			process.chdir(previousCwd);
			await fs.rm(projectDir, { recursive: true, force: true });
			await fs.rm(otherDir, { recursive: true, force: true });
		}
	});
});
