import path from "node:path";
import type { PotAnalysis, PotSourceString } from "./pot.js";

const ESTIMATED_CHARS_PER_TOKEN = 4;
const ESTIMATED_OUTPUT_TOKEN_MULTIPLIER = 1.35;
const PREVIEW_COST_PER_1000_TOKENS = 0.002;

export interface TranslateWorkloadOptions {
	readonly batchSize: number;
	readonly languages: readonly string[];
	readonly maxCost?: number;
	readonly maxStringsPerJob?: number;
	readonly maxTotalStrings?: number;
	readonly outputDir: string;
	readonly poFilePrefix?: string;
}

export interface TranslationEstimate {
	readonly cost: number;
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
}

export interface LanguageWorkPlan {
	readonly batches: number;
	readonly estimate: TranslationEstimate;
	readonly language: string;
	readonly outputFile: string;
	readonly plannedStrings: number;
	readonly skippedByCost: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
}

export interface TranslatePreviewWorkload {
	readonly analysis: PotAnalysis;
	readonly batches: number;
	readonly estimate: TranslationEstimate;
	readonly languages: readonly LanguageWorkPlan[];
	readonly plannedStrings: number;
	readonly skippedByCost: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
}

function getOutputFile(
	options: TranslateWorkloadOptions,
	language: string,
): string {
	return path.join(
		options.outputDir,
		`${options.poFilePrefix ?? ""}${language}.po`,
	);
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

export function buildTranslateWorkload(
	options: TranslateWorkloadOptions,
	analysis: PotAnalysis,
): TranslatePreviewWorkload {
	let remainingStrings = options.maxTotalStrings ?? Number.POSITIVE_INFINITY;
	let remainingCost = options.maxCost ?? Number.POSITIVE_INFINITY;
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

	for (const language of options.languages) {
		const stringLimit = Math.min(
			analysis.totalStrings,
			options.maxStringsPerJob ?? analysis.totalStrings,
			remainingStrings,
		);
		const plannedStrings =
			options.maxCost === undefined
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
				: Math.ceil(plannedStrings / options.batchSize);
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
			outputFile: getOutputFile(options, language),
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
		sourceStrings: analysis.totalStrings * options.languages.length,
	};
}
