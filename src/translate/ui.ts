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

interface TranslateUiPlan {
	readonly batchSize: number;
	readonly dryRun: boolean;
	readonly forceTranslate: boolean;
	readonly jobs: number;
	readonly languages: readonly string[];
	readonly maxCost?: number;
	readonly maxStringsPerJob?: number;
	readonly model: string;
	readonly outputDir: string;
	readonly outputFormat: string;
	readonly outputFile?: string;
	readonly poFilePrefix?: string;
	readonly potFilePath?: string;
	readonly provider: string;
	readonly sourceLanguage: string;
	readonly verboseLevel: number;
}

interface LanguagePreviewResult {
	readonly batches: number;
	readonly language: string;
	readonly outputFile: string;
	readonly strings: number;
	readonly translated: number;
}

interface TranslateUiContext {
	results: LanguagePreviewResult[];
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
function getPreviewStringCount(plan: TranslateUiPlan): number {
	return plan.maxStringsPerJob ?? plan.batchSize * PREVIEW_BATCHES;
}

function getPreviewBatchCount(plan: TranslateUiPlan): number {
	return Math.max(1, Math.ceil(getPreviewStringCount(plan) / plan.batchSize));
}

function getOutputFile(plan: TranslateUiPlan, language: string): string {
	return path.join(
		plan.outputDir,
		`${plan.poFilePrefix ?? ""}${language}.po`,
	);
}

function formatCurrency(value: number): string {
	return `$${value.toFixed(4)}`;
}

function formatLanguageTitle(
	plan: TranslateUiPlan,
	language: string,
	processed: number,
	total: number,
	batch: number,
	totalBatches: number,
): string {
	const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
	const costText =
		plan.maxCost === undefined
			? "cost tracking: preview"
			: `cost limit: ${formatCurrency(plan.maxCost)}`;
	const modeText = plan.dryRun ? "dry run" : "UI preview";

	return [
		`${language} ${buildProgressBar(processed, total)} ${percentage}% (${processed}/${total} strings)`,
		`source: ${plan.sourceLanguage} | batch ${batch}/${totalBatches} | ${modeText}`,
		`${costText} | output: ${getOutputFile(plan, language)}`,
	].join("\n");
}

function getRenderer(plan: TranslateUiPlan): ListrRendererValue {
	if (plan.outputFormat === "json") return "silent";
	if (plan.verboseLevel === 0) return "silent";

	return process.stdout.isTTY ? "default" : "verbose";
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function buildLanguageTask(
	plan: TranslateUiPlan,
	language: string,
): ListrTask<TranslateUiContext> {
	const totalStrings = getPreviewStringCount(plan);
	const totalBatches = getPreviewBatchCount(plan);

	return {
		title: formatLanguageTitle(
			plan,
			language,
			0,
			totalStrings,
			1,
			totalBatches,
		),
		task: async (ctx, task): Promise<void> => {
			for (let batch = 1; batch <= totalBatches; batch += 1) {
				const processed = Math.min(
					batch * plan.batchSize,
					totalStrings,
				);
				task.title = formatLanguageTitle(
					plan,
					language,
					processed,
					totalStrings,
					batch,
					totalBatches,
				);
				await delay(PREVIEW_STEP_DELAY_MS);
			}

			ctx.results.push({
				batches: totalBatches,
				language,
				outputFile: getOutputFile(plan, language),
				strings: totalStrings,
				translated: 0,
			});
			task.title = `${language} ${buildProgressBar(totalStrings, totalStrings)} 100% (${totalStrings}/${totalStrings} strings) | preview complete, no translations written`;
		},
	};
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
	const baseResult = {
		implemented: false,
		mode: "ui-preview",
		plan: {
			batchSize: plan.batchSize,
			dryRun: plan.dryRun,
			forceTranslate: plan.forceTranslate,
			jobs: plan.jobs,
			languages: plan.languages,
			...(plan.maxCost !== undefined && { maxCost: plan.maxCost }),
			...(plan.maxStringsPerJob !== undefined && {
				maxStringsPerJob: plan.maxStringsPerJob,
			}),
			model: plan.model,
			outputDir: plan.outputDir,
			...(plan.potFilePath !== undefined && {
				potFilePath: plan.potFilePath,
			}),
			provider: plan.provider,
			sourceLanguage: plan.sourceLanguage,
		},
	} as const;

	if (plan.languages.length === 0) {
		return {
			...baseResult,
			results: [],
			status: "blocked",
			summary:
				"No target languages are configured. Add --target-languages or set source.targetLanguages in Polypot config.",
		};
	}

	const context: TranslateUiContext = { results: [] };
	const tasks = plan.languages.map((language) =>
		buildLanguageTask(plan, language),
	);
	const renderer = getRenderer(plan);
	const runnerOptions = {
		concurrent: Math.max(1, Math.min(plan.jobs, plan.languages.length)),
		exitOnError: false,
		renderer,
		rendererOptions:
			renderer === "verbose"
				? { logTitleChange: true }
				: { collapseErrors: false, formatOutput: "wrap" },
	} satisfies ListrBaseClassOptions<
		TranslateUiContext,
		ListrRendererValue,
		ListrRendererValue
	>;
	const runner = new Listr<
		TranslateUiContext,
		ListrRendererValue,
		ListrRendererValue
	>(tasks, runnerOptions);

	await runner.run(context);

	const result: TranslateUiResult = {
		...baseResult,
		results: context.results,
		status: "previewed",
		summary: "",
	};

	return {
		...result,
		summary: buildSummary(result),
	};
}
