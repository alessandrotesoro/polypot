import path from "node:path";
import cliProgress from "cli-progress";
import {
	Listr,
	type ListrBaseClassOptions,
	type ListrRendererValue,
	type ListrTask,
} from "listr2";
import {
	analyzePotFile,
	type PotAnalysis,
	type PotSourceString,
} from "./pot.js";

const PROGRESS_BAR_SIZE = 24;
const PREVIEW_STEP_DELAY_MS = 650;
const ESTIMATED_CHARS_PER_TOKEN = 4;
const ESTIMATED_OUTPUT_TOKEN_MULTIPLIER = 1.35;
const PREVIEW_COST_PER_1000_TOKENS = 0.002;

interface TranslateUiPreviewOptions {
	readonly batchSize: number;
	readonly dryRun: boolean;
	readonly jobs: number;
	readonly languages: readonly string[];
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
		readonly localeFormat: string;
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

interface TranslationEstimate {
	readonly cost: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
}

interface LanguageWorkPlan {
	readonly batches: number;
	readonly estimate: TranslationEstimate;
	readonly language: string;
	readonly outputFile: string;
	readonly plannedStrings: number;
	readonly skippedByCost: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
}

interface TranslatePreviewWorkload {
	readonly analysis: PotAnalysis;
	readonly batches: number;
	readonly estimate: TranslationEstimate;
	readonly languages: readonly LanguageWorkPlan[];
	readonly plannedStrings: number;
	readonly skippedByCost: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
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

function getOutputFile(
	preview: TranslateUiPreviewOptions,
	language: string,
): string {
	return path.join(
		preview.outputDir,
		`${preview.poFilePrefix ?? ""}${language}.po`,
	);
}

function formatCurrency(value: number): string {
	return `$${value.toFixed(4)}`;
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

function estimateSourceCharacters(
	sourceCharacters: number,
): TranslationEstimate {
	const inputTokens = Math.ceil(sourceCharacters / ESTIMATED_CHARS_PER_TOKEN);
	const outputTokens = Math.ceil(
		inputTokens * ESTIMATED_OUTPUT_TOKEN_MULTIPLIER,
	);
	const totalTokens = inputTokens + outputTokens;

	return {
		cost: (totalTokens / 1000) * PREVIEW_COST_PER_1000_TOKENS,
		inputTokens,
		outputTokens,
		totalTokens,
	};
}

function addEstimates(
	first: TranslationEstimate,
	second: TranslationEstimate,
): TranslationEstimate {
	return {
		cost: first.cost + second.cost,
		inputTokens: first.inputTokens + second.inputTokens,
		outputTokens: first.outputTokens + second.outputTokens,
		totalTokens: first.totalTokens + second.totalTokens,
	};
}

function buildPrefixCharacterTotals(
	sourceStrings: readonly PotSourceString[],
): readonly number[] {
	const totals = [0];
	for (const sourceString of sourceStrings) {
		totals.push((totals.at(-1) ?? 0) + sourceString.characters);
	}

	return totals;
}

function estimatePrefix(
	prefixCharacterTotals: readonly number[],
	count: number,
): TranslationEstimate {
	return estimateSourceCharacters(prefixCharacterTotals[count] ?? 0);
}

function selectStringCountWithinBudget(
	prefixCharacterTotals: readonly number[],
	maxCount: number,
	remainingCost: number,
): number {
	if (remainingCost <= 0) return 0;

	let low = 0;
	let high = maxCount;

	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		if (
			estimatePrefix(prefixCharacterTotals, middle).cost <= remainingCost
		) {
			low = middle;
		} else {
			high = middle - 1;
		}
	}

	return low;
}

function buildWorkload(
	preview: TranslateUiPreviewOptions,
	analysis: PotAnalysis,
): TranslatePreviewWorkload {
	let remainingStrings = preview.maxTotalStrings ?? Number.POSITIVE_INFINITY;
	let remainingCost = preview.maxCost ?? Number.POSITIVE_INFINITY;
	const prefixCharacterTotals = buildPrefixCharacterTotals(analysis.strings);
	const languages: LanguageWorkPlan[] = [];
	let totalBatches = 0;
	let totalEstimate: TranslationEstimate = {
		cost: 0,
		inputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
	};
	let totalPlannedStrings = 0;
	let totalSkippedByCost = 0;
	let totalSkippedByLimit = 0;

	for (const language of preview.languages) {
		const stringLimit = Math.min(
			analysis.totalStrings,
			preview.maxStringsPerJob ?? analysis.totalStrings,
			remainingStrings,
		);
		const plannedStrings =
			preview.maxCost === undefined
				? stringLimit
				: selectStringCountWithinBudget(
						prefixCharacterTotals,
						stringLimit,
						remainingCost,
					);
		const estimate = estimatePrefix(prefixCharacterTotals, plannedStrings);
		const batches =
			plannedStrings === 0
				? 0
				: Math.ceil(plannedStrings / preview.batchSize);
		const skippedByCost = stringLimit - plannedStrings;
		const skippedByLimit = analysis.totalStrings - stringLimit;

		remainingStrings -= plannedStrings;
		remainingCost -= estimate.cost;
		totalBatches += batches;
		totalEstimate = addEstimates(totalEstimate, estimate);
		totalPlannedStrings += plannedStrings;
		totalSkippedByCost += skippedByCost;
		totalSkippedByLimit += skippedByLimit;

		languages.push({
			batches,
			estimate,
			language,
			outputFile: getOutputFile(preview, language),
			plannedStrings,
			skippedByCost,
			skippedByLimit,
			sourceStrings: analysis.totalStrings,
		});
	}

	return {
		analysis,
		batches: totalBatches,
		estimate: totalEstimate,
		languages,
		plannedStrings: totalPlannedStrings,
		skippedByCost: totalSkippedByCost,
		skippedByLimit: totalSkippedByLimit,
		sourceStrings: analysis.totalStrings * preview.languages.length,
	};
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
	const modeText = preview.dryRun ? "dry run" : "preview";

	return [
		`${plan.language} ${buildProgressBar(processed, plan.plannedStrings)} ${percentage}% (${processed}/${plan.plannedStrings} strings)`,
		`phase: ${phase} | elapsed ${formatDuration(elapsedMs)} | eta ${formatDuration(etaMs)} | ${modeText}`,
		`tokens ~${plan.estimate.totalTokens} | cost ~${formatCurrency(plan.estimate.cost)} | skipped ${plan.skippedByLimit + plan.skippedByCost}`,
		`limits: ${formatLimits(preview)} | output: ${plan.outputFile}`,
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
				? `${plan.language} skipped: no strings selected after limits`
				: `${plan.language} queued (${plan.plannedStrings}/${plan.sourceStrings} strings planned)`,
		task: async (_ctx, task): Promise<void> => {
			if (plan.plannedStrings === 0) {
				task.title = `${plan.language} skipped: ${plan.skippedByLimit} by limits, ${plan.skippedByCost} by cost`;
				return;
			}

			const startedAt = Date.now();
			task.title = formatLanguageTitle(
				preview,
				plan,
				0,
				"preparing batches",
				startedAt,
			);
			if (stepDelayMs > 0) await delay(stepDelayMs);

			for (let batch = 1; batch <= plan.batches; batch += 1) {
				const processed = Math.min(
					batch * preview.batchSize,
					plan.plannedStrings,
				);
				task.title = formatLanguageTitle(
					preview,
					plan,
					processed,
					`batch ${batch}/${plan.batches}`,
					startedAt,
				);
				if (stepDelayMs > 0) await delay(stepDelayMs);
			}

			task.title = formatLanguageTitle(
				preview,
				plan,
				plan.plannedStrings,
				"validating planned output",
				startedAt,
			);
			if (stepDelayMs > 0) await delay(stepDelayMs);
			task.title = `${plan.language} ${buildProgressBar(plan.plannedStrings, plan.plannedStrings)} 100% (${plan.plannedStrings}/${plan.plannedStrings} strings) | preview complete, no translations written`;
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
		"Translate preview",
		`Source: ${analysis.filePath} (${analysis.totalStrings} strings, ${analysis.pluralStrings} plural, ${analysis.contextStrings} with context, ${analysis.fuzzyStrings} fuzzy)`,
		`Targets: ${preview.languages.join(", ")} | Jobs: ${getConcurrentJobs(preview)} | Batch size: ${preview.batchSize}`,
		`Plan: ${workload.plannedStrings}/${workload.sourceStrings} strings, ${workload.batches} batches | Limits: ${formatLimits(preview)}`,
		`Estimate: ~${workload.estimate.totalTokens} tokens, ~${formatCurrency(workload.estimate.cost)} | No API calls or .po files will be written.`,
		"",
	].join("\n");
}

function buildSummaryFromWorkload(workload: TranslatePreviewWorkload): string {
	const languageLines = workload.languages.map(
		(language) =>
			`- ${language.language}: ${language.plannedStrings}/${language.sourceStrings} strings, ${language.batches} batches, ~${language.estimate.totalTokens} tokens, ~${formatCurrency(language.estimate.cost)}, output ${language.outputFile}`,
	);

	return [
		"Preview complete. No translations were generated.",
		`Languages: ${workload.languages.length} | Source strings: ${workload.analysis.totalStrings} | Planned work: ${workload.plannedStrings}/${workload.sourceStrings} strings`,
		`Skipped: ${workload.skippedByLimit} by string limits, ${workload.skippedByCost} by cost budget`,
		`Batches: ${workload.batches} | Estimated tokens: ~${workload.estimate.totalTokens} | Estimated cost: ~${formatCurrency(workload.estimate.cost)}`,
		"Planned outputs:",
		...languageLines,
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
		return {
			...baseResult,
			results: [],
			status: "blocked",
			summary:
				"No target languages are configured. Add --target-languages or set source.targetLanguages in Polypot config.",
		};
	}

	if (config.potFilePath === undefined) {
		return {
			...baseResult,
			results: [],
			status: "blocked",
			summary:
				"No POT file path is configured. Add --pot-file-path or set source.potFilePath in Polypot config.",
		};
	}

	const renderer = getRenderer(preview);
	const analysis = await analyzePotFile(config.potFilePath);
	const workload = buildWorkload(preview, analysis);
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
