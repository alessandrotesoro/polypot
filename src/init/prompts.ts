import type { PolypotConfig, PolypotConfigInput } from "../config/schema.js";
import type { PolypotSecrets } from "../config/secrets.js";
import {
	normalizeLanguageValue,
	normalizeLanguageValues,
} from "../language-values.js";
import {
	currentPromptAdapter,
	messageWithDefault,
	type PromptAdapter,
	promptOpenAIApiKey,
	setPromptAdapterForTests,
} from "../prompts/common.js";
import { promptLanguageDefaults } from "../prompts/languages.js";

export interface InitAnswers {
	readonly openaiApiKey?: string;
	readonly sourceLanguage: string;
	readonly targetLanguages: readonly string[];
	readonly potFilePath?: string;
	readonly outputDir?: string;
	readonly promptFilePath: string;
}

export type InitPromptAdapter = PromptAdapter;

const INIT_PROMPT_ADAPTER = Symbol.for("polypot.initPromptAdapter");
export const DEFAULT_PROJECT_PROMPT_FILE_PATH = ".polypot/prompt.md";

function omitKeys<T extends object, K extends keyof T>(
	value: T | undefined,
	keys: readonly K[],
): Omit<T, K> {
	const copy: Partial<T> = { ...(value ?? {}) };
	for (const key of keys) delete copy[key];
	return copy as Omit<T, K>;
}

/**
 * Set or clear the prompt adapter used by tests.
 *
 * @param adapter Prompt adapter to use.
 */
export function setInitPromptAdapterForTests(
	adapter: InitPromptAdapter | undefined,
): void {
	setPromptAdapterForTests(INIT_PROMPT_ADAPTER, adapter);
}

/**
 * Normalize optional prompt text.
 *
 * @param value Input value.
 * @returns Trimmed value, or undefined for blanks.
 */
function optionalText(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Build config for init defaults.
 *
 * @param existingConfig Config values already stored.
 * @param answers Answers collected from init prompts.
 * @returns Updated Polypot config input.
 */
export function buildInitConfig(
	existingConfig: PolypotConfigInput,
	answers: InitAnswers,
): PolypotConfigInput {
	const existing = existingConfig ?? {};
	const configBase = omitKeys(existing, ["behavior", "output", "source"]);
	const behaviorBase = existing.behavior ?? {};
	const sourceBase = omitKeys(existing.source, ["potFilePath"]);
	const outputBase = omitKeys(existing.output, ["outputDir"]);
	const output =
		answers.outputDir === undefined && Object.keys(outputBase).length === 0
			? undefined
			: {
					...outputBase,
					...(answers.outputDir !== undefined && {
						outputDir: answers.outputDir,
					}),
				};

	return {
		...configBase,
		behavior: {
			...behaviorBase,
			promptFilePath: answers.promptFilePath,
		},
		source: {
			...sourceBase,
			...(answers.potFilePath !== undefined && {
				potFilePath: answers.potFilePath,
			}),
			sourceLanguage: normalizeLanguageValue(answers.sourceLanguage),
			targetLanguages: [
				...normalizeLanguageValues(answers.targetLanguages),
			],
		},
		...(output !== undefined && { output }),
	};
}

/**
 * Collect default init answers without prompting.
 *
 * @param existingConfig Config values already stored.
 * @returns Init answers from defaults.
 */
export function defaultInitAnswers(existingConfig: PolypotConfig): InitAnswers {
	return {
		promptFilePath:
			existingConfig.behavior.promptFilePath ??
			DEFAULT_PROJECT_PROMPT_FILE_PATH,
		sourceLanguage: existingConfig.source.sourceLanguage,
		targetLanguages: existingConfig.source.targetLanguages,
		...(existingConfig.source.potFilePath !== undefined && {
			potFilePath: existingConfig.source.potFilePath,
		}),
		...(existingConfig.output.outputDir !== undefined && {
			outputDir: existingConfig.output.outputDir,
		}),
	};
}

/**
 * Collect init answers from the prompt adapter.
 *
 * @param existingConfig Config values already stored.
 * @param existingSecrets Secrets already stored.
 * @param adapter Prompt adapter to use.
 * @returns Collected init answers.
 */
export async function collectInitAnswers(
	existingConfig: PolypotConfig,
	existingSecrets: PolypotSecrets,
	adapter: InitPromptAdapter = currentPromptAdapter(INIT_PROMPT_ADAPTER),
): Promise<InitAnswers> {
	const languages = await promptLanguageDefaults(adapter, {
		labelPrefix: "Project",
		sourceLanguage: existingConfig.source.sourceLanguage,
		targetLanguages: existingConfig.source.targetLanguages,
	});

	const potFilePath = optionalText(
		await adapter.input({
			message: messageWithDefault(
				"Project .pot file path",
				existingConfig.source.potFilePath ?? "none",
			),
			default: existingConfig.source.potFilePath ?? "",
		}),
	);

	const outputDir = optionalText(
		await adapter.input({
			message: messageWithDefault(
				"Project output directory",
				existingConfig.output.outputDir,
			),
			default: existingConfig.output.outputDir,
		}),
	);

	const openaiApiKey = await promptOpenAIApiKey(existingSecrets, adapter, {
		keepExistingMessage:
			"Keep existing project OpenAI API key? (default: yes)",
		promptMessage: "Project OpenAI API key",
		storeNewDefault: false,
		storeNewMessage: "Store a project OpenAI API key now? (default: no)",
	});

	return {
		...(openaiApiKey !== undefined && {
			openaiApiKey: openaiApiKey.trim(),
		}),
		...(outputDir !== undefined && { outputDir }),
		...(potFilePath !== undefined && { potFilePath }),
		promptFilePath:
			existingConfig.behavior.promptFilePath ??
			DEFAULT_PROJECT_PROMPT_FILE_PATH,
		sourceLanguage: languages.sourceLanguage,
		targetLanguages: languages.targetLanguages,
	};
}

/**
 * Ask whether existing init files can be changed.
 *
 * @param adapter Prompt adapter to use.
 * @returns True when project init files may be changed.
 */
export async function confirmInitUpdate(
	adapter: InitPromptAdapter = currentPromptAdapter(INIT_PROMPT_ADAPTER),
): Promise<boolean> {
	return adapter.confirm({
		message: "Update existing project Polypot config? (default: no)",
		default: false,
	});
}
