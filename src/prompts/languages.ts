import {
	formatSetupLanguage,
	setupLanguageChoices,
} from "../setup/languages.js";
import { messageWithDefault, type PromptAdapter } from "./common.js";

export async function promptLanguageDefaults(
	adapter: PromptAdapter,
	options: {
		readonly labelPrefix: string;
		readonly sourceLanguage: string;
		readonly targetLanguages: readonly string[];
	},
): Promise<{
	readonly sourceLanguage: string;
	readonly targetLanguages: readonly string[];
}> {
	const sourceLanguage = await adapter.select({
		choices: setupLanguageChoices({
			selected: [options.sourceLanguage],
		}),
		default: options.sourceLanguage,
		message: messageWithDefault(
			`${options.labelPrefix} source language`,
			formatSetupLanguage(options.sourceLanguage),
		),
		pageSize: 12,
	});

	const targetLanguages = await adapter.checkbox({
		choices: setupLanguageChoices({
			selected: options.targetLanguages,
		}),
		message: messageWithDefault(
			`${options.labelPrefix} target languages`,
			options.targetLanguages.length > 0
				? options.targetLanguages.map(formatSetupLanguage).join(", ")
				: "none",
		),
		pageSize: 12,
		required: false,
	});

	return { sourceLanguage, targetLanguages };
}
