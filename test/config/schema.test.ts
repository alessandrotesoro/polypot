import { expect } from "chai";
import {
	DEFAULT_OPENAI_MODEL,
	DEFAULT_SOURCE_LANGUAGE,
	PolypotConfigSchema,
} from "../../src/config/schema.js";

describe("PolypotConfigSchema", () => {
	it("parses an empty object into a fully-defaulted config", () => {
		const result = PolypotConfigSchema.parse({});
		expect(result.provider.provider).to.equal("openai");
		expect(result.provider.model).to.equal(DEFAULT_OPENAI_MODEL);
		expect(result.performance.batchSize).to.equal(20);
		expect(result.performance.jobs).to.equal(2);
		expect(result.debug.verboseLevel).to.equal(1);
		expect(result.debug.dryRun).to.equal(false);
		expect(result.source.sourceLanguage).to.equal(DEFAULT_SOURCE_LANGUAGE);
		expect(result.source.targetLanguages).to.deep.equal([]);
		expect(result.output.outputDir).to.equal(".");
	});

	it("rejects invalid preview numeric bounds from config", () => {
		const invalidConfigs = [
			{ performance: { batchSize: 0 } },
			{ performance: { batchSize: 101 } },
			{ performance: { jobs: 0 } },
			{ performance: { jobs: 11 } },
			{ limits: { maxCost: -1 } },
			{ limits: { maxStringsPerJob: 0 } },
			{ limits: { maxTotalStrings: 0 } },
			{ source: { targetLanguages: ["../escape"] } },
			{ source: { targetLanguages: ["fr/FR"] } },
			{ source: { targetLanguages: [""] } },
			{ source: { targetLanguages: ["fr_FR", "fr_FR"] } },
		];

		for (const config of invalidConfigs) {
			expect(() => PolypotConfigSchema.parse(config)).to.throw();
		}
	});
});
