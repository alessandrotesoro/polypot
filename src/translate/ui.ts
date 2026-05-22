import path from "node:path";
import cliProgress from "cli-progress";
import {
	Listr,
	type ListrBaseClassOptions,
	type ListrRendererValue,
	type ListrTask,
} from "listr2";
import color from "yoctocolors";
import type { PolypotSecrets } from "../config/secrets.js";
import { sanitizeTerminalText } from "../terminal.js";
import {
	type ExecuteTranslateOptions,
	executeTranslate,
	type TranslationProgressEvent,
} from "./executor.js";
import { analyzePotFile, type PotAnalysis } from "./pot.js";
import type {
	TranslationLanguageResult,
	TranslationRunResult,
	TranslationRunStatus,
} from "./results.js";
import {
	buildTranslateWorkload,
	type LocaleFormat,
	type TranslatePreviewWorkload,
	type TranslationEstimate,
} from "./workload.js";

export type { TranslationEstimate } from "./workload.js";

const PROGRESS_BAR_SIZE = 24;
const numberFormatter = new Intl.NumberFormat("en-US");
type TranslateDebugEntry = NonNullable<
	TranslationLanguageResult["debug"]
>[number];

interface TranslateUiPreviewOptions {
	readonly batchSize: number;
	readonly dryRun: boolean;
	readonly jobs: number;
	readonly languages: readonly string[];
	readonly localeFormat: LocaleFormat;
	readonly maxCost?: number;
	readonly maxStringsPerJob?: number;
	readonly maxTotalStrings?: number;
	readonly outputDir: string;
	readonly outputFormat: string;
	readonly poFilePrefix?: string;
	readonly sourceLanguage: string;
	readonly verboseLevel: number;
}

interface TranslateConfigSnapshot {
	readonly forceTranslate: boolean;
	readonly model: string;
	readonly potFilePath?: string;
	readonly provider: string;
}

export interface TranslateSettingsSnapshot {
	readonly behavior: {
		readonly dictionaryPath: string;
		readonly forceTranslate: boolean;
		readonly poHeaderTemplatePath: string;
		readonly promptFilePath: string;
		readonly useDictionary: boolean;
	};
	readonly debug: {
		readonly dryRun: boolean;
		readonly saveDebugInfo: boolean;
		readonly verboseLevel: number;
	};
	readonly limits: {
		readonly maxCost?: number;
		readonly maxStringsPerJob?: number;
		readonly maxTotalStrings?: number;
	};
	readonly output: {
		readonly localeFormat: LocaleFormat;
		readonly outputDir: string;
		readonly outputFile?: string;
		readonly outputFormat: string;
		readonly poFilePrefix?: string;
	};
	readonly performance: {
		readonly batchSize: number;
		readonly jobs: number;
		readonly timeout: number;
	};
	readonly provider: {
		readonly maxTokens?: number;
		readonly model: string;
		readonly provider: string;
		readonly temperature: number | string;
	};
	readonly retries: {
		readonly abortOnFailure: boolean;
		readonly maxRetries: number;
		readonly retryDelay: number;
		readonly skipLanguageOnFailure: boolean;
	};
	readonly source: {
		readonly inputPoPath?: string;
		readonly potFilePath?: string;
		readonly sourceLanguage: string;
		readonly targetLanguages: readonly string[];
	};
}

interface TranslateUiPlan {
	readonly config: TranslateConfigSnapshot;
	readonly preview: TranslateUiPreviewOptions;
	readonly secrets: PolypotSecrets;
	readonly settings: TranslateSettingsSnapshot;
}

export interface LanguagePreviewResult {
	readonly batches: number;
	readonly error?: string;
	readonly estimate: TranslationEstimate;
	readonly failed?: number;
	readonly language: string;
	readonly mergedFromExisting?: number;
	readonly outputFile: string;
	readonly skippedByExisting?: number;
	readonly skippedByCost: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
	readonly status?: string;
	readonly strings: number;
	readonly translated: number;
	readonly validation?: TranslationLanguageResult["validation"];
	readonly warning?: string;
}

