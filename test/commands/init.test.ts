import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand } from "@oclif/test";
import { expect } from "chai";
import {
	readProjectConfig,
	readProjectSecrets,
	writeGlobalConfig,
} from "../../src/config/store.js";
import {
	DEFAULT_OPENAI_MODEL,
	DEFAULT_SOURCE_LANGUAGE,
} from "../../src/config/schema.js";
import { setInitPromptAdapterForTests } from "../../src/init/prompts.js";
import { adapterFromAnswers } from "../helpers/prompt-adapter.js";

/**
 * Build a temporary project directory.
 *
 * @returns Project path.
 */
function tempProjectDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "polypot-init-"));
}

/**
 * Clean up a temporary project directory.
 *
 * @param projectDir Project path.
 */
function removeTempProjectDir(projectDir: string): void {
	setInitPromptAdapterForTests(undefined);
	fs.rmSync(projectDir, { recursive: true, force: true });
}

function projectStoreOptions(projectDir: string): {
	readonly configDir: string;
	readonly cwd: string;
} {
	return {
		configDir: path.join(projectDir, "global"),
		cwd: projectDir,
	};
}

describe("polypot init", () => {
	it("lists --force, --cwd, --[no-]gitignore, --yes in --help", async () => {
		const { stdout } = await runCommand(["init", "--help"]);
		expect(stdout).to.include("--force");
		expect(stdout).to.include("--cwd");
		expect(stdout).to.include("--[no-]gitignore");
		expect(stdout).to.include("--yes");
		expect(stdout).to.include("--source-language");
		expect(stdout).to.include("--target-languages");
		expect(stdout).to.include("--pot-file-path");
		expect(stdout).to.include("--output-dir");
		expect(stdout).to.include("--api-key");
		expect(stdout).to.not.include("--no-config");
	});

	it("--yes writes project config defaults without prompting", async () => {
		const projectDir = tempProjectDir();
		try {
			const { stdout, error } = await runCommand([
				"init",
				"--yes",
				"--cwd",
				projectDir,
			]);
			const config = await readProjectConfig(
				projectStoreOptions(projectDir),
			);

			expect(error).to.equal(undefined);
			expect(stdout).to.include("Project Polypot config saved.");
			expect(stdout).to.include("OPENAI_API_KEY: missing");
			expect(fs.existsSync(path.join(projectDir, ".polypot"))).to.equal(
				true,
			);
			expect(config.provider.model).to.equal(DEFAULT_OPENAI_MODEL);
			expect(config.source.sourceLanguage).to.equal(
				DEFAULT_SOURCE_LANGUAGE,
			);
			expect(
				fs.existsSync(path.join(projectDir, ".polypot", ".env")),
			).to.equal(false);
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("--yes does not write global provider defaults as project overrides", async () => {
		const projectDir = tempProjectDir();
		try {
			await writeGlobalConfig({
				...projectStoreOptions(projectDir),
				config: {
					provider: {
						model: "global-model",
						provider: "openai",
						temperature: 0.2,
					},
				},
			});

			const { error } = await runCommand([
				"init",
				"--yes",
				"--cwd",
				projectDir,
			]);
			const projectYaml = fs.readFileSync(
				path.join(projectDir, ".polypot", "config.yaml"),
				"utf8",
			);

			expect(error).to.equal(undefined);
			expect(projectYaml).to.not.include("global-model");
			expect(projectYaml).to.not.include("provider:");
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("--yes accepts project values from flags without prompting", async () => {
		const projectDir = tempProjectDir();
		try {
			const { stdout, error } = await runCommand([
				"init",
				"--yes",
				"--cwd",
				projectDir,
				"--source-language",
				"it_IT",
				"--target-languages",
				"fr_FR,es_ES",
				"--pot-file-path",
				"translations.pot",
				"--output-dir",
				"languages",
				"--api-key",
				"sk-project-secret",
			]);
			const config = await readProjectConfig(
				projectStoreOptions(projectDir),
			);
			const secrets = await readProjectSecrets(
				projectStoreOptions(projectDir),
			);

			expect(error).to.equal(undefined);
			expect(stdout).to.include("OPENAI_API_KEY: present");
			expect(stdout).to.not.include("sk-project-secret");
			expect(config.source.sourceLanguage).to.equal("it_IT");
			expect(config.source.targetLanguages).to.deep.equal([
				"fr_FR",
				"es_ES",
			]);
			expect(config.source.potFilePath).to.equal("translations.pot");
			expect(config.output.outputDir).to.equal("languages");
			expect(secrets.openaiApiKey).to.equal("sk-project-secret");
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("--json returns machine-readable init output", async () => {
		const projectDir = tempProjectDir();
		try {
			const { stdout, error } = await runCommand([
				"init",
				"--json",
				"--yes",
				"--cwd",
				projectDir,
			]);
			const result = JSON.parse(stdout) as {
				readonly status: string;
				readonly projectConfig: string;
				readonly projectSecrets: string;
				readonly openaiApiKey: string;
				readonly gitignore: string;
			};

			expect(error).to.equal(undefined);
			expect(result.status).to.equal("saved");
			expect(result.projectConfig).to.equal(
				path.join(projectDir, ".polypot", "config.yaml"),
			);
			expect(result.projectSecrets).to.equal(
				path.join(projectDir, ".polypot", ".env"),
			);
			expect(result.openaiApiKey).to.equal("missing");
			expect(result.gitignore).to.equal(".polypot/.env");
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("runs the interactive init flow and writes selected values", async () => {
		const projectDir = tempProjectDir();
		try {
			setInitPromptAdapterForTests(
				adapterFromAnswers({
					confirms: [true],
					passwords: ["sk-project-secret"],
					inputs: ["translations.pot", "languages"],
					selects: ["en_US"],
					checkboxes: [["fr_FR", "es_ES"]],
				}),
			);

			const { stdout, error } = await runCommand([
				"init",
				"--cwd",
				projectDir,
			]);
			const config = await readProjectConfig(
				projectStoreOptions(projectDir),
			);
			const secrets = await readProjectSecrets(
				projectStoreOptions(projectDir),
			);

			expect(error).to.equal(undefined);
			expect(stdout).to.include("OPENAI_API_KEY: present");
			expect(stdout).to.not.include("sk-project-secret");
			expect(config.source.sourceLanguage).to.equal("en_US");
			expect(config.source.targetLanguages).to.deep.equal([
				"fr_FR",
				"es_ES",
			]);
			expect(config.source.potFilePath).to.equal("translations.pot");
			expect(config.output.outputDir).to.equal("languages");
			expect(secrets.openaiApiKey).to.equal("sk-project-secret");
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("adds .polypot/.env to .gitignore by default", async () => {
		const projectDir = tempProjectDir();
		try {
			fs.writeFileSync(
				path.join(projectDir, ".gitignore"),
				"# existing rules\nnode_modules/\n",
			);

			const { error } = await runCommand([
				"init",
				"--yes",
				"--cwd",
				projectDir,
			]);
			const gitignore = fs.readFileSync(
				path.join(projectDir, ".gitignore"),
				"utf8",
			);

			expect(error).to.equal(undefined);
			expect(gitignore).to.include("node_modules/");
			expect(gitignore).to.include(".polypot/.env");
			expect(gitignore.match(/\.polypot\/\.env/g)).to.have.length(1);
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("creates .gitignore when missing by default", async () => {
		const projectDir = tempProjectDir();
		try {
			const { error } = await runCommand([
				"init",
				"--yes",
				"--cwd",
				projectDir,
			]);

			expect(error).to.equal(undefined);
			expect(
				fs.readFileSync(path.join(projectDir, ".gitignore"), "utf8"),
			).to.equal(".polypot/.env\n");
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("--no-gitignore leaves gitignore unchanged", async () => {
		const projectDir = tempProjectDir();
		const gitignorePath = path.join(projectDir, ".gitignore");
		const originalGitignore = "# existing rules\nnode_modules/\n";
		fs.writeFileSync(gitignorePath, originalGitignore);
		try {
			const { stdout, error } = await runCommand([
				"init",
				"--no-gitignore",
				"--yes",
				"--cwd",
				projectDir,
			]);
			expect(error).to.equal(undefined);
			expect(stdout).to.not.include("gitignore:");
			expect(fs.readFileSync(gitignorePath, "utf8")).to.equal(
				originalGitignore,
			);
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("--no-gitignore does not create .gitignore when missing", async () => {
		const projectDir = tempProjectDir();
		try {
			const { error } = await runCommand([
				"init",
				"--no-gitignore",
				"--yes",
				"--cwd",
				projectDir,
			]);

			expect(error).to.equal(undefined);
			expect(fs.existsSync(path.join(projectDir, ".gitignore"))).to.equal(
				false,
			);
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("does not duplicate an existing gitignore entry", async () => {
		const projectDir = tempProjectDir();
		try {
			fs.writeFileSync(
				path.join(projectDir, ".gitignore"),
				".polypot/.env\n",
			);

			await runCommand(["init", "--yes", "--cwd", projectDir]);
			await runCommand(["init", "--force", "--yes", "--cwd", projectDir]);
			const gitignore = fs.readFileSync(
				path.join(projectDir, ".gitignore"),
				"utf8",
			);

			expect(gitignore.match(/\.polypot\/\.env/g)).to.have.length(1);
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("appends a final ignore entry when a later negation exposes project env", async () => {
		const projectDir = tempProjectDir();
		try {
			fs.writeFileSync(
				path.join(projectDir, ".gitignore"),
				".polypot/.env\n!.polypot/.env\n",
			);

			const { error } = await runCommand([
				"init",
				"--yes",
				"--cwd",
				projectDir,
			]);
			const gitignore = fs.readFileSync(
				path.join(projectDir, ".gitignore"),
				"utf8",
			);

			expect(error).to.equal(undefined);
			expect(gitignore).to.equal(
				".polypot/.env\n!.polypot/.env\n.polypot/.env\n",
			);
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("does not write project secrets when gitignore update fails", async () => {
		const projectDir = tempProjectDir();
		try {
			fs.mkdirSync(path.join(projectDir, ".gitignore"));

			const { error } = await runCommand([
				"init",
				"--yes",
				"--cwd",
				projectDir,
				"--api-key",
				"sk-project-secret",
			]);

			expect(error).to.not.equal(undefined);
			expect(
				fs.existsSync(path.join(projectDir, ".polypot", ".env")),
			).to.equal(false);
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("leaves existing files unchanged when update is declined", async () => {
		const projectDir = tempProjectDir();
		try {
			fs.mkdirSync(path.join(projectDir, ".polypot"));
			const configPath = path.join(projectDir, ".polypot", "config.yaml");
			const envPath = path.join(projectDir, ".polypot", ".env");
			fs.writeFileSync(
				configPath,
				"provider:\n  model: existing-model\n",
			);
			fs.writeFileSync(envPath, "OPENAI_API_KEY=sk-existing-secret\n");
			const beforeConfig = fs.readFileSync(configPath, "utf8");
			const beforeEnv = fs.readFileSync(envPath, "utf8");
			setInitPromptAdapterForTests(
				adapterFromAnswers({
					confirms: [false],
					passwords: [],
					inputs: [],
				}),
			);

			const { stdout, error } = await runCommand([
				"init",
				"--cwd",
				projectDir,
			]);

			expect(error).to.equal(undefined);
			expect(stdout).to.include("Init cancelled.");
			expect(fs.readFileSync(configPath, "utf8")).to.equal(beforeConfig);
			expect(fs.readFileSync(envPath, "utf8")).to.equal(beforeEnv);
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("--force updates existing config without asking for confirmation", async () => {
		const projectDir = tempProjectDir();
		try {
			fs.mkdirSync(path.join(projectDir, ".polypot"));
			fs.writeFileSync(
				path.join(projectDir, ".polypot", "config.yaml"),
				"provider:\n  model: existing-model\n",
			);
			setInitPromptAdapterForTests(
				adapterFromAnswers({
					confirms: [false],
					passwords: [],
					inputs: ["", "."],
					selects: ["it_IT"],
					checkboxes: [["de_DE"]],
				}),
			);

			const { error } = await runCommand([
				"init",
				"--force",
				"--cwd",
				projectDir,
			]);
			const config = await readProjectConfig(
				projectStoreOptions(projectDir),
			);

			expect(error).to.equal(undefined);
			expect(config.source.sourceLanguage).to.equal("it_IT");
			expect(config.source.targetLanguages).to.deep.equal(["de_DE"]);
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("clears existing optional paths when prompt answers are blank", async () => {
		const projectDir = tempProjectDir();
		try {
			fs.mkdirSync(path.join(projectDir, ".polypot"));
			fs.writeFileSync(
				path.join(projectDir, ".polypot", "config.yaml"),
				"source:\n  potFilePath: old.pot\noutput:\n  outputDir: old-output\n",
			);
			setInitPromptAdapterForTests(
				adapterFromAnswers({
					checkboxes: [["de_DE"]],
					confirms: [false],
					inputs: ["", ""],
					passwords: [],
					selects: ["it_IT"],
				}),
			);

			const { error } = await runCommand([
				"init",
				"--force",
				"--cwd",
				projectDir,
			]);
			const config = await readProjectConfig(
				projectStoreOptions(projectDir),
			);
			const projectYaml = fs.readFileSync(
				path.join(projectDir, ".polypot", "config.yaml"),
				"utf8",
			);

			expect(error).to.equal(undefined);
			expect(config.source.potFilePath).to.equal(undefined);
			expect(config.output.outputDir).to.equal(".");
			expect(projectYaml).to.not.include("old.pot");
			expect(projectYaml).to.not.include("old-output");
		} finally {
			removeTempProjectDir(projectDir);
		}
	});

	it("errors when --cwd points at a missing directory", async () => {
		const projectDir = path.join(
			os.tmpdir(),
			`polypot-missing-${Date.now()}`,
		);
		const { error } = await runCommand([
			"init",
			"--yes",
			"--cwd",
			projectDir,
		]);

		expect(error).to.not.equal(undefined);
		expect(fs.existsSync(projectDir)).to.equal(false);
	});

	it("errors when .polypot is a file", async () => {
		const projectDir = tempProjectDir();
		try {
			fs.writeFileSync(path.join(projectDir, ".polypot"), "not a dir");

			const { error } = await runCommand([
				"init",
				"--yes",
				"--cwd",
				projectDir,
			]);

			expect(error).to.not.equal(undefined);
		} finally {
			removeTempProjectDir(projectDir);
		}
	});
});
