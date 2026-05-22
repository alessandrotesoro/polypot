import type { PolypotSecrets } from "../config/secrets.js";
import {
	calculateOpenAICost,
	type OpenAICost,
} from "../providers/openai/pricing.js";
import {
	type OpenAIClientFactory,
	type OpenAITranslateBatchResult,
	translateOpenAIBatch,
} from "../providers/openai/translate.js";
import { buildTranslationBatchPlan, type TranslationBatch } from "./batches.js";
import {
	createDictionaryMatcher,
	type DictionaryLoadResult,
	type DictionaryMatcher,
	loadDictionary,
} from "./dictionary.js";
import { getBaseLanguage } from "./locales.js";
import {
	applyTranslations,
	createPoOutputDocument,
	getEntriesWithTranslations,
	mergeExistingPoData,
	readPoFile,
	writePoFile,
} from "./po-writer.js";
import { type PotDocument, readPotDocument } from "./pot.js";
import { loadPromptTemplate } from "./prompts.js";
import type {
	TranslationBatchDebug,
	TranslationLanguageResult,
	TranslationLanguageStatus,
	TranslationRunResult,
	TranslationRunStatus,
	TranslationRunTotals,
} from "./results.js";
import {
	createEmptyValidationStats,
	type TranslationValidationStats,
} from "./validation.js";
import { buildTranslateOutputFile, type LocaleFormat } from "./workload.js";

export type TranslationProgressEvent =
	| {
			readonly language: string;
			readonly phase: "language-queued";
	  }
	| {
			readonly language: string;
			readonly outputFile: string;
			readonly phase: "language-started";
			readonly plannedStrings: number;
	  }
	| {
			readonly batch: number;
			readonly language: string;
			readonly phase: "batch-started";
			readonly totalBatches: number;
	  }
	| {
			readonly batch: number;
			readonly language: string;
			readonly phase: "batch-skipped";
			readonly reason: "cost-limit";
			readonly skippedStrings: number;
			readonly totalStrings: number;
	  }
	| {
			readonly batch: number;
			readonly failedStrings: number;
			readonly language: string;
			readonly phase: "batch-failed";
			readonly totalStrings: number;
	  }
	| {
			readonly batch: number;
			readonly language: string;
			readonly phase: "batch-completed";
			readonly processedStrings: number;
			readonly totalStrings: number;
	  }
	| {
			readonly batch: number;
			readonly language: string;
			readonly phase: "batch-saved";
	  }
	| {
			readonly issues: number;
			readonly language: string;
			readonly phase: "validation-issues";
	  }
	| {
			readonly language: string;
			readonly phase: "language-completed";
			readonly status: TranslationLanguageStatus;
	  };

export interface ExecuteTranslateOptions {
	readonly abortOnFailure: boolean;
	readonly batchSize: number;
	readonly dictionaryPath: string;
	readonly dryRun: boolean;
	readonly forceTranslate: boolean;
	readonly inputPoPath?: string;
	readonly jobs: number;
	readonly localeFormat: LocaleFormat;
	readonly maxCost?: number;
	readonly maxRetries: number;
	readonly maxStringsPerJob?: number;
	readonly maxTokens?: number;
	readonly maxTotalStrings?: number;
	readonly model: string;
	readonly outputDir: string;
	readonly poFilePrefix?: string;
	readonly poHeaderTemplatePath?: string;
	readonly potFilePath: string;
	readonly promptFilePath?: string;
	readonly retryDelay: number;
	readonly saveDebugInfo?: boolean;
	readonly secrets: PolypotSecrets;
	readonly skipLanguageOnFailure: boolean;
	readonly sourceLanguage: string;
	readonly targetLanguages: readonly string[];
	readonly temperature: number;
	readonly timeout: number;
	readonly useDictionary: boolean;
	readonly onProgress?: (event: TranslationProgressEvent) => void;
}