export interface TranslateUiResult {
	readonly analysis?: {
		readonly contextStrings: number;
		readonly filePath: string;
		readonly fuzzyStrings: number;
		readonly pluralStrings: number;
		readonly sourceCharacters: number;
		readonly totalStrings: number;
	};
	readonly error?: {
		readonly code:
			| "missing_pot_file_path"
			| "missing_target_languages"
			| "pot_analysis_failed"
			| "unsupported_provider";
		readonly message: string;
		readonly potFilePath?: string;
	};
	readonly implemented: boolean;
	readonly mode: "dry-run" | "translate";
	readonly plan: {
		readonly batchSize: number;
		readonly dryRun: boolean;
		readonly forceTranslate: boolean;
		readonly jobs: number;
		readonly languages: readonly string[];
		readonly maxCost?: number;
		readonly maxStringsPerJob?: number;
		readonly maxTotalStrings?: number;
		readonly model: string;
		readonly outputDir: string;
		readonly potFilePath?: string;
		readonly provider: string;
		readonly settings: TranslateSettingsSnapshot;
		readonly sourceLanguage: string;
	};
	readonly results: readonly LanguagePreviewResult[];
	readonly status: "blocked" | TranslationRunStatus;
	readonly summary: string;
	readonly cost?: TranslationRunResult["cost"];
	readonly debug?: readonly TranslateDebugEntry[];
	readonly totals?: TranslationRunResult["totals"];
	readonly validation?: TranslationRunResult["validation"];
}

const progressBarOptions: cliProgress.Options = {
	barCompleteString: "#".repeat(PROGRESS_BAR_SIZE),
	barGlue: "",
	barIncompleteString: "-".repeat(PROGRESS_BAR_SIZE),
	barsize: PROGRESS_BAR_SIZE,
};

function buildProgressBar(value: number, total: number): string {
	const progress = total > 0 ? Math.min(value / total, 1) : 1;

	return cliProgress.Format.BarFormat(progress, progressBarOptions);
}

function formatCurrency(value: number): string {
	if (value > 0 && value < 0.0001) return "<$0.0001";

	return `$${value.toFixed(4)}`;
}

function formatNumber(value: number): string {
	return numberFormatter.format(value);
}

function formatCount(
	value: number,
	singular: string,
	plural = `${singular}s`,
): string {
	return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}

