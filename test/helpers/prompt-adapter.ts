import type { PromptAdapter } from "../../src/prompts/common.js";
import type { SetupLanguageChoice } from "../../src/setup/languages.js";

export interface PromptCapture {
	readonly checkboxes?: Array<{
		readonly choices: readonly SetupLanguageChoice[];
		readonly message: string;
	}>;
	readonly inputs?: Array<{
		readonly default?: string;
		readonly message: string;
	}>;
	readonly selects?: Array<{
		readonly choices: readonly SetupLanguageChoice[];
		readonly default?: string;
		readonly message: string;
	}>;
}

export function adapterFromAnswers(
	answers: {
		readonly checkboxes?: string[][];
		readonly confirms: boolean[];
		readonly inputs: string[];
		readonly passwords: string[];
		readonly selects?: string[];
	},
	capture: PromptCapture = {},
	settings: {
		readonly usePromptDefaults?: boolean;
	} = {},
): PromptAdapter {
	return {
		checkbox: async (options) => {
			capture.checkboxes?.push({
				choices: options.choices,
				message: options.message,
			});
			return (
				answers.checkboxes?.shift() ??
				options.choices
					.filter((choice) => choice.checked)
					.map((choice) => choice.value)
			);
		},
		confirm: async () => {
			const next = answers.confirms.shift();
			if (next === undefined) throw new Error("missing confirm answer");
			return next;
		},
		input: async (options) => {
			capture.inputs?.push({
				...(options.default !== undefined && {
					default: options.default,
				}),
				message: options.message,
			});
			const next =
				answers.inputs.shift() ??
				(settings.usePromptDefaults ? options.default : undefined);
			if (next === undefined) throw new Error("missing input answer");
			const validation = options.validate?.(next);
			if (validation !== undefined && validation !== true)
				throw new Error(String(validation));
			return next;
		},
		password: async (options) => {
			const next = answers.passwords.shift();
			if (next === undefined) throw new Error("missing password answer");
			const validation = options.validate?.(next);
			if (validation !== undefined && validation !== true)
				throw new Error(String(validation));
			return next;
		},
		select: async (options) => {
			capture.selects?.push({
				choices: options.choices,
				...(options.default !== undefined && {
					default: options.default,
				}),
				message: options.message,
			});
			const next =
				answers.selects?.shift() ??
				(settings.usePromptDefaults ? options.default : undefined);
			if (next === undefined) throw new Error("missing select answer");
			return next;
		},
	};
}
