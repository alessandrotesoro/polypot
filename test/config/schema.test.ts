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
});
