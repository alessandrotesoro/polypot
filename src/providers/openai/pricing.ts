export interface OpenAIModelPricing {
	readonly completion: number;
	readonly prompt: number;
}

export interface OpenAICost {
	readonly completionCost: number;
	readonly completionTokens: number;
	readonly fallbackPricing: boolean;
	readonly model: string;
	readonly promptCost: number;
	readonly promptTokens: number;
	readonly totalCost: number;
	readonly totalTokens: number;
}

const FALLBACK_PRICING: OpenAIModelPricing = {
	completion: 0.0016,
	prompt: 0.0004,
};

const MODEL_PRICING: Readonly<Record<string, OpenAIModelPricing>> = {
	"gpt-4.1": { completion: 0.008, prompt: 0.002 },
	"gpt-4.1-mini": { completion: 0.0016, prompt: 0.0004 },
	"gpt-4.1-nano": { completion: 0.0004, prompt: 0.0001 },
	"gpt-5": { completion: 0.01, prompt: 0.00125 },
	"gpt-5-mini": { completion: 0.002, prompt: 0.00025 },
	"gpt-5-nano": { completion: 0.0004, prompt: 0.00005 },
	"gpt-5.4": { completion: 0.015, prompt: 0.0025 },
	"gpt-5.4-mini": { completion: 0.002, prompt: 0.00025 },
	"gpt-5.4-nano": { completion: 0.0004, prompt: 0.00005 },
};

export function getOpenAIModelPricing(model: string): {
	readonly fallback: boolean;
	readonly pricing: OpenAIModelPricing;
} {
	const pricing = MODEL_PRICING[model];
	if (pricing !== undefined) {
		return { fallback: false, pricing };
	}

	return { fallback: true, pricing: FALLBACK_PRICING };
}

export function estimateTokenCount(value: string): number {
	return Math.ceil(value.length / 4);
}

export function estimateCompletionTokens(inputTokens: number): number {
	return Math.ceil(inputTokens * 1.4);
}

export function calculateOpenAICost(options: {
	readonly completionTokens: number;
	readonly model: string;
	readonly promptTokens: number;
}): OpenAICost {
	const { fallback, pricing } = getOpenAIModelPricing(options.model);
	const promptCost = (options.promptTokens / 1000) * pricing.prompt;
	const completionCost =
		(options.completionTokens / 1000) * pricing.completion;

	return {
		completionCost,
		completionTokens: options.completionTokens,
		fallbackPricing: fallback,
		model: options.model,
		promptCost,
		promptTokens: options.promptTokens,
		totalCost: promptCost + completionCost,
		totalTokens: options.promptTokens + options.completionTokens,
	};
}
