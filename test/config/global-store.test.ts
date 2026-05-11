import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
	readGlobalConfig,
	readGlobalSecrets,
	writeGlobalConfig,
	writeGlobalSecrets,
} from "../../src/config/global-store.js";
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
