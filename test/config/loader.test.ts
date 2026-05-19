import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
	loadPolypotConfig,
	loadPolypotRuntimeConfig,
} from "../../src/config/loader.js";
import { resolveConfigPaths } from "../../src/config/paths.js";
import { DEFAULT_OPENAI_MODEL } from "../../src/config/schema.js";

/**
 * Create a temporary config directory.
 *
 * @returns Path to the temporary config directory.
 */
async function tempConfigDir(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), "polypot-loader-"));
}

describe("loadPolypotConfig", () => {
	it("returns a valid PolypotConfig with defaults", async () => {
		const config = await loadPolypotConfig({
			configDir: "/tmp/x",
			cwd: "/tmp/y",
			options: {},
		});
		expect(config.provider.provider).to.equal("openai");
		expect(config.performance.batchSize).to.equal(20);
	});

	it("loads global YAML into app config without exposing secrets", async () => {
		const configDir = await tempConfigDir();
		await fs.writeFile(
			path.join(configDir, "config.yaml"),
			"provider:\n  model: custom-model\n",
		);
		await fs.writeFile(
			path.join(configDir, ".env"),
			"OPENAI_API_KEY=sk-test-secret\n",
		);

		const runtime = await loadPolypotRuntimeConfig({
			configDir,
			cwd: configDir,
			options: {},
		});

		expect(runtime.config.provider.model).to.equal("custom-model");
		expect(JSON.stringify(runtime.config)).to.not.include("sk-test-secret");
		expect(runtime.secrets.openaiApiKey).to.equal("sk-test-secret");
	});

	it("layers project YAML over global YAML before applying defaults", async () => {
		const configDir = await tempConfigDir();
		const projectDir = await tempConfigDir();
		await fs.writeFile(
			path.join(configDir, "config.yaml"),
			"provider:\n  model: global-model\n  temperature: 0.2\nsource:\n  sourceLanguage: en_US\n",
		);
		await fs.mkdir(path.join(projectDir, ".polypot"));
		await fs.writeFile(
			path.join(projectDir, ".polypot", "config.yaml"),
			"source:\n  sourceLanguage: it_IT\n  targetLanguages:\n    - fr_FR\n",
		);

		const runtime = await loadPolypotRuntimeConfig({
			configDir,
			cwd: projectDir,
			options: {},
		});

		expect(runtime.config.provider.model).to.equal("global-model");
		expect(runtime.config.provider.temperature).to.equal(0.2);
		expect(runtime.config.source.sourceLanguage).to.equal("it_IT");
		expect(runtime.config.source.targetLanguages).to.deep.equal(["fr_FR"]);
	});

	it("loads project secrets over global secrets", async () => {
		const configDir = await tempConfigDir();
		const projectDir = await tempConfigDir();
		await fs.writeFile(
			path.join(configDir, ".env"),
			"OPENAI_API_KEY=sk-global-secret\n",
		);
		await fs.mkdir(path.join(projectDir, ".polypot"));
		await fs.writeFile(
			path.join(projectDir, ".polypot", ".env"),
			"OPENAI_API_KEY=sk-project-secret\n",
		);

		const runtime = await loadPolypotRuntimeConfig({
			configDir,
			cwd: projectDir,
			options: {},
		});

		expect(runtime.secrets.openaiApiKey).to.equal("sk-project-secret");
		expect(JSON.stringify(runtime.config)).to.not.include(
			"sk-project-secret",
		);
	});

	it("honors noConfig and noEnv independently for global and project files", async () => {
		const configDir = await tempConfigDir();
		const projectDir = await tempConfigDir();
		await fs.writeFile(
			path.join(configDir, "config.yaml"),
			"provider:\n  model: custom-model\n",
		);
		await fs.writeFile(
			path.join(configDir, ".env"),
			"OPENAI_API_KEY=sk-test-secret\n",
		);
		await fs.mkdir(path.join(projectDir, ".polypot"));
		await fs.writeFile(
			path.join(projectDir, ".polypot", "config.yaml"),
			"provider:\n  model: project-model\n",
		);
		await fs.writeFile(
			path.join(projectDir, ".polypot", ".env"),
			"OPENAI_API_KEY=sk-project-secret\n",
		);

		const withoutConfig = await loadPolypotRuntimeConfig({
			configDir,
			cwd: projectDir,
			options: { noConfig: true },
		});
		const withoutEnv = await loadPolypotRuntimeConfig({
			configDir,
			cwd: projectDir,
			options: { noEnv: true },
		});

		expect(withoutConfig.config.provider.model).to.equal(
			DEFAULT_OPENAI_MODEL,
		);
		expect(withoutConfig.secrets.openaiApiKey).to.equal(
			"sk-project-secret",
		);
		expect(withoutEnv.config.provider.model).to.equal("project-model");
		expect(withoutEnv.secrets.hasOpenaiApiKey).to.equal(false);
	});

	it("uses an explicit configPath instead of discovered global YAML", async () => {
		const configDir = await tempConfigDir();
		const projectDir = await tempConfigDir();
		const explicitConfigPath = path.join(configDir, "explicit.yaml");
		await fs.writeFile(path.join(configDir, "config.yaml"), "provider: [");
		await fs.mkdir(path.join(projectDir, ".polypot"));
		await fs.writeFile(
			path.join(projectDir, ".polypot", "config.yaml"),
			"provider:\n  model: project-model\n",
		);
		await fs.writeFile(
			explicitConfigPath,
			"provider:\n  model: explicit-model\n",
		);

		const runtime = await loadPolypotRuntimeConfig({
			configDir,
			cwd: projectDir,
			options: { configPath: explicitConfigPath },
		});

		expect(runtime.config.provider.model).to.equal("explicit-model");
	});

	it("reports malformed project YAML with project path context", async () => {
		const configDir = await tempConfigDir();
		const projectDir = await tempConfigDir();
		await fs.mkdir(path.join(projectDir, ".polypot"));
		await fs.writeFile(
			path.join(projectDir, ".polypot", "config.yaml"),
			"provider: [",
		);

		try {
			await loadPolypotRuntimeConfig({
				configDir,
				cwd: projectDir,
				options: {},
			});
			expect.fail("expected loadPolypotRuntimeConfig to throw");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
			if (!(error instanceof Error)) throw error;
			expect(error.message).to.include("Failed to read project config");
			expect(error.message).to.include(".polypot");
		}
	});
});

describe("resolveConfigPaths", () => {
	it("returns the four expected paths with .polypot/ prefix on project paths", () => {
		const paths = resolveConfigPaths({ configDir: "/cfg", cwd: "/proj" });
		expect(paths.globalYaml).to.equal("/cfg/config.yaml");
		expect(paths.globalEnv).to.equal("/cfg/.env");
		expect(paths.projectYaml).to.equal("/proj/.polypot/config.yaml");
		expect(paths.projectEnv).to.equal("/proj/.polypot/.env");
	});
});