export type TranslateBatchFunction = (
	options: Parameters<typeof translateOpenAIBatch>[0],
	createClient?: OpenAIClientFactory,
) => Promise<OpenAITranslateBatchResult>;

const ZERO_COST = calculateOpenAICost({
	completionTokens: 0,
	model: "none",
	promptTokens: 0,
});

function addCosts(first: OpenAICost, second: OpenAICost): OpenAICost {
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

function addValidationStats(
	first: TranslationValidationStats,
	second: TranslationValidationStats,
): TranslationValidationStats {
	return {
		blankedStrings: [...first.blankedStrings, ...second.blankedStrings],
		placeholderMismatches:
			first.placeholderMismatches + second.placeholderMismatches,
		pluralFormIssues: first.pluralFormIssues + second.pluralFormIssues,
	};
}

function buildOutputFile(
	options: ExecuteTranslateOptions,
	language: string,
): string {
	return buildTranslateOutputFile(
		{
			localeFormat: options.localeFormat,
			outputDir: options.outputDir,
			...(options.poFilePrefix !== undefined && {
				poFilePrefix: options.poFilePrefix,
			}),
		},
		language,
	);
}

function assertUniqueOutputFiles(options: ExecuteTranslateOptions): void {
	const languagesByFile = new Map<string, string[]>();

	for (const language of options.targetLanguages) {
		const outputFile = buildOutputFile(options, language);
		languagesByFile.set(outputFile, [
			...(languagesByFile.get(outputFile) ?? []),
			language,
		]);
	}

	for (const [outputFile, languages] of languagesByFile) {
		if (languages.length > 1) {
			throw new Error(
				`Multiple target languages resolve to the same output file ${outputFile}: ${languages.join(", ")}.`,
			);
		}
	}
}

function buildFailedLanguageResult(options: {
	readonly error: unknown;
	readonly executeOptions: ExecuteTranslateOptions;
	readonly language: string;
}): TranslationLanguageResult {
	return {
		batches: 0,
		cost: ZERO_COST,
		error:
			options.error instanceof Error
				? options.error.message
				: String(options.error),
		failed: 0,
		language: options.language,
		mergedFromExisting: 0,
		outputFile: buildOutputFile(options.executeOptions, options.language),
		plannedStrings: 0,
		skippedByExisting: 0,
		skippedByCost: 0,
		skippedByLimit: 0,
		sourceStrings: 0,
		status: "failed",
		translated: 0,
		validation: createEmptyValidationStats(),
	};
}

function isSameBaseLanguage(
	sourceLanguage: string,
	targetLanguage: string,
): boolean {
	return getBaseLanguage(sourceLanguage) === getBaseLanguage(targetLanguage);
}

function getValidationIssueCount(stats: TranslationValidationStats): number {
	return stats.blankedStrings.length;
}

function getInvalidEntryKeys(stats: TranslationValidationStats): Set<string> {
	return new Set(stats.blankedStrings.map((issue) => issue.entryKey));
}

function getBatchDebug(options: {
	readonly batch: number;
	readonly result: OpenAITranslateBatchResult;
	readonly targetLanguage: string;
}): TranslationBatchDebug | undefined {
	if (options.result.debug === undefined) return undefined;

	return {
		batch: options.batch,
		messages: options.result.debug.messages,
		...(options.result.debug.response !== undefined && {
			response: options.result.debug.response,
		}),
		targetLanguage: options.targetLanguage,
	};
}

function shouldSkipBatchForCost(options: {
	readonly batchCost: OpenAICost;
	readonly currentCost: OpenAICost;
	readonly maxCost?: number | undefined;
}): boolean {
	if (options.maxCost === undefined) return false;

	return (
		options.currentCost.totalCost + options.batchCost.totalCost >
		options.maxCost
	);
}

function countBatchEntriesFrom(
	batches: readonly TranslationBatch[],
	batchNumber: number,
): number {
	return batches
		.filter((batch) => batch.number >= batchNumber)
		.reduce((total, batch) => total + batch.entries.length, 0);
}

function emitBatchFailure(options: {
	readonly batch: TranslationBatch;
	readonly executeOptions: ExecuteTranslateOptions;
	readonly language: string;
	readonly totalStrings: number;
}): void {
	options.executeOptions.onProgress?.({
		batch: options.batch.number,
		failedStrings: options.batch.entries.length,
		language: options.language,
		phase: "batch-failed",
		totalStrings: options.totalStrings,
	});
}

function emitBatchSaved(options: {
	readonly batch: TranslationBatch;
	readonly executeOptions: ExecuteTranslateOptions;
	readonly language: string;
}): void {
	options.executeOptions.onProgress?.({
		batch: options.batch.number,
		language: options.language,
		phase: "batch-saved",
	});
}

function buildSourceCopyTranslations(
	batch: TranslationBatch,
	pluralCount: number,
) {
	return batch.entries.map((entry) => ({
		entry,
		msgstr: entry.plural
			? Array.from({ length: pluralCount }, (_, index) =>
					index === 0
						? entry.msgid
						: (entry.msgidPlural ?? entry.msgid),
				)
			: [entry.msgid],
	}));
}

async function getExistingPoPath(
	options: ExecuteTranslateOptions,
	outputFile: string,
): Promise<string | undefined> {
	if (options.inputPoPath !== undefined) return options.inputPoPath;

	try {
		await readPoFile(outputFile);
		return outputFile;
	} catch {
		return undefined;
	}
}

async function loadDictionaryIfEnabled(
	options: ExecuteTranslateOptions,
	language: string,
): Promise<DictionaryLoadResult> {
	if (!options.useDictionary) return { dictionary: {} };

	return loadDictionary({
		dictionaryPath: options.dictionaryPath,
		targetLanguage: language,
	});
}

async function processProviderBatch(options: {
	readonly batch: TranslationBatch;
	readonly dictionaryMatcher: DictionaryMatcher;
	readonly executeOptions: ExecuteTranslateOptions;
	readonly language: string;
	readonly pluralCount: number;
	readonly promptTemplate: string;
	readonly translateBatch: TranslateBatchFunction;
}): Promise<OpenAITranslateBatchResult> {
	return options.translateBatch({
		dictionaryMatches: options.dictionaryMatcher(options.batch.entries),
		dryRun: options.executeOptions.dryRun,
		entries: options.batch.entries,
		maxRetries: options.executeOptions.maxRetries,
		model: options.executeOptions.model,
		pluralCount: options.pluralCount,
		promptTemplate: options.promptTemplate,
		retryDelayMs: options.executeOptions.retryDelay,
		sourceLanguage: options.executeOptions.sourceLanguage,
		targetLanguage: options.language,
		temperature: options.executeOptions.temperature,
		timeoutSeconds: options.executeOptions.timeout,
		...(options.executeOptions.secrets.openaiApiKey !== undefined && {
			apiKey: options.executeOptions.secrets.openaiApiKey,
		}),
		...(options.executeOptions.maxTokens !== undefined && {
			maxTokens: options.executeOptions.maxTokens,
		}),
	});
}

async function processLanguage(options: {
	readonly document: PotDocument;
	readonly executeOptions: ExecuteTranslateOptions;
	readonly language: string;
	readonly maxStrings?: number;
	readonly spentCost?: OpenAICost;
	readonly translateBatch: TranslateBatchFunction;
}): Promise<TranslationLanguageResult> {
	const outputFile = buildOutputFile(
		options.executeOptions,
		options.language,
	);
	const outputDocument = await createPoOutputDocument({
		document: options.document,
		...(options.executeOptions.poHeaderTemplatePath !== undefined && {
			poHeaderTemplatePath: options.executeOptions.poHeaderTemplatePath,
		}),
		targetLanguage: options.language,
	});
	let output = outputDocument.data;
	let mergedFromExisting = 0;
	let mergeWarning: string | undefined;
	const existingPoPath = await getExistingPoPath(
		options.executeOptions,
		outputFile,
	);

	if (
		existingPoPath !== undefined &&
		options.executeOptions.forceTranslate === false
	) {
		try {
			const existing = await readPoFile(existingPoPath);
			const merged = mergeExistingPoData({
				entries: options.document.entries,
				existing,
				output,
				pluralCount: outputDocument.pluralCount,
			});
			output = merged.output;
			mergedFromExisting = merged.mergedStrings;
		} catch (error) {
			mergeWarning =
				error instanceof Error
					? `Could not merge existing PO file: ${error.message}`
					: "Could not merge existing PO file.";
			mergedFromExisting = 0;
		}
	}

	const entries = getEntriesWithTranslations(
		options.document.entries,
		output,
	);
	const batchPlan = buildTranslationBatchPlan(entries, {
		batchSize: options.executeOptions.batchSize,
		forceTranslate: options.executeOptions.forceTranslate,
		...(options.maxStrings !== undefined && {
			maxStrings: options.maxStrings,
		}),
	});
	const promptTemplate = await loadPromptTemplate(
		options.executeOptions.promptFilePath,
	);
	const dictionary = await loadDictionaryIfEnabled(
		options.executeOptions,
		options.language,
	);
	const dictionaryMatcher = createDictionaryMatcher(dictionary.dictionary);
	let cost = ZERO_COST;
	const debug: TranslationBatchDebug[] = [];
	let failed = 0;
	let failureMessage: string | undefined;
	let processedForProgress = 0;
	let skippedByCost = 0;
	let translated = 0;
	let validation = createEmptyValidationStats();

	options.executeOptions.onProgress?.({
		language: options.language,
		outputFile,
		phase: "language-started",
		plannedStrings: batchPlan.plannedStrings,
	});

	if (batchPlan.plannedStrings === 0) {
		if (!options.executeOptions.dryRun) {
			await writePoFile({ output, outputFile });
		}

		return {
			batches: 0,
			cost,
			failed: 0,
			language: options.language,
			mergedFromExisting,
			outputFile,
			plannedStrings: 0,
			skippedByExisting: batchPlan.skippedByExisting,
			skippedByCost: 0,
			skippedByLimit: batchPlan.skippedByLimit,
			sourceStrings: batchPlan.sourceStrings,
			status: "skipped",
			translated: 0,
			validation,
		};
	}

	for (const batch of batchPlan.batches) {
		options.executeOptions.onProgress?.({
			batch: batch.number,
			language: options.language,
			phase: "batch-started",
			totalBatches: batchPlan.batches.length,
		});

		if (
			isSameBaseLanguage(
				options.executeOptions.sourceLanguage,
				options.language,
			)
		) {
			output = applyTranslations({
				output,
				translations: buildSourceCopyTranslations(
					batch,
					outputDocument.pluralCount,
				),
			});
			if (!options.executeOptions.dryRun) {
				await writePoFile({ output, outputFile });
				emitBatchSaved({
					batch,
					executeOptions: options.executeOptions,
					language: options.language,
				});
				translated += batch.entries.length;
			}
			processedForProgress += batch.entries.length;
		} else {
			const estimated = await processProviderBatch({
				batch,
				dictionaryMatcher,
				executeOptions: { ...options.executeOptions, dryRun: true },
				language: options.language,
				pluralCount: outputDocument.pluralCount,
				promptTemplate: promptTemplate.prompt,
				translateBatch: options.translateBatch,
			});
			if (!estimated.ok) {
				failed += batch.entries.length;
				processedForProgress += batch.entries.length;
				failureMessage = estimated.error;
				emitBatchFailure({
					batch,
					executeOptions: options.executeOptions,
					language: options.language,
					totalStrings: batchPlan.plannedStrings,
				});
				if (
					options.executeOptions.abortOnFailure ||
					options.executeOptions.skipLanguageOnFailure
				) {
					break;
				}
				continue;
			}
			if (
				shouldSkipBatchForCost({
					batchCost: estimated.cost,
					currentCost: addCosts(options.spentCost ?? ZERO_COST, cost),
					maxCost: options.executeOptions.maxCost,
				})
			) {
				const skippedStrings = countBatchEntriesFrom(
					batchPlan.batches,
					batch.number,
				);
				skippedByCost += skippedStrings;
				options.executeOptions.onProgress?.({
					batch: batch.number,
					language: options.language,
					phase: "batch-skipped",
					reason: "cost-limit",
					skippedStrings,
					totalStrings: batchPlan.plannedStrings,
				});
				break;
			}

			const result = options.executeOptions.dryRun
				? estimated
				: await processProviderBatch({
						batch,
						dictionaryMatcher,
						executeOptions: options.executeOptions,
						language: options.language,
						pluralCount: outputDocument.pluralCount,
						promptTemplate: promptTemplate.prompt,
						translateBatch: options.translateBatch,
					});
			if (!result.ok) {
				if (options.executeOptions.saveDebugInfo === true) {
					const batchDebug = getBatchDebug({
						batch: batch.number,
						result,
						targetLanguage: options.language,
					});
					if (batchDebug !== undefined) debug.push(batchDebug);
				}
				failed += batch.entries.length;
				processedForProgress += batch.entries.length;
				failureMessage = result.error;
				emitBatchFailure({
					batch,
					executeOptions: options.executeOptions,
					language: options.language,
					totalStrings: batchPlan.plannedStrings,
				});
				if (
					options.executeOptions.abortOnFailure ||
					options.executeOptions.skipLanguageOnFailure
				) {
					break;
				}
				continue;
			}

			if (options.executeOptions.saveDebugInfo === true) {
				const batchDebug = getBatchDebug({
					batch: batch.number,
					result,
					targetLanguage: options.language,
				});
				if (batchDebug !== undefined) debug.push(batchDebug);
			}
			const batchValidation =
				result.validationStats ?? createEmptyValidationStats();
			const issueCount = getValidationIssueCount(batchValidation);
			const invalidEntryKeys = getInvalidEntryKeys(batchValidation);
			const safeTranslations = result.translations.filter(
				(translation) => !invalidEntryKeys.has(translation.entry.key),
			);
			if (
				!options.executeOptions.dryRun &&
				shouldSkipBatchForCost({
					batchCost: result.cost,
					currentCost: addCosts(options.spentCost ?? ZERO_COST, cost),
					maxCost: options.executeOptions.maxCost,
				})
			) {
				cost = addCosts(cost, result.cost);
				const skippedStrings = countBatchEntriesFrom(
					batchPlan.batches,
					batch.number,
				);
				skippedByCost += skippedStrings;
				options.executeOptions.onProgress?.({
					batch: batch.number,
					language: options.language,
					phase: "batch-skipped",
					reason: "cost-limit",
					skippedStrings,
					totalStrings: batchPlan.plannedStrings,
				});
				break;
			}

			cost = addCosts(cost, result.cost);
			if (!options.executeOptions.dryRun) {
				failed += result.missingEntries.length + invalidEntryKeys.size;
			}
			validation = addValidationStats(validation, batchValidation);
			if (!options.executeOptions.dryRun) {
				if (safeTranslations.length > 0) {
					output = applyTranslations({
						output,
						translations: safeTranslations,
					});
					await writePoFile({ output, outputFile });
					emitBatchSaved({
						batch,
						executeOptions: options.executeOptions,
						language: options.language,
					});
					translated += safeTranslations.length;
				}
			}
			processedForProgress += options.executeOptions.dryRun
				? batch.entries.length
				: safeTranslations.length +
					result.missingEntries.length +
					invalidEntryKeys.size;
			if (issueCount > 0) {
				options.executeOptions.onProgress?.({
					issues: issueCount,
					language: options.language,
					phase: "validation-issues",
				});
			}
		}

		options.executeOptions.onProgress?.({
			batch: batch.number,
			language: options.language,
			phase: "batch-completed",
			processedStrings: processedForProgress,
			totalStrings: batchPlan.plannedStrings,
		});
	}

	const status: TranslationLanguageStatus = options.executeOptions.dryRun
		? "dry-run"
		: failed > 0 || skippedByCost > 0
			? "failed"
			: "completed";

	options.executeOptions.onProgress?.({
		language: options.language,
		phase: "language-completed",
		status,
	});

	return {
		batches: batchPlan.batches.length,
		cost,
		failed,
		language: options.language,
		mergedFromExisting,
		outputFile,
		plannedStrings: batchPlan.plannedStrings,
		skippedByExisting: batchPlan.skippedByExisting,
		skippedByCost,
		skippedByLimit: batchPlan.skippedByLimit,
		sourceStrings: batchPlan.sourceStrings,
		status,
		translated,
		validation,
		...(debug.length > 0 && { debug }),
		...(failureMessage !== undefined && { error: failureMessage }),
		...(mergeWarning !== undefined ||
		outputDocument.headerTemplate.warning !== undefined ||
		promptTemplate.warning !== undefined ||
		dictionary.warning !== undefined
			? {
					warning: [
						mergeWarning,
						outputDocument.headerTemplate.warning,
						promptTemplate.warning,
						dictionary.warning,
					]
						.filter(
							(warning): warning is string =>
								warning !== undefined,
						)
						.join(" "),
				}
			: {}),
	};
}

function getRunStatus(
	results: readonly TranslationLanguageResult[],
	dryRun: boolean,
): TranslationRunStatus {
	if (dryRun) return "dry-run";
	if (
		results.every(
			(result) =>
				result.status === "completed" || result.status === "skipped",
		)
	) {
		return "completed";
	}
	if (results.every((result) => result.status === "failed")) return "failed";

	return "partial";
}

function buildSummary(
	results: readonly TranslationLanguageResult[],
	status: TranslationRunStatus,
): string {
	const translated = results.reduce(
		(total, result) => total + result.translated,
		0,
	);
	const failed = results.reduce((total, result) => total + result.failed, 0);

	return `${status}: ${translated} translated, ${failed} failed across ${results.length} languages.`;
}

function buildTotals(
	results: readonly TranslationLanguageResult[],
): TranslationRunTotals {
	return results.reduce<TranslationRunTotals>(
		(totals, result) => ({
			failed: totals.failed + result.failed,
			plannedStrings: totals.plannedStrings + result.plannedStrings,
			skippedByCost: totals.skippedByCost + result.skippedByCost,
			skippedByExisting:
				totals.skippedByExisting + result.skippedByExisting,
			skippedByLimit: totals.skippedByLimit + result.skippedByLimit,
			sourceStrings: totals.sourceStrings + result.sourceStrings,
			translated: totals.translated + result.translated,
		}),
		{
			failed: 0,
			plannedStrings: 0,
			skippedByCost: 0,
			skippedByExisting: 0,
			skippedByLimit: 0,
			sourceStrings: 0,
			translated: 0,
		},
	);
}

function buildValidation(
	results: readonly TranslationLanguageResult[],
): TranslationValidationStats {
	return results.reduce(
		(total, result) => addValidationStats(total, result.validation),
		createEmptyValidationStats(),
	);
}

function canProcessLanguagesConcurrently(
	options: ExecuteTranslateOptions,
): boolean {
	return (
		options.jobs > 1 &&
		options.maxCost === undefined &&
		options.maxTotalStrings === undefined &&
		!options.abortOnFailure
	);
}

async function processLanguagesConcurrently(options: {
	readonly document: PotDocument;
	readonly executeOptions: ExecuteTranslateOptions;
	readonly translateBatch: TranslateBatchFunction;
}): Promise<readonly TranslationLanguageResult[]> {
	const results: TranslationLanguageResult[] = [];
	let nextLanguageIndex = 0;
	const workerCount = Math.min(
		options.executeOptions.jobs,
		options.executeOptions.targetLanguages.length,
	);

	options.executeOptions.targetLanguages.forEach((language) => {
		options.executeOptions.onProgress?.({
			language,
			phase: "language-queued",
		});
	});

	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (
				nextLanguageIndex <
				options.executeOptions.targetLanguages.length
			) {
				const index = nextLanguageIndex;
				nextLanguageIndex += 1;
				const language = options.executeOptions.targetLanguages[index];
				if (language === undefined) continue;

				results[index] = await processLanguage({
					document: options.document,
					executeOptions: options.executeOptions,
					language,
					translateBatch: options.translateBatch,
					...(options.executeOptions.maxStringsPerJob !==
						undefined && {
						maxStrings: options.executeOptions.maxStringsPerJob,
					}),
				}).catch((error: unknown) =>
					buildFailedLanguageResult({
						error,
						executeOptions: options.executeOptions,
						language,
					}),
				);
			}
		}),
	);

	return results.filter(
		(result): result is TranslationLanguageResult => result !== undefined,
	);
}

