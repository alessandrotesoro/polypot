import type { OpenAICost } from "../providers/openai/pricing.js";
import type { PotAnalysis } from "./pot.js";
import type { TranslationValidationStats } from "./validation.js";

export type TranslationRunStatus =
	| "blocked"
	| "completed"
	| "dry-run"
	| "failed"
	| "partial";

export type TranslationLanguageStatus =
	| "completed"
	| "dry-run"
	| "failed"
	| "skipped";

export interface TranslationLanguageResult {
	readonly batches: number;
	readonly cost: OpenAICost;
	readonly debug?: readonly TranslationBatchDebug[];
	readonly failed: number;
	readonly language: string;
	readonly mergedFromExisting: number;
	readonly outputFile: string;
	readonly plannedStrings: number;
	readonly skippedByExisting: number;
	readonly skippedByCost: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
	readonly status: TranslationLanguageStatus;
	readonly translated: number;
	readonly validation: TranslationValidationStats;
	readonly warning?: string;
	readonly error?: string;
}

export interface TranslationBatchDebug {
	readonly batch: number;
	readonly messages: readonly unknown[];
	readonly response?: string;
	readonly targetLanguage: string;
}

export interface TranslationRunTotals {
	readonly failed: number;
	readonly plannedStrings: number;
	readonly skippedByCost: number;
	readonly skippedByExisting: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
	readonly translated: number;
}

export interface TranslationRunResult {
	readonly analysis: PotAnalysis;
	readonly cost: OpenAICost;
	readonly results: readonly TranslationLanguageResult[];
	readonly status: TranslationRunStatus;
	readonly summary: string;
	readonly totals: TranslationRunTotals;
	readonly validation: TranslationValidationStats;
}
