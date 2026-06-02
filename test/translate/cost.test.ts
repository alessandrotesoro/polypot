import { expect } from "chai";
import type { OpenAICost } from "../../src/providers/openai/pricing.js";
import {
	addOpenAICosts,
	addTranslationEstimates,
	getKnownCost,
	knownTranslationEstimate,
	unknownTranslationEstimate,
	ZERO_TRANSLATION_ESTIMATE,
} from "../../src/translate/cost.js";

function openAICost(options: {
	readonly completionCost: number;
	readonly completionTokens: number;
	readonly model: string;
	readonly promptCost: number;
	readonly promptTokens: number;
}): OpenAICost {
	return {
		completionCost: options.completionCost,
		completionTokens: options.completionTokens,
		fallbackPricing: false,
		model: options.model,
		promptCost: options.promptCost,
		promptTokens: options.promptTokens,
		totalCost: options.promptCost + options.completionCost,
		totalTokens: options.promptTokens + options.completionTokens,
	};
}

describe("translation cost helpers", () => {
	it("adds OpenAI cost details while preserving the latest concrete model", () => {
		const first = openAICost({
			completionCost: 0.02,
			completionTokens: 20,
			model: "gpt-5.4-mini",
			promptCost: 0.01,
			promptTokens: 10,
		});
		const second = openAICost({
			completionCost: 0.04,
			completionTokens: 40,
			model: "gpt-5.4",
			promptCost: 0.03,
			promptTokens: 30,
		});

		expect(addOpenAICosts(first, second)).to.deep.include({
			completionCost: 0.06,
			completionTokens: 60,
			model: "gpt-5.4",
			promptCost: 0.04,
			promptTokens: 40,
			totalCost: 0.1,
			totalTokens: 100,
		});
	});

	it("adds known estimates and returns their known cost", () => {
		const estimate = addTranslationEstimates(
			ZERO_TRANSLATION_ESTIMATE,
			knownTranslationEstimate({
				cost: 0.03,
				inputTokens: 10,
				outputTokens: 20,
			}),
		);

		expect(estimate).to.deep.include({
			cost: 0.03,
			costKnown: true,
			inputTokens: 10,
			outputTokens: 20,
			totalTokens: 30,
		});
		expect(getKnownCost(estimate)).to.equal(0.03);
	});

	it("propagates unknown estimate reasons", () => {
		const estimate = addTranslationEstimates(
			unknownTranslationEstimate({
				inputTokens: 10,
				outputTokens: 20,
				unavailableReason: "provider missing",
			}),
			unknownTranslationEstimate({
				inputTokens: 1,
				outputTokens: 2,
				unavailableReason: "model missing",
			}),
		);

		expect(estimate).to.deep.include({
			costKnown: false,
			inputTokens: 11,
			outputTokens: 22,
			totalTokens: 33,
			unavailableReason: "provider missing; model missing",
		});
		expect(getKnownCost(estimate)).to.equal(undefined);
	});
});
