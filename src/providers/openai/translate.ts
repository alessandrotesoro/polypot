import { APIError, OpenAI } from "openai";
import type {
	ChatCompletionCreateParamsNonStreaming,
	ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { PotEntry } from "../../translate/pot.js";
import {
	buildDictionaryResponse,
	buildSystemPrompt,
	buildXmlPrompt,
} from "../../translate/prompts.js";
import type { TranslationValidationStats } from "../../translate/validation.js";
import {
	type ParsedTranslation,
	parseXmlResponse,
} from "../../translate/xml.js";
import {
	calculateOpenAICost,
	estimateCompletionTokens,
	estimateTokenCount,
	type OpenAICost,
} from "./pricing.js";

export interface OpenAITranslationClient {
	readonly chat: {
		readonly completions: {
			create(
				body: ChatCompletionCreateParamsNonStreaming,
			): Promise<OpenAIChatCompletionResponse>;
		};
	};
}

export interface OpenAIChatCompletionResponse {
	readonly choices: readonly {
		readonly message: {
			readonly content: string | null;
		};
	}[];
	readonly usage?: {
		readonly completion_tokens?: number;
		readonly prompt_tokens?: number;
		readonly total_tokens?: number;
	};
}

export type OpenAIClientFactory = (options: {
	readonly apiKey: string;
	readonly timeoutMs: number;
}) => OpenAITranslationClient;

export type OpenAITranslateBatchResult =
	| {
			readonly cost: OpenAICost;
			readonly debug: {
				readonly messages: readonly ChatCompletionMessageParam[];
				readonly response?: string;
			};
			readonly dryRun: boolean;
			readonly missingEntries: readonly PotEntry[];
			readonly ok: true;
			readonly translations: readonly ParsedTranslation[];
			readonly validationStats: TranslationValidationStats;
	  }
	| {
			readonly debug?: {
				readonly messages: readonly ChatCompletionMessageParam[];
				readonly response?: string;
			};
			readonly error: string;
			readonly ok: false;
			readonly retryable: boolean;
	  };

export interface TranslateOpenAIBatchOptions {
	readonly apiKey?: string;
	readonly dictionaryMatches?: readonly {
		readonly source: string;
		readonly target: string;
	}[];
	readonly dryRun: boolean;
	readonly entries: readonly PotEntry[];
	readonly maxRetries: number;
	readonly maxTokens?: number;
	readonly model: string;
	readonly pluralCount: number;
	readonly promptTemplate: string;
	readonly retryDelayMs: number;
	readonly sourceLanguage: string;
	readonly targetLanguage: string;
	readonly temperature: number;
	readonly timeoutSeconds: number;
}

const defaultClientFactory: OpenAIClientFactory = ({ apiKey, timeoutMs }) =>
	new OpenAI({
		apiKey,
		maxRetries: 0,
		timeout: timeoutMs,
	}) as OpenAITranslationClient;

function buildMessages(
	options: TranslateOpenAIBatchOptions,
): readonly ChatCompletionMessageParam[] {
	const xmlPrompt = buildXmlPrompt({
		entries: options.entries,
		pluralCount: options.pluralCount,
		targetLanguage: options.targetLanguage,
		...(options.dictionaryMatches !== undefined && {
			dictionaryMatches: options.dictionaryMatches,
		}),
	});
	const messages: ChatCompletionMessageParam[] = [
		{
			content: buildSystemPrompt({
				pluralCount: options.pluralCount,
				sourceLanguage: options.sourceLanguage,
				targetLanguage: options.targetLanguage,
				template: options.promptTemplate,
			}),
			role: "system",
		},
		{ content: xmlPrompt.xmlPrompt, role: "user" },
	];

	if ((options.dictionaryMatches?.length ?? 0) > 0) {
		messages.push({
			content: buildDictionaryResponse(options.dictionaryMatches ?? []),
			role: "assistant",
		});
		messages.push({
			content:
				"Use the dictionary translations shown above exactly when those terms appear. Now translate the actual strings.",
			role: "user",
		});
	}

	return messages;
}

function estimateMessagesCost(
	messages: readonly ChatCompletionMessageParam[],
	model: string,
): OpenAICost {
	const promptTokens = estimateTokenCount(
		messages.map((message) => String(message.content ?? "")).join("\n"),
	);

	return calculateOpenAICost({
		completionTokens: estimateCompletionTokens(promptTokens),
		model,
		promptTokens,
	});
}

function calculateUsageCost(
	usage: OpenAIChatCompletionResponse["usage"],
	model: string,
	fallbackCost: OpenAICost,
): OpenAICost {
	const promptTokens = usage?.prompt_tokens ?? fallbackCost.promptTokens;
	const completionTokens =
		usage?.completion_tokens ?? fallbackCost.completionTokens;

	return calculateOpenAICost({
		completionTokens,
		model,
		promptTokens,
	});
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function redactSecret(value: string, secret: string | undefined): string {
	if (secret === undefined || secret.length === 0) return value;

	return value.replaceAll(secret, "[redacted]");
}

function getSafeErrorMessage(
	error: unknown,
	apiKey: string | undefined,
): string {
	return redactSecret(getErrorMessage(error), apiKey);
}

function getValidationIssueCount(stats: TranslationValidationStats): number {
	return stats.blankedStrings.length;
}

class SemanticTranslationError extends Error {
	public constructor(
		message: string,
		public readonly response: string,
	) {
		super(message);
		this.name = "SemanticTranslationError";
	}
}

function isAuthenticationError(error: unknown): boolean {
	return (
		error instanceof APIError &&
		(error.status === 401 || error.status === 403)
	);
}

function isRetryableError(error: unknown): boolean {
	if (isAuthenticationError(error)) return false;
	const status = error instanceof APIError ? error.status : undefined;

	return (
		status === undefined ||
		status === 408 ||
		status === 429 ||
		status >= 500
	);
}

function buildRequestBody(
	options: TranslateOpenAIBatchOptions,
	messages: readonly ChatCompletionMessageParam[],
): ChatCompletionCreateParamsNonStreaming {
	return {
		messages: [...messages],
		model: options.model,
		...(options.maxTokens !== undefined && {
			max_tokens: options.maxTokens,
		}),
		temperature: options.temperature,
	};
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function translateOpenAIBatch(
	options: TranslateOpenAIBatchOptions,
	createClient: OpenAIClientFactory = defaultClientFactory,
): Promise<OpenAITranslateBatchResult> {
	const messages = buildMessages(options);
	const estimatedCost = estimateMessagesCost(messages, options.model);

	if (options.dryRun) {
		return {
			cost: estimatedCost,
			debug: { messages },
			dryRun: true,
			missingEntries: options.entries,
			ok: true,
			translations: [],
			validationStats: {
				blankedStrings: [],
				placeholderMismatches: 0,
				pluralFormIssues: 0,
			},
		};
	}

	if (options.apiKey === undefined || options.apiKey.trim().length === 0) {
		return {
			debug: { messages },
			error: "OpenAI API key is required for translation.",
			ok: false,
			retryable: false,
		};
	}

	const client = createClient({
		apiKey: options.apiKey,
		timeoutMs: options.timeoutSeconds * 1000,
	});
	let lastError: unknown;
	let lastResponse: string | undefined;

	for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
		if (attempt > 0) await delay(options.retryDelayMs);

		try {
			const response = await client.chat.completions.create(
				buildRequestBody(options, messages),
			);
			const content = response.choices[0]?.message.content ?? "";
			lastResponse = content;
			const parsed = parseXmlResponse({
				dictionaryCount: options.dictionaryMatches?.length ?? 0,
				entries: options.entries,
				pluralCount: options.pluralCount,
				xml: content,
			});
			const semanticIssueCount =
				parsed.missingEntries.length +
				getValidationIssueCount(parsed.validationStats) +
				parsed.translations.filter((translation) =>
					translation.msgstr.every((value) => value.length === 0),
				).length;
			if (semanticIssueCount > 0) {
				throw new SemanticTranslationError(
					`Model response did not satisfy the translation contract (${semanticIssueCount} issue${semanticIssueCount === 1 ? "" : "s"}).`,
					content,
				);
			}

			return {
				cost: calculateUsageCost(
					response.usage,
					options.model,
					estimatedCost,
				),
				debug: { messages, response: content },
				dryRun: false,
				missingEntries: parsed.missingEntries,
				ok: true,
				translations: parsed.translations,
				validationStats: parsed.validationStats,
			};
		} catch (error) {
			lastError = error;
			if (error instanceof SemanticTranslationError) {
				lastResponse = error.response;
			}
			if (!isRetryableError(error)) break;
		}
	}

	return {
		debug: {
			messages,
			...(lastResponse !== undefined && { response: lastResponse }),
		},
		error: `OpenAI translation failed: ${getSafeErrorMessage(lastError, options.apiKey)}`,
		ok: false,
		retryable: isRetryableError(lastError),
	};
}
