import { Config } from "@oclif/core";
import { expect } from "chai";
import { BaseCommand } from "../src/base-command.js";
import type { PolypotConfig } from "../src/config/schema.js";

class Probe extends BaseCommand<typeof Probe> {
	static override flags = {};
	public getAppConfig(): PolypotConfig {
		return this.appConfig;
	}
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

	it("declares no static baseFlags", () => {
		expect(
			(BaseCommand as unknown as { baseFlags?: unknown }).baseFlags,
		).to.equal(undefined);
	});
});