async function processLanguagesSequentially(options: {
	readonly document: PotDocument;
	readonly executeOptions: ExecuteTranslateOptions;
	readonly translateBatch: TranslateBatchFunction;
}): Promise<readonly TranslationLanguageResult[]> {
	let remainingStrings =
		options.executeOptions.maxTotalStrings ?? Number.POSITIVE_INFINITY;
	const results: TranslationLanguageResult[] = [];
	let totalCost = ZERO_COST;

	for (const language of options.executeOptions.targetLanguages) {
		options.executeOptions.onProgress?.({
			language,
			phase: "language-queued",
		});
		const maxStrings = Math.min(
			remainingStrings,
			options.executeOptions.maxStringsPerJob ?? Number.POSITIVE_INFINITY,
		);
		const result = await processLanguage({
			document: options.document,
			executeOptions: options.executeOptions,
			language,
			spentCost: totalCost,
			translateBatch: options.translateBatch,
			...(Number.isFinite(maxStrings) && {
				maxStrings: Math.trunc(maxStrings),
			}),
		}).catch((error: unknown) =>
			buildFailedLanguageResult({
				error,
				executeOptions: options.executeOptions,
				language,
			}),
		);
		results.push(result);
		totalCost = addCosts(totalCost, result.cost);
		remainingStrings -= result.plannedStrings;

		if (
			(options.executeOptions.abortOnFailure &&
				result.status === "failed") ||
			result.skippedByCost > 0
		) {
			break;
		}
	}

	return results;
}

export async function executeTranslate(
	options: ExecuteTranslateOptions,
	translateBatch: TranslateBatchFunction = translateOpenAIBatch,
): Promise<TranslationRunResult> {
	assertUniqueOutputFiles(options);
	const document = await readPotDocument(options.potFilePath);
	const results = canProcessLanguagesConcurrently(options)
		? await processLanguagesConcurrently({
				document,
				executeOptions: options,
				translateBatch,
			})
		: await processLanguagesSequentially({
				document,
				executeOptions: options,
				translateBatch,
			});
	const cost = results.reduce(
		(total, result) => addCosts(total, result.cost),
		ZERO_COST,
	);

	const status = getRunStatus(results, options.dryRun);

	return {
		analysis: document.analysis,
		cost,
		results,
		status,
		summary: buildSummary(results, status),
		totals: buildTotals(results),
		validation: buildValidation(results),
	};
}
