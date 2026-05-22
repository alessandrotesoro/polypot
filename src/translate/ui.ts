import path from "node:path";
import cliProgress from "cli-progress";
import {
	Listr,
	type ListrBaseClassOptions,
	type ListrRendererValue,
	type ListrTask,
} from "listr2";
import color from "yoctocolors";
import { sanitizeTerminalText } from "../terminal.js";
import { analyzePotFile, type PotAnalysis } from "./pot.js";
import {
	buildTranslateWorkload,
	type LanguageWorkPlan,
	type LocaleFormat,
	type TranslatePreviewWorkload,
	type TranslationEstimate,
} from "./workload.js";

export type { TranslationEstimate } from "./workload.js";

const PROGRESS_BAR_SIZE = 24;
const PREVIEW_STEP_DELAY_MS = 650;
const MAX_PREVIEW_PROGRESS_UPDATES = 20;
const numberFormatter = new Intl.NumberFormat("en-US");

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
	readonly settings: TranslateSettingsSnapshot;
}

export interface LanguagePreviewResult {
	readonly batches: number;
	readonly estimate: TranslationEstimate;
	readonly language: string;
	readonly outputFile: string;
	readonly skippedByCost: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
	readonly strings: number;
	readonly translated: number;
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
			| "pot_analysis_failed";
		readonly message: string;
		readonly potFilePath?: string;
	};
	readonly implemented: false;
	readonly mode: "ui-preview";
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
	readonly status: "blocked" | "previewed";
	readonly summary: string;
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

function getPreviewStepDelayMs(renderer: ListrRendererValue): number {
	return renderer === "default" ? PREVIEW_STEP_DELAY_MS : 0;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
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

function getPreviewProgressUpdates(batches: number): number {
	return Math.min(batches, MAX_PREVIEW_PROGRESS_UPDATES);
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

function formatLanguageTitle(
	preview: TranslateUiPreviewOptions,
	plan: LanguageWorkPlan,
	processed: number,
	phase: string,
	startedAt: number,
): string {
	const percentage =
		plan.plannedStrings > 0
			? Math.round((processed / plan.plannedStrings) * 100)
			: 100;
	const elapsedMs = Date.now() - startedAt;
	const etaMs =
		processed > 0 && processed < plan.plannedStrings
			? (elapsedMs / processed) * (plan.plannedStrings - processed)
			: 0;
	const detail = [
		phase,
		`elapsed ${formatDuration(elapsedMs)}`,
		`eta ${formatDuration(etaMs)}`,
		preview.dryRun ? "dry run" : "preview",
		`~${formatNumber(plan.estimate.totalTokens)} tokens`,
		`~${formatCurrency(plan.estimate.cost)}`,
		`output ${formatPath(plan.outputFile)}`,
	].join(" | ");

	return [
		`${formatLanguage(plan.language)}  ${buildProgressBar(processed, plan.plannedStrings)}  ${formatNumber(processed)} / ${formatNumber(plan.plannedStrings)}  ${percentage}%`,
		`  ${color.dim(detail)}`,
	].join("\n");
}

function buildLanguageTask(
	preview: TranslateUiPreviewOptions,
	plan: LanguageWorkPlan,
	stepDelayMs: number,
): ListrTask {
	return {
		title:
			plan.plannedStrings === 0
				? `${formatLanguage(plan.language)} skipped: no strings selected after limits`
				: `${formatLanguage(plan.language)} queued (${plan.plannedStrings}/${plan.sourceStrings} strings planned)`,
		task: async (_ctx, task): Promise<void> => {
			if (plan.plannedStrings === 0) {
				task.title = `${formatLanguage(plan.language)} skipped: ${plan.skippedByLimit} by limits, ${plan.skippedByCost} by cost`;
				return;
			}

			const startedAt = Date.now();
			task.title = formatLanguageTitle(
				preview,
				plan,
				0,
				"Preparing",
				startedAt,
			);
			if (stepDelayMs > 0) await delay(stepDelayMs);

			const progressUpdates = getPreviewProgressUpdates(plan.batches);
			for (let update = 1; update <= progressUpdates; update += 1) {
				const processed = Math.min(
					Math.ceil((plan.plannedStrings * update) / progressUpdates),
					plan.plannedStrings,
				);
				task.title = formatLanguageTitle(
					preview,
					plan,
					processed,
					`Batch ${Math.ceil((plan.batches * update) / progressUpdates)}/${plan.batches}`,
					startedAt,
				);
				if (stepDelayMs > 0) await delay(stepDelayMs);
			}

			task.title = formatLanguageTitle(
				preview,
				plan,
				plan.plannedStrings,
				"Validating output",
				startedAt,
			);
			if (stepDelayMs > 0) await delay(stepDelayMs);
			task.title = `${formatLanguage(plan.language)}  ${buildProgressBar(plan.plannedStrings, plan.plannedStrings)}  ${formatNumber(plan.plannedStrings)} / ${formatNumber(plan.plannedStrings)}  100%\n  Preview complete | no translations written | output ${formatPath(plan.outputFile)}`;
		},
	};
}

function buildLanguageResult(plan: LanguageWorkPlan): LanguagePreviewResult {
	return {
		batches: plan.batches,
		estimate: plan.estimate,
		language: plan.language,
		outputFile: plan.outputFile,
		skippedByCost: plan.skippedByCost,
		skippedByLimit: plan.skippedByLimit,
		sourceStrings: plan.sourceStrings,
		strings: plan.plannedStrings,
		translated: 0,
	};
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

function buildBaseResult(
	plan: TranslateUiPlan,
): Omit<TranslateUiResult, "analysis" | "results" | "status" | "summary"> {
	const { config, preview } = plan;

	return {
		implemented: false,
		mode: "ui-preview",
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
	const results = workload.languages.map(buildLanguageResult);
	const result: TranslateUiResult = {
		...baseResult,
		analysis: {
			contextStrings: analysis.contextStrings,
			filePath: analysis.filePath,
			fuzzyStrings: analysis.fuzzyStrings,
			pluralStrings: analysis.pluralStrings,
			sourceCharacters: analysis.sourceCharacters,
			totalStrings: analysis.totalStrings,
		},
		results,
		status: "previewed",
		summary: buildSummaryFromWorkload(workload),
	};

	if (renderer === "silent") return result;

	process.stdout.write(buildPreflight(preview, workload));

	const stepDelayMs = getPreviewStepDelayMs(renderer);
	const tasks = workload.languages.map((language) =>
		buildLanguageTask(preview, language, stepDelayMs),
	);
	const runnerOptions = {
		concurrent: getConcurrentJobs(preview),
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

	return result;
}
