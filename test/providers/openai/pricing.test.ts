import { expect } from "chai";
import {
	calculateOpenAICost,
	estimateCompletionTokens,
	estimateTokenCount,
	getOpenAIModelPricing,
} from "../../../src/providers/openai/pricing.js";

describe("OpenAI pricing", () => {
	it("returns known model pricing", () => {
		const result = getOpenAIModelPricing("gpt-5.4-mini");

		expect(result.fallback).to.equal(false);
		expect(result.pricing.prompt).to.be.greaterThan(0);
		expect(result.pricing.completion).to.be.greaterThan(0);
	});

	it("marks unknown model pricing as fallback", () => {
		const result = getOpenAIModelPricing("custom-model");

		expect(result.fallback).to.equal(true);
	});

	it("estimates tokens and calculates costs", () => {
		expect(estimateTokenCount("12345")).to.equal(2);
		expect(estimateCompletionTokens(10)).to.equal(14);

		const cost = calculateOpenAICost({
			completionTokens: 200,
			model: "gpt-5.4-mini",
			promptTokens: 100,
		});

		expect(cost.totalTokens).to.equal(300);
		expect(cost.totalCost).to.be.greaterThan(0);
	});
});
