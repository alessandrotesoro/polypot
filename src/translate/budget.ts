import type { OpenAICost } from "../providers/openai/pricing.js";
import { addOpenAICosts, ZERO_OPENAI_COST } from "./cost.js";

export type TranslationBudgetStopReason = "cost-limit";

export interface TranslationBudgetLedger {
	readonly maxCost?: number;
	readonly spentCost: OpenAICost;
}

export function createTranslationBudgetLedger(
	maxCost?: number,
): TranslationBudgetLedger {
	const ledger = { spentCost: ZERO_OPENAI_COST };

	return maxCost === undefined ? ledger : { ...ledger, maxCost };
}

export function recordActualCost(
	ledger: TranslationBudgetLedger,
	cost: OpenAICost,
): TranslationBudgetLedger {
	const spentCost = addOpenAICosts(ledger.spentCost, cost);

	return ledger.maxCost === undefined
		? { spentCost }
		: { maxCost: ledger.maxCost, spentCost };
}

export function wouldExceedBudget(
	ledger: TranslationBudgetLedger,
	cost: OpenAICost,
): boolean {
	return (
		ledger.maxCost !== undefined &&
		ledger.spentCost.totalCost + cost.totalCost > ledger.maxCost
	);
}

export function hasExceededBudget(ledger: TranslationBudgetLedger): boolean {
	return (
		ledger.maxCost !== undefined &&
		ledger.spentCost.totalCost > ledger.maxCost
	);
}
