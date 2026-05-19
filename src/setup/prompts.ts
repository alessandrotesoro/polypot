import type { PolypotConfig } from "../config/schema.js";
import type { PolypotSecrets } from "../config/secrets.js";
import {
	currentPromptAdapter,
	messageWithDefault,
	type PromptAdapter,
	promptOpenAIApiKey,
	setPromptAdapterForTests,
} from "../prompts/common.js";
import { promptLanguageDefaults } from "../prompts/languages.js";

export interface SetupAnswers {
	readonly openaiApiKey?: string;
	readonly validateConnection: boolean;
	readonly provider: "openai";
	readonly model: string;
	readonly temperature: number;
	readonly sourceLanguage: string;
	readonly targetLanguages: readonly string[];
}

export type SetupPromptAdapter = PromptAdapter;

const SETUP_PROMPT_ADAPTER = Symbol.for("polypot.setupPromptAdapter");

/**
 * Set or clear the prompt adapter used by tests.
 *
 * @param adapter Prompt adapter to use.
 */
export function setSetupPromptAdapterForTests(
	adapter: SetupPromptAdapter | undefined,
): void {
	setPromptAdapterForTests(SETUP_PROMPT_ADAPTER, adapter);
}

/**
 * Parse a setup temperature value.
 *
 * @param value Value to parse or format.
 * @returns Parsed temperature, or undefined when invalid.
 */
function parseTemperature(value: string): number | undefined {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return undefined;
	if (parsed < 0 || parsed > 2) return undefined;
	return parsed;
}

/**
 * Apply setup answers to existing config.
 *
 * @param existingConfig Config values already stored.
 * @param answers Answers collected from setup prompts.
 * @returns Updated Polypot config.
 */
export function buildSetupConfig(
	existingConfig: PolypotConfig,
	answers: SetupAnswers,
): PolypotConfig {
	return {
		...existingConfig,
		provider: {
			...existingConfig.provider,
			provider: answers.provider,
			model: answers.model,
			temperature: answers.temperature,
		},
		source: {
			...existingConfig.source,
			sourceLanguage: answers.sourceLanguage,
			targetLanguages: [...answers.targetLanguages],
		},
	};
}

/**
 * Collect setup answers from the prompt adapter.
 *
 * @param existingConfig Config values already stored.
 * @param existingSecrets Secrets already stored.
 * @param adapter Prompt adapter to use.
 * @returns Collected setup answers.
 */
export async function collectSetupAnswers(
	existingConfig: PolypotConfig,
	existingSecrets: PolypotSecrets,
	adapter: SetupPromptAdapter = currentPromptAdapter(SETUP_PROMPT_ADAPTER),
): Promise<SetupAnswers> {
	const openaiApiKey = await promptOpenAIApiKey(existingSecrets, adapter, {
		keepExistingMessage: "Keep existing OpenAI API key? (default: yes)",
		promptMessage: "OpenAI API key",
		storeNewDefault: true,
		storeNewMessage: "Store an OpenAI API key now? (default: yes)",
	});

	const validateConnection =
		openaiApiKey === undefined
			? false
			: await adapter.confirm({
					message:
						"Validate the OpenAI connection now? (default: yes)",
					default: true,
				});

	const model = await adapter.input({
		message: messageWithDefault(
			"Default OpenAI model",
			existingConfig.provider.model,
		),
		default: existingConfig.provider.model,
		validate: (value) =>
			value.trim().length > 0 || "Model cannot be empty.",
	});

	const temperatureAnswer = await adapter.input({
		message: messageWithDefault(
			"Default temperature",
			String(existingConfig.provider.temperature),
		),
		default: String(existingConfig.provider.temperature),
		validate: (value) =>
			parseTemperature(value) !== undefined ||
			"Enter a number from 0 to 2.",
	});

	const languages = await promptLanguageDefaults(adapter, {
		labelPrefix: "Default",
		sourceLanguage: existingConfig.source.sourceLanguage,
		targetLanguages: existingConfig.source.targetLanguages,
	});

	return {
		...(openaiApiKey !== undefined && {
			openaiApiKey: openaiApiKey.trim(),
		}),
		validateConnection,
		provider: "openai",
		model: model.trim(),
		temperature:
			parseTemperature(temperatureAnswer) ??
			existingConfig.provider.temperature,
		sourceLanguage: languages.sourceLanguage,
		targetLanguages: languages.targetLanguages,
	};
}

/**
 * Ask whether existing setup files can be changed.
 *
 * @param adapter Prompt adapter to use.
 * @returns True when setup files may be changed.
 */
export async function confirmSetupUpdate(
	adapter: SetupPromptAdapter = currentPromptAdapter(SETUP_PROMPT_ADAPTER),
): Promise<boolean> {
	return adapter.confirm({
		message: "Update existing global Polypot setup? (default: no)",
		default: false,
	});
}
