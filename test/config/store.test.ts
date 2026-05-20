import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
	readGlobalConfig,
	readGlobalSecrets,
	readProjectConfig,
	readProjectSecrets,
	writeGlobalConfig,
	writeGlobalSecrets,
	writeProjectConfig,
	writeProjectSecrets,
} from "../../src/config/store.js";
import {
	DEFAULT_OPENAI_MODEL,
	DEFAULT_SOURCE_LANGUAGE,
} from "../../src/config/schema.js";

/**
 * Create a temporary config directory.
 *
 * @returns Path to the temporary config directory.
 */
async function tempConfigDir(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), "polypot-global-store-"));
}

describe("global config store", () => {
	it("reads missing global files as defaults with missing secrets", async () => {
		const configDir = await tempConfigDir();
		const config = await readGlobalConfig({ configDir, cwd: configDir });
		const secrets = await readGlobalSecrets({ configDir, cwd: configDir });

		expect(config.provider.provider).to.equal("openai");
		expect(config.provider.model).to.equal(DEFAULT_OPENAI_MODEL);
		expect(config.source.sourceLanguage).to.equal(DEFAULT_SOURCE_LANGUAGE);
		expect(secrets.openaiApiKey).to.equal(undefined);
		expect(secrets.hasOpenaiApiKey).to.equal(false);
	});

	it("round-trips global YAML through the schema", async () => {
		const configDir = await tempConfigDir();

		await writeGlobalConfig({
			configDir,
			cwd: configDir,
			config: {
				provider: {
					provider: "openai",
					model: DEFAULT_OPENAI_MODEL,
					temperature: 0.2,
				},
				source: {
					sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
					targetLanguages: ["fr_FR", "es_ES"],
				},
			},
		});

		const config = await readGlobalConfig({ configDir, cwd: configDir });
		const yaml = await fs.readFile(
			path.join(configDir, "config.yaml"),
			"utf8",
		);

		expect(config.provider.temperature).to.equal(0.2);
		expect(config.source.targetLanguages).to.deep.equal(["fr_FR", "es_ES"]);
		expect(yaml).to.not.include("OPENAI_API_KEY");
	});

	it("writes and reads OPENAI_API_KEY only from global .env", async () => {
		const configDir = await tempConfigDir();

		await writeGlobalSecrets({
			configDir,
			cwd: configDir,
			secrets: { openaiApiKey: "sk-test-secret" },
		});

		const secrets = await readGlobalSecrets({ configDir, cwd: configDir });
		const env = await fs.readFile(path.join(configDir, ".env"), "utf8");

		expect(secrets.openaiApiKey).to.equal("sk-test-secret");
		expect(secrets.hasOpenaiApiKey).to.equal(true);
		expect(env).to.include("OPENAI_API_KEY=sk-test-secret");
	});

	it("replaces existing OPENAI_API_KEY lines using the same matching rule as reads", async () => {
		const configDir = await tempConfigDir();
		await fs.writeFile(
			path.join(configDir, ".env"),
			"OTHER=value\n  OPENAI_API_KEY=sk-old-secret\n",
		);

		await writeGlobalSecrets({
			configDir,
			cwd: configDir,
			secrets: { openaiApiKey: "sk-new-secret" },
		});

		const secrets = await readGlobalSecrets({ configDir, cwd: configDir });
		const env = await fs.readFile(path.join(configDir, ".env"), "utf8");

		expect(secrets.openaiApiKey).to.equal("sk-new-secret");
		expect(env).to.include("OTHER=value");
		expect(env).to.not.include("sk-old-secret");
	});

	it("writes config directories and files with restrictive permissions on POSIX", async function () {
		if (process.platform === "win32") this.skip();
		const configDir = await tempConfigDir();

		await writeGlobalConfig({ configDir, cwd: configDir, config: {} });
		await writeGlobalSecrets({
			configDir,
			cwd: configDir,
			secrets: { openaiApiKey: "sk-test-secret" },
		});

		const directoryMode = (await fs.stat(configDir)).mode & 0o777;
		const configMode =
			(await fs.stat(path.join(configDir, "config.yaml"))).mode & 0o777;
		const envMode =
			(await fs.stat(path.join(configDir, ".env"))).mode & 0o777;

		expect(directoryMode).to.equal(0o700);
		expect(configMode).to.equal(0o600);
		expect(envMode).to.equal(0o600);
	});

	it("throws a contextual error for malformed global YAML", async () => {
		const configDir = await tempConfigDir();
		await fs.writeFile(path.join(configDir, "config.yaml"), "provider: [");

		try {
			await readGlobalConfig({ configDir, cwd: configDir });
			expect.fail("expected readGlobalConfig to throw");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
			if (!(error instanceof Error)) throw error;
			expect(error.message).to.include("Failed to read global config");
			expect(error.message).to.include("config.yaml");
		}
	});

	it("throws a contextual error when config existence cannot be checked", async function () {
		if (process.platform === "win32" || process.getuid?.() === 0)
			this.skip();
		const parentDir = await tempConfigDir();
		const configDir = path.join(parentDir, "locked");
		await fs.mkdir(configDir, { mode: 0o700 });
		await fs.chmod(configDir, 0o000);

		try {
			await readGlobalConfig({ configDir, cwd: configDir });
			expect.fail("expected readGlobalConfig to throw");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
			if (error instanceof Error) {
				expect(error.message).to.include(
					"Failed to read global config",
				);
				expect(error.message).to.include("config.yaml");
			}
		} finally {
			await fs.chmod(configDir, 0o700);
		}
	});
});

