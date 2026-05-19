import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Config } from "@oclif/core";
import { expect } from "chai";
import { BaseCommand } from "../src/base-command.js";
import type { PolypotConfig } from "../src/config/schema.js";
import type { PolypotSecrets } from "../src/config/secrets.js";

/**
 * Test command that exposes loaded app config.
 */
class Probe extends BaseCommand<typeof Probe> {
	static override flags = {};

	/**
	 * Return the loaded app config.
	 *
	 * @returns The loaded app config.
	 */
	public getAppConfig(): PolypotConfig {
		return this.appConfig;
	}

	/**
	 * Return the loaded runtime secrets.
	 *
	 * @returns The loaded runtime secrets.
	 */
	public getRuntimeSecrets(): PolypotSecrets {
		return this.runtimeSecrets;
	}

	/**
	 * Run the probe command.
	 */
	async run(): Promise<void> {}
}

describe("BaseCommand", () => {
	it("populates this.appConfig with defaults after init()", async () => {
		const config = await Config.load(process.cwd());
		const probe = new Probe([], config);
		await probe.init();
		const appConfig = probe.getAppConfig();
		expect(appConfig.provider.provider).to.equal("openai");
		expect(appConfig.performance.batchSize).to.equal(20);
	});

	it("does not expose runtime secrets through appConfig", async () => {
		const config = await Config.load(process.cwd());
		const probe = new Probe([], config);
		await probe.init();

		expect(JSON.stringify(probe.getAppConfig())).to.not.include(
			"OPENAI_API_KEY",
		);
	});

	it("exposes runtime secrets through a separate boundary", async () => {
		const repoCwd = process.cwd();
		const projectDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-base-command-"),
		);

		try {
			await fs.mkdir(path.join(projectDir, ".polypot"));
			await fs.writeFile(
				path.join(projectDir, ".polypot", ".env"),
				"OPENAI_API_KEY=sk-project-secret\n",
			);
			process.chdir(projectDir);

			const config = await Config.load(repoCwd);
			const probe = new Probe([], config);
			await probe.init();

			expect(probe.getRuntimeSecrets().openaiApiKey).to.equal(
				"sk-project-secret",
			);
			expect(JSON.stringify(probe.getAppConfig())).to.not.include(
				"sk-project-secret",
			);
		} finally {
			process.chdir(repoCwd);
			await fs.rm(projectDir, { recursive: true, force: true });
		}
	});

	it("declares no static baseFlags", () => {
		expect(
			(BaseCommand as unknown as { baseFlags?: unknown }).baseFlags,
		).to.equal(undefined);
	});
});
