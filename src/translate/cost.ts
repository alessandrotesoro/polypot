import type { OpenAICost } from "../providers/openai/pricing.js";

export interface TranslationTokenEstimate {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
}

export type TranslationEstimate =
	| (TranslationTokenEstimate & {
			readonly cost: number;
			readonly costKnown: true;
	  })
	| (TranslationTokenEstimate & {
			readonly costKnown: false;
			readonly unavailableReason: string;
	  });

export type TranslationCostEstimator = (
	sourceCharacters: number,
) => TranslationEstimate;

export const ZERO_OPENAI_COST: OpenAICost = Object.freeze({
	completionCost: 0,
	completionTokens: 0,
	fallbackPricing: false,
	model: "none",
	promptCost: 0,
	promptTokens: 0,
	totalCost: 0,
	totalTokens: 0,
});

export const ZERO_TRANSLATION_ESTIMATE: TranslationEstimate = Object.freeze({
	cost: 0,
	costKnown: true,
	inputTokens: 0,
	outputTokens: 0,
	totalTokens: 0,
});

export function knownTranslationEstimate(options: {
	readonly cost: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
}): TranslationEstimate {
	return {
		cost: options.cost,
		costKnown: true,
		inputTokens: options.inputTokens,
		outputTokens: options.outputTokens,
		totalTokens: options.inputTokens + options.outputTokens,
	};
}

export function unknownTranslationEstimate(options: {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly unavailableReason: string;
}): TranslationEstimate {
	return {
		costKnown: false,
		inputTokens: options.inputTokens,
		outputTokens: options.outputTokens,
		totalTokens: options.inputTokens + options.outputTokens,
		unavailableReason: options.unavailableReason,
	};
}

export function addOpenAICosts(
	first: OpenAICost,
	second: OpenAICost,
): OpenAICost {
	return {
		completionCost: first.completionCost + second.completionCost,
		completionTokens: first.completionTokens + second.completionTokens,
		fallbackPricing: first.fallbackPricing || second.fallbackPricing,
		model: second.model === "none" ? first.model : second.model,
		promptCost: first.promptCost + second.promptCost,
		promptTokens: first.promptTokens + second.promptTokens,
		totalCost: first.totalCost + second.totalCost,
		totalTokens: first.totalTokens + second.totalTokens,
	};
}

export function addTranslationEstimates(
	first: TranslationEstimate,
	second: TranslationEstimate,
): TranslationEstimate {
	const inputTokens = first.inputTokens + second.inputTokens;
	const outputTokens = first.outputTokens + second.outputTokens;

	if (first.costKnown && second.costKnown) {
		return knownTranslationEstimate({
			cost: first.cost + second.cost,
			inputTokens,
			outputTokens,
		});
	}

	return unknownTranslationEstimate({
		inputTokens,
		outputTokens,
		unavailableReason: [
			first.costKnown ? undefined : first.unavailableReason,
			second.costKnown ? undefined : second.unavailableReason,
		]
			.filter((reason): reason is string => reason !== undefined)
			.join("; "),
	});
}

export function getKnownCost(
	estimate: TranslationEstimate,
): number | undefined {
	return estimate.costKnown ? estimate.cost : undefined;
}