function row(name: string, value: string, width?: number): string {
	return `  ${name.padEnd(width ?? 10)} ${value}`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return "<1s";

	const seconds = Math.ceil(ms / 1000);
	if (seconds < 60) return `${seconds}s`;

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	return remainingSeconds === 0
		? `${minutes}m`
		: `${minutes}m ${remainingSeconds}s`;
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function getConcurrentJobs(preview: TranslateUiPreviewOptions): number {
	return Math.max(1, Math.min(preview.jobs, preview.languages.length));
}

function getRenderer(preview: TranslateUiPreviewOptions): ListrRendererValue {
	if (preview.outputFormat === "json") return "silent";
	if (preview.verboseLevel === 0) return "silent";

	return process.stdout.isTTY ? "default" : "verbose";
}

function formatLimits(preview: TranslateUiPreviewOptions): string {
	const limits = [
		preview.maxStringsPerJob === undefined
			? undefined
			: `per language ${preview.maxStringsPerJob}`,
		preview.maxTotalStrings === undefined
			? undefined
			: `global ${preview.maxTotalStrings}`,
		preview.maxCost === undefined
			? undefined
			: `budget ${formatCurrency(preview.maxCost)}`,
	].filter((limit): limit is string => limit !== undefined);

	return limits.length === 0 ? "none" : limits.join(" | ");
}

function formatPath(value: string): string {
	return sanitizeTerminalText(value);
}

function formatLanguage(value: string): string {
	return sanitizeTerminalText(value);
}

function formatSourceDetails(analysis: PotAnalysis): string {
	return `${formatNumber(analysis.pluralStrings)} plural | ${formatNumber(analysis.contextStrings)} context | ${formatNumber(analysis.fuzzyStrings)} fuzzy`;
}

function formatWorkload(workload: TranslatePreviewWorkload): string {
	return `${formatNumber(workload.plannedStrings)} / ${formatNumber(workload.sourceStrings)} planned strings across ${formatCount(workload.batches, "batch", "batches")}`;
}

function formatProgressLine(options: {
	readonly language: string;
	readonly outputFile: string;
	readonly phase: string;
	readonly plannedStrings: number;
	readonly processedStrings: number;
	readonly startedAt: number;
}): string {
	const percentage =
		options.plannedStrings > 0
			? Math.round(
					(options.processedStrings / options.plannedStrings) * 100,
				)
			: 100;
	const elapsedMs = Date.now() - options.startedAt;
	const etaMs =
		options.processedStrings > 0 &&
		options.processedStrings < options.plannedStrings
			? (elapsedMs / options.processedStrings) *
				(options.plannedStrings - options.processedStrings)
			: 0;
	const detail = [
		options.phase,
		`elapsed ${formatDuration(elapsedMs)}`,
		`eta ${formatDuration(etaMs)}`,
		`output ${formatPath(options.outputFile)}`,
	].join(" | ");

	return [
		`${formatLanguage(options.language)}  ${buildProgressBar(options.processedStrings, options.plannedStrings)}  ${formatNumber(options.processedStrings)} / ${formatNumber(options.plannedStrings)}  ${percentage}%`,
		`  ${color.dim(detail)}`,
	].join("\n");
}

function buildPreflight(
	preview: TranslateUiPreviewOptions,
	workload: TranslatePreviewWorkload,
): string {
	const analysis = workload.analysis;

	return [
		color.bold("Translate preview"),
		"",
		color.bold("Source"),
		row("File", path.basename(formatPath(analysis.filePath))),
		row("Strings", formatNumber(analysis.totalStrings)),
		row("Details", formatSourceDetails(analysis)),
		"",
		color.bold("Plan"),
		row("Targets", preview.languages.map(formatLanguage).join(", ")),
		row("Workload", formatWorkload(workload)),
		row(
			"Runtime",
			`${formatCount(getConcurrentJobs(preview), "job")}, batch size ${preview.batchSize}`,
		),
		row(
			"Estimate",
			`~${formatNumber(workload.estimate.totalTokens)} tokens, ~${formatCurrency(workload.estimate.cost)}`,
		),
		row("Limits", formatLimits(preview)),
		"",
	].join("\n");
}

function buildSummaryFromWorkload(workload: TranslatePreviewWorkload): string {
	const languageLines = workload.languages.map((language) =>
		row(
			formatLanguage(language.language),
			formatPath(language.outputFile),
			9,
		),
	);

	return [
		"Preview complete",
		"",
		"Planned",
		row("Languages", formatNumber(workload.languages.length)),
		row(
			"Strings",
			`${formatNumber(workload.plannedStrings)} / ${formatNumber(workload.sourceStrings)}`,
		),
		row("Batches", formatNumber(workload.batches)),
		row("Cost", `~${formatCurrency(workload.estimate.cost)}`),
		row(
			"Skipped",
			`${formatNumber(workload.skippedByLimit)} by limits, ${formatNumber(workload.skippedByCost)} by cost`,
		),
		"",
		"Outputs",
		...languageLines,
		"",
		"No translations were written.",
		"Estimate note: token and cost numbers are local planning estimates only.",
	].join("\n");
}

function appendDryRunSummary(
	preview: TranslateUiPreviewOptions,
	workload: TranslatePreviewWorkload,
	result: TranslateUiResult,
): TranslateUiResult {
	if (!preview.dryRun || result.status !== "dry-run") return result;

	return {
		...result,
		summary: `${buildSummaryFromWorkload(workload)}\n\n${result.summary}`,
	};
}

function buildBaseResult(
	plan: TranslateUiPlan,
): Omit<TranslateUiResult, "analysis" | "results" | "status" | "summary"> {
	const { config, preview } = plan;

	return {
		implemented: true,
		mode: preview.dryRun ? "dry-run" : "translate",
		plan: {
			batchSize: preview.batchSize,
			dryRun: preview.dryRun,
			forceTranslate: config.forceTranslate,
			jobs: preview.jobs,
			languages: preview.languages,
			...(preview.maxCost !== undefined && { maxCost: preview.maxCost }),
			...(preview.maxStringsPerJob !== undefined && {
				maxStringsPerJob: preview.maxStringsPerJob,
			}),
			...(preview.maxTotalStrings !== undefined && {
				maxTotalStrings: preview.maxTotalStrings,
			}),
			model: config.model,
			outputDir: preview.outputDir,
			...(config.potFilePath !== undefined && {
				potFilePath: config.potFilePath,
			}),
			provider: config.provider,
			settings: plan.settings,
			sourceLanguage: preview.sourceLanguage,
		},
	};
}

function resolveTemperature(value: number | string): number {
	if (typeof value === "number") return value;

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0.7;
}

function buildExecuteOptions(
	plan: TranslateUiPlan,
	onProgress?: (event: TranslationProgressEvent) => void,
): ExecuteTranslateOptions {
	const { config, preview, settings } = plan;
	if (config.potFilePath === undefined) {
		throw new Error("POT file path is required before translation starts.");
	}

	return {
		abortOnFailure: settings.retries.abortOnFailure,
		batchSize: preview.batchSize,
		dictionaryPath: settings.behavior.dictionaryPath,
		dryRun: preview.dryRun,
		forceTranslate: config.forceTranslate,
		jobs: preview.jobs,
		localeFormat: preview.localeFormat,
		maxRetries: settings.retries.maxRetries,
		model: config.model,
		outputDir: preview.outputDir,
		potFilePath: config.potFilePath,
		retryDelay: settings.retries.retryDelay,
		saveDebugInfo: settings.debug.saveDebugInfo,
		secrets: plan.secrets,
		skipLanguageOnFailure: settings.retries.skipLanguageOnFailure,
		sourceLanguage: preview.sourceLanguage,
		targetLanguages: preview.languages,
		temperature: resolveTemperature(settings.provider.temperature),
		timeout: settings.performance.timeout,
		useDictionary: settings.behavior.useDictionary,
		...(onProgress !== undefined && { onProgress }),
		...(settings.source.inputPoPath !== undefined && {
			inputPoPath: settings.source.inputPoPath,
		}),
		...(settings.limits.maxCost !== undefined && {
			maxCost: settings.limits.maxCost,
		}),
		...(settings.limits.maxStringsPerJob !== undefined && {
			maxStringsPerJob: settings.limits.maxStringsPerJob,
		}),
		...(settings.limits.maxTotalStrings !== undefined && {
			maxTotalStrings: settings.limits.maxTotalStrings,
		}),
		...(settings.provider.maxTokens !== undefined && {
			maxTokens: settings.provider.maxTokens,
		}),
		...(settings.output.poFilePrefix !== undefined && {
			poFilePrefix: settings.output.poFilePrefix,
		}),
		...(settings.behavior.poHeaderTemplatePath !== undefined && {
			poHeaderTemplatePath: settings.behavior.poHeaderTemplatePath,
		}),
		...(settings.behavior.promptFilePath !== undefined && {
			promptFilePath: settings.behavior.promptFilePath,
		}),
	};
}

function toUiLanguageResult(
	language: TranslationLanguageResult,
): LanguagePreviewResult {
	return {
		batches: language.batches,
		estimate: {
			cost: language.cost.totalCost,
			inputTokens: language.cost.promptTokens,
			outputTokens: language.cost.completionTokens,
			totalTokens: language.cost.totalTokens,
		},
		language: language.language,
		...(language.error !== undefined && { error: language.error }),
		failed: language.failed,
		mergedFromExisting: language.mergedFromExisting,
		outputFile: language.outputFile,
		skippedByExisting: language.skippedByExisting,
		skippedByCost: language.skippedByCost,
		skippedByLimit: language.skippedByLimit,
		sourceStrings: language.sourceStrings,
		status: language.status,
		strings: language.plannedStrings,
		translated: language.translated,
		validation: language.validation,
		...(language.warning !== undefined && { warning: language.warning }),
	};
}

function toUiResult(
	plan: TranslateUiPlan,
	result: TranslationRunResult,
): TranslateUiResult {
	const baseResult = buildBaseResult(plan);

	return {
		...baseResult,
		analysis: {
			contextStrings: result.analysis.contextStrings,
			filePath: result.analysis.filePath,
			fuzzyStrings: result.analysis.fuzzyStrings,
			pluralStrings: result.analysis.pluralStrings,
			sourceCharacters: result.analysis.sourceCharacters,
			totalStrings: result.analysis.totalStrings,
		},
		results: result.results.map(toUiLanguageResult),
		status: result.status,
		summary: result.summary,
		cost: result.cost,
		debug: result.results.flatMap((language) => language.debug ?? []),
		totals: result.totals,
		validation: result.validation,
	};
}

interface ProgressState {
	readonly outputFile: string;
	readonly plannedStrings: number;
	readonly processedStrings: number;
	readonly phase: string;
	readonly startedAt: number;
}

function updateProgressState(
	states: Map<string, ProgressState>,
	event: TranslationProgressEvent,
	dryRun: boolean,
): void {
	const current = states.get(event.language);
	const startedAt = current?.startedAt ?? Date.now();
	const updateCurrent = (
		update: (current: ProgressState) => ProgressState,
	): void => {
		if (current !== undefined) states.set(event.language, update(current));
	};

	switch (event.phase) {
		case "language-queued":
			states.set(event.language, {
				outputFile: "",
				phase: "Queued",
				plannedStrings: 0,
				processedStrings: 0,
				startedAt,
			});
			return;
		case "language-started":
			states.set(event.language, {
				outputFile: event.outputFile,
				phase: "Preparing",
				plannedStrings: event.plannedStrings,
				processedStrings: 0,
				startedAt,
			});
			return;
		case "batch-started":
			updateCurrent((state) => ({
				...state,
				phase: `Batch ${event.batch}/${event.totalBatches}`,
			}));
			return;
		case "batch-skipped":
			updateCurrent((state) => ({
				...state,
				phase: `Skipped batch ${event.batch}: ${event.reason}`,
				plannedStrings: event.totalStrings,
				processedStrings: state.processedStrings + event.skippedStrings,
			}));
			return;
		case "batch-failed":
			updateCurrent((state) => ({
				...state,
				phase: `Failed batch ${event.batch}`,
				plannedStrings: event.totalStrings,
				processedStrings: state.processedStrings + event.failedStrings,
			}));
			return;
		case "batch-completed":
			updateCurrent((state) => ({
				...state,
				phase: `${dryRun ? "Planned" : "Saved"} batch ${event.batch}`,
				plannedStrings: event.totalStrings,
				processedStrings: event.processedStrings,
			}));
			return;
		case "batch-saved":
			updateCurrent((state) => ({
				...state,
				phase: `Saved batch ${event.batch}`,
			}));
			return;
		case "validation-issues":
			updateCurrent((state) => ({
				...state,
				phase: `${event.issues} validation issue${event.issues === 1 ? "" : "s"}`,
			}));
			return;
		case "language-completed":
			updateCurrent((state) => ({
				...state,
				phase: event.status,
				processedStrings:
					event.status === "completed" || event.status === "dry-run"
						? state.plannedStrings
						: state.processedStrings,
			}));
			return;
		default: {
			const _exhaustive: never = event;
			throw new Error(`Unhandled progress event: ${String(_exhaustive)}`);
		}
	}
}

function formatExecutionTitle(
	languages: readonly string[],
	states: ReadonlyMap<string, ProgressState>,
): string {
	const lines = languages.map((language) => {
		const state = states.get(language);
		if (state === undefined) return `${formatLanguage(language)} queued`;
		if (state.phase === "Queued") {
			return `${formatLanguage(language)} queued`;
		}

		return formatProgressLine({
			language,
			outputFile: state.outputFile,
			phase: state.phase,
			plannedStrings: state.plannedStrings,
			processedStrings: state.processedStrings,
			startedAt: state.startedAt,
		});
	});

	return lines.join("\n");
}

async function runTranslateExecution(
	plan: TranslateUiPlan,
	renderer: ListrRendererValue,
): Promise<TranslateUiResult> {
	if (renderer === "silent") {
		return toUiResult(
			plan,
			await executeTranslate(buildExecuteOptions(plan)),
		);
	}

	const states = new Map<string, ProgressState>();
	let executionResult: TranslationRunResult | undefined;
	const tasks: ListrTask[] = [
		{
			title: formatExecutionTitle(plan.preview.languages, states),
			task: async (_ctx, task): Promise<void> => {
				const options = buildExecuteOptions(plan, (event) => {
					updateProgressState(states, event, plan.preview.dryRun);
					task.title = formatExecutionTitle(
						plan.preview.languages,
						states,
					);
				});
				executionResult = await executeTranslate(options);
				task.title = formatExecutionTitle(
					plan.preview.languages,
					states,
				);
			},
		},
	];
	const runnerOptions = {
		concurrent: false,
		exitOnError: false,
		renderer,
		rendererOptions:
			renderer === "verbose"
				? { logTitleChange: true }
				: {
						collapseErrors: false,
						formatOutput: "wrap",
						showTimer: true,
					},
	} satisfies ListrBaseClassOptions<
		unknown,
		ListrRendererValue,
		ListrRendererValue
	>;
	const runner = new Listr<unknown, ListrRendererValue, ListrRendererValue>(
		tasks,
		runnerOptions,
	);

	await runner.run();
	if (executionResult === undefined) {
		throw new Error("Translation execution did not return a result.");
	}

	return toUiResult(plan, executionResult);
}

export async function runTranslateUiPreview(
	plan: TranslateUiPlan,
): Promise<TranslateUiResult> {
	const { config, preview } = plan;
	const baseResult = buildBaseResult(plan);

	if (preview.languages.length === 0) {
		const message =
			"No target languages are configured. Add --target-languages or set source.targetLanguages in Polypot config.";

		return {
			...baseResult,
			error: {
				code: "missing_target_languages",
				message,
			},
			results: [],
			status: "blocked",
			summary: message,
		};
	}

	if (config.potFilePath === undefined) {
		const message =
			"No POT file path is configured. Add --pot-file-path or set source.potFilePath in Polypot config.";

		return {
			...baseResult,
			error: {
				code: "missing_pot_file_path",
				message,
			},
			results: [],
			status: "blocked",
			summary: message,
		};
	}

	if (config.provider !== "openai") {
		const message = `Provider ${sanitizeTerminalText(config.provider)} is not supported by translate yet. Use --provider openai.`;

		return {
			...baseResult,
			error: {
				code: "unsupported_provider",
				message,
			},
			results: [],
			status: "blocked",
			summary: message,
		};
	}

	const renderer = getRenderer(preview);
	let analysis: PotAnalysis;
	try {
		analysis = await analyzePotFile(config.potFilePath);
	} catch (error) {
		const message = formatError(error);

		return {
			...baseResult,
			error: {
				code: "pot_analysis_failed",
				message,
				potFilePath: config.potFilePath,
			},
			results: [],
			status: "blocked",
			summary: `Cannot read or parse POT file at ${sanitizeTerminalText(config.potFilePath)}: ${sanitizeTerminalText(message)}`,
		};
	}

	const workload = buildTranslateWorkload(preview, analysis);
	if (renderer === "silent") {
		return appendDryRunSummary(
			preview,
			workload,
			await runTranslateExecution(plan, renderer),
		);
	}

	process.stdout.write(buildPreflight(preview, workload));
	return appendDryRunSummary(
		preview,
		workload,
		await runTranslateExecution(plan, renderer),
	);
}
