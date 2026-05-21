import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "@oclif/test";
import { expect } from "chai";

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
		expect(result.implemented).to.equal(false);
		expect(result.mode).to.equal("ui-preview");
		expect(result.status).to.equal("previewed");
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
		const invalidValues = ["../escape", "fr/FR", "fr\\FR", "", "C:fr_FR"];

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
		expect(stdout).to.include(
			"4 strings, 1 plural, 1 with context, 1 fuzzy",
		);
		expect(stdout).to.include("fr_FR");
		expect(stdout).to.include("------------------------ 0% (0/4 strings)");
		expect(stdout).to.include(
			"######################## 100% (4/4 strings)",
		);
		expect(stdout).to.include("preview complete, no translations written");
		expect(stdout).to.include("No translations were generated.");
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
		expect(result.status).to.equal("previewed");
		expect(result.analysis.totalStrings).to.equal(4);
		expect(result.plan.provider).to.equal("openai");
		expect(result.plan.batchSize).to.equal(20);
		expect(result.summary).to.include("No translations were generated.");
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
			expect(stdout).to.include("JSON preview written to:");
			expect(stdout).to.not.include("not written");
			expect(output.status).to.equal("previewed");
			expect(output.results[0]?.language).to.equal("fr_FR");
		} finally {
			await fs.rm(outputDir, { recursive: true, force: true });
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
		expect(result.status).to.equal("previewed");
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
			"fr_FR,es_ES",
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
		expect(settings.source.targetLanguages).to.deep.equal([
			"fr_FR",
			"es_ES",
		]);
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
});
