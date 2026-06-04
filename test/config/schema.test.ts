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
		expect(result.behavior.promptFilePath).to.equal(undefined);
	});

	it("normalizes known source and target languages", () => {
		const result = PolypotConfigSchema.parse({
			source: {
				sourceLanguage: "English",
				targetLanguages: ["French", "spa", "de-DE"],
			},
		});

		expect(result.source.sourceLanguage).to.equal("en_US");
		expect(result.source.targetLanguages).to.deep.equal([
			"fr_FR",
			"es_ES",
			"de_DE",
		]);
	});

	it("rejects invalid preview numeric bounds from config", () => {
		const invalidConfigs = [
			{ performance: { batchSize: 0 } },
			{ performance: { batchSize: 101 } },
			{ performance: { jobs: 0 } },
			{ performance: { jobs: 11 } },
			{ limits: { maxStringsPerJob: 0 } },
			{ limits: { maxTotalStrings: 0 } },
			{ output: { localeFormat: "invalid_format" } },
			{ source: { targetLanguages: ["../escape"] } },
			{ source: { targetLanguages: ["fr/FR"] } },
			{ source: { targetLanguages: [""] } },
			{ source: { targetLanguages: ["fr_FR", "fr_FR"] } },
			{ source: { targetLanguages: ["French", "fr_FR"] } },
		];

		for (const config of invalidConfigs) {
			expect(() => PolypotConfigSchema.parse(config)).to.throw();
		}
	});
});