describe("project config store", () => {
	it("reads missing project files as defaults with missing secrets", async () => {
		const projectDir = await tempConfigDir();
		const config = await readProjectConfig({
			configDir: path.join(projectDir, "global"),
			cwd: projectDir,
		});
		const secrets = await readProjectSecrets({
			configDir: path.join(projectDir, "global"),
			cwd: projectDir,
		});

		expect(config.provider.provider).to.equal("openai");
		expect(config.provider.model).to.equal(DEFAULT_OPENAI_MODEL);
		expect(config.source.sourceLanguage).to.equal(DEFAULT_SOURCE_LANGUAGE);
		expect(secrets.openaiApiKey).to.equal(undefined);
		expect(secrets.hasOpenaiApiKey).to.equal(false);
	});

	it("round-trips project YAML through the schema", async () => {
		const projectDir = await tempConfigDir();

		await writeProjectConfig({
			configDir: path.join(projectDir, "global"),
			cwd: projectDir,
			config: {
				source: {
					sourceLanguage: "en_US",
					targetLanguages: ["it_IT"],
				},
			},
		});

		const config = await readProjectConfig({
			configDir: path.join(projectDir, "global"),
			cwd: projectDir,
		});
		const yaml = await fs.readFile(
			path.join(projectDir, ".polypot", "config.yaml"),
			"utf8",
		);

		expect(config.source.targetLanguages).to.deep.equal(["it_IT"]);
		expect(yaml).to.not.include("OPENAI_API_KEY");
	});

	it("writes sparse project YAML without materializing schema defaults", async () => {
		const projectDir = await tempConfigDir();

		await writeProjectConfig({
			configDir: path.join(projectDir, "global"),
			cwd: projectDir,
			config: {
				source: {
					sourceLanguage: "it_IT",
					targetLanguages: ["fr_FR"],
				},
			},
		});

		const yaml = await fs.readFile(
			path.join(projectDir, ".polypot", "config.yaml"),
			"utf8",
		);

		expect(yaml).to.include("source:");
		expect(yaml).to.not.include("provider:");
		expect(yaml).to.not.include("behavior:");
		expect(yaml).to.not.include("performance:");
		expect(yaml).to.not.include("retries:");
	});

	it("writes and reads OPENAI_API_KEY only from project .env", async () => {
		const projectDir = await tempConfigDir();

		await writeProjectSecrets({
			configDir: path.join(projectDir, "global"),
			cwd: projectDir,
			secrets: { openaiApiKey: "sk-project-secret" },
		});

		const secrets = await readProjectSecrets({
			configDir: path.join(projectDir, "global"),
			cwd: projectDir,
		});
		const env = await fs.readFile(
			path.join(projectDir, ".polypot", ".env"),
			"utf8",
		);

		expect(secrets.openaiApiKey).to.equal("sk-project-secret");
		expect(secrets.hasOpenaiApiKey).to.equal(true);
		expect(env).to.include("OPENAI_API_KEY=sk-project-secret");
	});

	it("writes project env files with restrictive permissions on POSIX", async function () {
		if (process.platform === "win32") this.skip();
		const projectDir = await tempConfigDir();

		await writeProjectConfig({
			configDir: path.join(projectDir, "global"),
			cwd: projectDir,
			config: {},
		});
		await writeProjectSecrets({
			configDir: path.join(projectDir, "global"),
			cwd: projectDir,
			secrets: { openaiApiKey: "sk-project-secret" },
		});

		const projectConfigMode =
			(await fs.stat(path.join(projectDir, ".polypot", "config.yaml")))
				.mode & 0o777;
		const projectEnvMode =
			(await fs.stat(path.join(projectDir, ".polypot", ".env"))).mode &
			0o777;

		expect(projectConfigMode).to.equal(0o644);
		expect(projectEnvMode).to.equal(0o600);
	});

	it("throws a contextual error for malformed project YAML", async () => {
		const projectDir = await tempConfigDir();
		await fs.mkdir(path.join(projectDir, ".polypot"));
		await fs.writeFile(
			path.join(projectDir, ".polypot", "config.yaml"),
			"provider: [",
		);

		try {
			await readProjectConfig({
				configDir: path.join(projectDir, "global"),
				cwd: projectDir,
			});
			expect.fail("expected readProjectConfig to throw");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
			if (!(error instanceof Error)) throw error;
			expect(error.message).to.include("Failed to read project config");
			expect(error.message).to.include("config.yaml");
		}
	});

	it("throws a contextual error when .polypot is a file", async () => {
		const projectDir = await tempConfigDir();
		await fs.writeFile(path.join(projectDir, ".polypot"), "not a dir");

		try {
			await writeProjectConfig({
				configDir: path.join(projectDir, "global"),
				cwd: projectDir,
				config: {},
			});
			expect.fail("expected writeProjectConfig to throw");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
			if (!(error instanceof Error)) throw error;
			expect(error.message).to.include("Failed to write project config");
			expect(error.message).to.include(".polypot");
		}
	});

	it("refuses to write project config through a symlink on POSIX", async function () {
		if (process.platform === "win32") this.skip();
		const projectDir = await tempConfigDir();
		const targetPath = path.join(projectDir, "outside.yaml");
		await fs.mkdir(path.join(projectDir, ".polypot"));
		await fs.writeFile(targetPath, "provider:\n  model: outside\n");
		await fs.symlink(
			targetPath,
			path.join(projectDir, ".polypot", "config.yaml"),
		);

		try {
			await writeProjectConfig({
				configDir: path.join(projectDir, "global"),
				cwd: projectDir,
				config: {},
			});
			expect.fail("expected writeProjectConfig to throw");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
			if (!(error instanceof Error)) throw error;
			expect(error.message).to.include("Refusing to write through symlink");
		}
	});

	it("refuses to write project config through a symlinked .polypot directory on POSIX", async function () {
		if (process.platform === "win32") this.skip();
		const projectDir = await tempConfigDir();
		const targetDir = path.join(projectDir, "outside-polypot");
		await fs.mkdir(targetDir);
		await fs.symlink(targetDir, path.join(projectDir, ".polypot"));

		try {
			await writeProjectConfig({
				configDir: path.join(projectDir, "global"),
				cwd: projectDir,
				config: {},
			});
			expect.fail("expected writeProjectConfig to throw");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
			if (!(error instanceof Error)) throw error;
			expect(error.message).to.include(
				"Refusing to use symlinked config directory",
			);
		}
	});

	it("refuses to write project secrets through a symlink on POSIX", async function () {
		if (process.platform === "win32") this.skip();
		const projectDir = await tempConfigDir();
		const targetPath = path.join(projectDir, "outside.env");
		await fs.mkdir(path.join(projectDir, ".polypot"));
		await fs.writeFile(targetPath, "OPENAI_API_KEY=sk-outside\n");
		await fs.symlink(targetPath, path.join(projectDir, ".polypot", ".env"));

		try {
			await writeProjectSecrets({
				configDir: path.join(projectDir, "global"),
				cwd: projectDir,
				secrets: { openaiApiKey: "sk-project-secret" },
			});
			expect.fail("expected writeProjectSecrets to throw");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
			if (!(error instanceof Error)) throw error;
			expect(error.message).to.include("Refusing to write through symlink");
		}
	});

	it("refuses to write project secrets through a symlinked .polypot directory on POSIX", async function () {
		if (process.platform === "win32") this.skip();
		const projectDir = await tempConfigDir();
		const targetDir = path.join(projectDir, "outside-polypot");
		await fs.mkdir(targetDir);
		await fs.symlink(targetDir, path.join(projectDir, ".polypot"));

		try {
			await writeProjectSecrets({
				configDir: path.join(projectDir, "global"),
				cwd: projectDir,
				secrets: { openaiApiKey: "sk-project-secret" },
			});
			expect.fail("expected writeProjectSecrets to throw");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
			if (!(error instanceof Error)) throw error;
			expect(error.message).to.include(
				"Refusing to use symlinked config directory",
			);
		}
	});
});
