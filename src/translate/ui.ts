import path from "node:path";
import cliProgress from "cli-progress";
import {
	Listr,
	type ListrBaseClassOptions,
	type ListrRendererValue,
	type ListrTask,
} from "listr2";

const PROGRESS_BAR_SIZE = 24;
const PREVIEW_BATCHES = 3;
const PREVIEW_STEP_DELAY_MS = 650;

interface TranslateUiPreviewOptions {
	readonly batchSize: number;
	readonly dryRun: boolean;
	readonly jobs: number;
	readonly languages: readonly string[];
	readonly maxCost?: number;
	readonly maxStringsPerJob?: number;
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

interface TranslateUiPlan {
	readonly config: TranslateConfigSnapshot;
	readonly preview: TranslateUiPreviewOptions;
}

export interface LanguagePreviewResult {
	readonly batches: number;
	readonly language: string;
	readonly outputFile: string;
	readonly strings: number;
	readonly translated: number;
}

export interface TranslateUiResult {
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
		readonly model: string;
		readonly outputDir: string;
		readonly potFilePath?: string;
		readonly provider: string;
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

/**
 * Build a stable progress bar string using cli-progress' formatter.
 */
function buildProgressBar(value: number, total: number): string {
	const progress = total > 0 ? Math.min(value / total, 1) : 0;

	return cliProgress.Format.BarFormat(progress, progressBarOptions);
}

/**
 * Keep the UI preview explicit while still showing a realistic batch shape.
 */
function getPreviewStringCount(preview: TranslateUiPreviewOptions): number {
	return preview.maxStringsPerJob ?? preview.batchSize * PREVIEW_BATCHES;
}

function getPreviewBatchCount(preview: TranslateUiPreviewOptions): number {
	return Math.max(
		1,
		Math.ceil(getPreviewStringCount(preview) / preview.batchSize),
	);
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

function formatLanguageTitle(
	preview: TranslateUiPreviewOptions,
	language: string,
	processed: number,
	total: number,
	batch: number,
	totalBatches: number,
): string {
	const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
	const costText =
		preview.maxCost === undefined
			? "cost tracking: preview"
			: `cost limit: ${formatCurrency(preview.maxCost)}`;
	const modeText = preview.dryRun ? "dry run" : "UI preview";

	return [
		`${language} ${buildProgressBar(processed, total)} ${percentage}% (${processed}/${total} strings)`,
		`source: ${preview.sourceLanguage} | batch ${batch}/${totalBatches} | ${modeText}`,
		`${costText} | output: ${getOutputFile(preview, language)}`,
	].join("\n");
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

function buildLanguageTask(
	preview: TranslateUiPreviewOptions,
	language: string,
	stepDelayMs: number,
): ListrTask {
	const totalStrings = getPreviewStringCount(preview);
	const totalBatches = getPreviewBatchCount(preview);

	return {
		title: formatLanguageTitle(
			preview,
			language,
			0,
			totalStrings,
			1,
			totalBatches,
		),
		task: async (_ctx, task): Promise<void> => {
			for (let batch = 1; batch <= totalBatches; batch += 1) {
				const processed = Math.min(
					batch * preview.batchSize,
					totalStrings,
				);
				task.title = formatLanguageTitle(
					preview,
					language,
					processed,
					totalStrings,
					batch,
					totalBatches,
				);
				if (stepDelayMs > 0) await delay(stepDelayMs);
			}

			task.title = `${language} ${buildProgressBar(totalStrings, totalStrings)} 100% (${totalStrings}/${totalStrings} strings) | preview complete, no translations written`;
		},
	};
}

function buildLanguageResult(
	preview: TranslateUiPreviewOptions,
	language: string,
): LanguagePreviewResult {
	return {
		batches: getPreviewBatchCount(preview),
		language,
		outputFile: getOutputFile(preview, language),
		strings: getPreviewStringCount(preview),
		translated: 0,
	};
}

function buildLanguageResults(
	preview: TranslateUiPreviewOptions,
): readonly LanguagePreviewResult[] {
	return preview.languages.map((language) =>
		buildLanguageResult(preview, language),
	);
}

function buildSummary(result: TranslateUiResult): string {
	if (result.status === "blocked") return result.summary;

	const languageCount = result.results.length;
	const stringCount = result.results.reduce(
		(total, language) => total + language.strings,
		0,
	);

	return `Previewed ${languageCount} language${languageCount === 1 ? "" : "s"} and ${stringCount} planned string${stringCount === 1 ? "" : "s"}. Translation logic is not implemented yet.`;
}

export async function runTranslateUiPreview(
	plan: TranslateUiPlan,
): Promise<TranslateUiResult> {
	const { config, preview } = plan;
	const baseResult = {
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
			model: config.model,
			outputDir: preview.outputDir,
			...(config.potFilePath !== undefined && {
				potFilePath: config.potFilePath,
			}),
			provider: config.provider,
			sourceLanguage: preview.sourceLanguage,
		},
	} as const;

	if (preview.languages.length === 0) {
		return {
			...baseResult,
			results: [],
			status: "blocked",
			summary:
				"No target languages are configured. Add --target-languages or set source.targetLanguages in Polypot config.",
		};
	}

	const renderer = getRenderer(preview);
	const results = buildLanguageResults(preview);
	if (renderer === "silent") {
		const result: TranslateUiResult = {
			...baseResult,
			results,
			status: "previewed",
			summary: "",
		};

		return {
			...result,
			summary: buildSummary(result),
		};
	}

	const stepDelayMs = getPreviewStepDelayMs(renderer);
	const tasks = preview.languages.map((language) =>
		buildLanguageTask(preview, language, stepDelayMs),
	);
	const runnerOptions = {
		concurrent: Math.max(
			1,
			Math.min(preview.jobs, preview.languages.length),
		),
		exitOnError: false,
		renderer,
		rendererOptions:
			renderer === "verbose"
				? { logTitleChange: true }
				: { collapseErrors: false, formatOutput: "wrap" },
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

	const result: TranslateUiResult = {
		...baseResult,
		results,
		status: "previewed",
		summary: "",
	};

	return {
		...result,
		summary: buildSummary(result),
	};
}
