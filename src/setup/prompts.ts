import { checkbox, confirm, input, password, select } from "@inquirer/prompts";
import type { PolypotConfig } from "../config/schema.js";
import type { PolypotSecrets } from "../config/secrets.js";
import {
	formatSetupLanguage,
	type SetupLanguageChoice,
	setupLanguageChoices,
} from "./languages.js";

export interface SetupAnswers {
	readonly openaiApiKey?: string;
	readonly validateConnection: boolean;
	readonly provider: "openai";
	readonly model: string;
	readonly temperature: number;
	readonly sourceLanguage: string;
	readonly targetLanguages: readonly string[];
}

export interface SetupPromptAdapter {
	readonly confirm: (options: {
		readonly message: string;
		readonly default?: boolean;
	}) => Promise<boolean>;
	readonly checkbox: (options: {
		readonly message: string;
		readonly choices: readonly SetupLanguageChoice[];
		readonly pageSize?: number;
		readonly required?: boolean;
	}) => Promise<string[]>;
	readonly input: (options: {
		readonly message: string;
		readonly default?: string;
		readonly validate?: (value: string) => boolean | string;
	}) => Promise<string>;
	readonly password: (options: {
		readonly message: string;
		readonly validate?: (value: string) => boolean | string;
	}) => Promise<string>;
	readonly select: (options: {
		readonly message: string;
		readonly choices: readonly SetupLanguageChoice[];
		readonly default?: string;
		readonly pageSize?: number;
	}) => Promise<string>;
}

const defaultPromptAdapter: SetupPromptAdapter = {
	checkbox,
	confirm,
	input,

	/**
	 * Prompt for a masked password.
	 *
	 * @param options Options for the operation.
	 * @returns The result.
	 */
	password: (options) => password({ mask: "*", ...options }),
	select,
};

const SETUP_PROMPT_ADAPTER = Symbol.for("polypot.setupPromptAdapter");

type SetupPromptGlobal = typeof globalThis & {
	[SETUP_PROMPT_ADAPTER]?: SetupPromptAdapter;
};

/**
 * Read the global storage slot for prompt adapters.
 *
 * @returns The typed global prompt adapter store.
 */
function setupPromptGlobal(): SetupPromptGlobal {
	return globalThis as SetupPromptGlobal;
}

/**
 * Set or clear the prompt adapter used by tests.
 *
 * @param adapter Prompt adapter to use.
 */
export function setSetupPromptAdapterForTests(
	adapter: SetupPromptAdapter | undefined,
): void {
	const promptGlobal = setupPromptGlobal();
	if (adapter === undefined) {
		delete promptGlobal[SETUP_PROMPT_ADAPTER];
	} else {
		promptGlobal[SETUP_PROMPT_ADAPTER] = adapter;
	}
}

/**
 * Return the current prompt adapter.
 *
 * @returns The active prompt adapter.
 */
function currentPromptAdapter(): SetupPromptAdapter {
	return setupPromptGlobal()[SETUP_PROMPT_ADAPTER] ?? defaultPromptAdapter;
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
 * Add a visible default to prompt text.
 *
 * @param message Input value.
 * @param value Value to parse or format.
 * @returns Prompt text with the default value appended.
 */
function messageWithDefault(message: string, value: string): string {
	return `${message} (default: ${value})`;
}

/**
 * Ask whether to store an OpenAI API key.
 *
 * @param existingSecrets Secrets already stored.
 * @param adapter Prompt adapter to use.
 * @returns The entered API key, or undefined when skipped.
 */
async function promptOpenAIApiKey(
	existingSecrets: PolypotSecrets,
	adapter: SetupPromptAdapter,
): Promise<string | undefined> {
	const shouldPromptForKey = existingSecrets.hasOpenaiApiKey
		? !(await adapter.confirm({
				message: "Keep existing OpenAI API key? (default: yes)",
				default: true,
			}))
		: await adapter.confirm({
				message: "Store an OpenAI API key now? (default: yes)",
				default: true,
			});

	if (!shouldPromptForKey) return undefined;

	return adapter.password({
		message: "OpenAI API key",

		/**
		 * Validate the prompt value.
		 *
		 * @param value Value to parse or format.
		 * @returns The result.
		 */
		validate: (value) =>
			value.trim().length > 0 ||
			(existingSecrets.hasOpenaiApiKey
				? "Enter an API key, or keep the existing key."
				: "Enter an API key, or choose not to store one."),
	});
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
	adapter: SetupPromptAdapter = currentPromptAdapter(),
): Promise<SetupAnswers> {
	const openaiApiKey = await promptOpenAIApiKey(existingSecrets, adapter);

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

		/**
		 * Validate the prompt value.
		 *
		 * @param value Value to parse or format.
		 * @returns The result.
		 */
		validate: (value) =>
			value.trim().length > 0 || "Model cannot be empty.",
	});

	const temperatureAnswer = await adapter.input({
		message: messageWithDefault(
			"Default temperature",
			String(existingConfig.provider.temperature),
		),
		default: String(existingConfig.provider.temperature),

		/**
		 * Validate the prompt value.
		 *
		 * @param value Value to parse or format.
		 * @returns The result.
		 */
		validate: (value) =>
			parseTemperature(value) !== undefined ||
			"Enter a number from 0 to 2.",
	});

	const sourceLanguage = await adapter.select({
		choices: setupLanguageChoices({
			selected: [existingConfig.source.sourceLanguage],
		}),
		default: existingConfig.source.sourceLanguage,
		message: messageWithDefault(
			"Default source language",
			formatSetupLanguage(existingConfig.source.sourceLanguage),
		),
		pageSize: 12,
	});

	const targetLanguages = await adapter.checkbox({
		choices: setupLanguageChoices({
			selected: existingConfig.source.targetLanguages,
		}),
		message: messageWithDefault(
			"Default target languages",
			existingConfig.source.targetLanguages.length > 0
				? existingConfig.source.targetLanguages
						.map(formatSetupLanguage)
						.join(", ")
				: "none",
		),
		pageSize: 12,
		required: false,
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
		sourceLanguage,
		targetLanguages,
	};
}

/**
 * Ask whether existing setup files can be changed.
 *
 * @param adapter Prompt adapter to use.
 * @returns True when setup files may be changed.
 */
export async function confirmSetupUpdate(
	adapter: SetupPromptAdapter = currentPromptAdapter(),
): Promise<boolean> {
	return adapter.confirm({
		message: "Update existing global Polypot setup? (default: no)",
		default: false,
	});
}
