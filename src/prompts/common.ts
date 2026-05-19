import { checkbox, confirm, input, password, select } from "@inquirer/prompts";
import type { PolypotSecrets } from "../config/secrets.js";
import type { SetupLanguageChoice } from "../setup/languages.js";

export interface PromptAdapter {
	readonly checkbox: (options: {
		readonly choices: readonly SetupLanguageChoice[];
		readonly message: string;
		readonly pageSize?: number;
		readonly required?: boolean;
	}) => Promise<string[]>;
	readonly confirm: (options: {
		readonly default?: boolean;
		readonly message: string;
	}) => Promise<boolean>;
	readonly input: (options: {
		readonly default?: string;
		readonly message: string;
		readonly validate?: (value: string) => boolean | string;
	}) => Promise<string>;
	readonly password: (options: {
		readonly message: string;
		readonly validate?: (value: string) => boolean | string;
	}) => Promise<string>;
	readonly select: (options: {
		readonly choices: readonly SetupLanguageChoice[];
		readonly default?: string;
		readonly message: string;
		readonly pageSize?: number;
	}) => Promise<string>;
}

const defaultPromptAdapter: PromptAdapter = {
	checkbox,
	confirm,
	input,
	password: (options) => password({ mask: "*", ...options }),
	select,
};

type PromptGlobal = typeof globalThis & {
	[key: symbol]: PromptAdapter | undefined;
};

function promptGlobal(): PromptGlobal {
	return globalThis as PromptGlobal;
}

export function setPromptAdapterForTests(
	key: symbol,
	adapter: PromptAdapter | undefined,
): void {
	const store = promptGlobal();
	if (adapter === undefined) {
		delete store[key];
	} else {
		store[key] = adapter;
	}
}

export function currentPromptAdapter(key: symbol): PromptAdapter {
	return promptGlobal()[key] ?? defaultPromptAdapter;
}

export function messageWithDefault(message: string, value: string): string {
	return `${message} (default: ${value})`;
}

export async function promptOpenAIApiKey(
	existingSecrets: PolypotSecrets,
	adapter: PromptAdapter,
	options: {
		readonly keepExistingMessage: string;
		readonly storeNewDefault: boolean;
		readonly storeNewMessage: string;
		readonly promptMessage: string;
	},
): Promise<string | undefined> {
	const shouldPromptForKey = existingSecrets.hasOpenaiApiKey
		? !(await adapter.confirm({
				message: options.keepExistingMessage,
				default: true,
			}))
		: await adapter.confirm({
				message: options.storeNewMessage,
				default: options.storeNewDefault,
			});

	if (!shouldPromptForKey) return undefined;

	return adapter.password({
		message: options.promptMessage,
		validate: (value) =>
			value.trim().length > 0 ||
			(existingSecrets.hasOpenaiApiKey
				? "Enter an API key, or keep the existing key."
				: "Enter an API key, or choose not to store one."),
	});
}
