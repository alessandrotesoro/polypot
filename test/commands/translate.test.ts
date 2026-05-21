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

describe("polypot translate", () => {
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
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR,es_ES",
			"-p",
			"foo.pot",
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

	it("renders a UI-only translation preview with per-language progress", async () => {
		const { stdout, error } = await runCommand([
			"translate",
			"-l",
			"fr_FR",
			"-p",
			"foo.pot",
			"--batch-size",
			"20",
			"--dry-run",
			"--verbose-level",
			"2",
		]);

		expect(error).to.equal(undefined);
		expect(stdout).to.include("fr_FR");
		expect(stdout).to.include("------------------------ 0% (0/60 strings)");
		expect(stdout).to.include(
			"######################## 100% (60/60 strings)",
		);
		expect(stdout).to.include("preview complete, no translations written");
		expect(stdout).to.include("Translation logic is not implemented yet.");
	});

	it("exposes the resolved appConfig defaults in JSON output", async () => {
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR",
			"-p",
			"foo.pot",
			"--dry-run",
		]);
		const result = JSON.parse(stdout) as {
			readonly plan: {
				readonly batchSize: number;
				readonly provider: string;
			};
			readonly status: string;
			readonly summary: string;
		};

		expect(error).to.equal(undefined);
		expect(result.status).to.equal("previewed");
		expect(result.plan.provider).to.equal("openai");
		expect(result.plan.batchSize).to.equal(20);
		expect(result.summary).to.include(
			"Translation logic is not implemented yet.",
		);
	});

	it("keeps JSON language results in requested order", async () => {
		const { stdout, error } = await runCommand([
			"translate",
			"--json",
			"-l",
			"fr_FR,es_ES,de_DE",
			"-p",
			"foo.pot",
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
