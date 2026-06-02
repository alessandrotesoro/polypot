import { expect } from "chai";
import type { OpenAICost } from "../../src/providers/openai/pricing.js";
import {
	createTranslationBudgetLedger,
	hasExceededBudget,
	recordActualCost,
	wouldExceedBudget,
} from "../../src/translate/budget.js";

function cost(totalCost: number): OpenAICost {
	return {
		completionCost: totalCost / 2,
		completionTokens: 2,
		fallbackPricing: false,
		model: "gpt-5.4-mini",
		promptCost: totalCost / 2,
		promptTokens: 2,
		totalCost,
		totalTokens: 4,
	};
}

describe("translation budget ledger", () => {
	it("tracks actual spend immutably", () => {
		const ledger = createTranslationBudgetLedger(0.05);
		const updated = recordActualCost(ledger, cost(0.02));

		expect(ledger.spentCost.totalCost).to.equal(0);
		expect(updated.maxCost).to.equal(0.05);
		expect(updated.spentCost.totalCost).to.equal(0.02);
	});

	it("detects projected and actual cost overruns", () => {
		const ledger = recordActualCost(
			createTranslationBudgetLedger(0.05),
			cost(0.04),
		);

		expect(wouldExceedBudget(ledger, cost(0.02))).to.equal(true);
		expect(wouldExceedBudget(ledger, cost(0.01))).to.equal(false);
		expect(hasExceededBudget(ledger)).to.equal(false);
		expect(
			hasExceededBudget(recordActualCost(ledger, cost(0.02))),
		).to.equal(true);
	});

	it("does not stop work when no max cost is configured", () => {
		const ledger = recordActualCost(
			createTranslationBudgetLedger(),
			cost(10),
		);

		expect(wouldExceedBudget(ledger, cost(10))).to.equal(false);
		expect(hasExceededBudget(ledger)).to.equal(false);
	});
});
