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

export type TranslationLanguageState =
	| "completed"
	| "dry_run"
	| "execution_failed"
	| "merge_failed"
	| "no_work"
	| "not_started"
	| "partial_success"
	| "provider_failed"
	| "validation_failed";

export interface TranslationLanguageResult {
	readonly batches: number;
	readonly debug?: readonly TranslationBatchDebug[];
	readonly failed: number;
	readonly language: string;
	readonly mergedFromExisting: number;
	readonly outputFile: string;
	readonly plannedStrings: number;
	readonly skippedByExisting: number;
	readonly skippedByLimit: number;
	readonly skipReason?: "abort-on-failure";
	readonly sourceStrings: number;
	readonly state: TranslationLanguageState;
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
	readonly skippedByExisting: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
	readonly translated: number;
}

export interface TranslationRunResult {
	readonly analysis: PotAnalysis;
	readonly results: readonly TranslationLanguageResult[];
	readonly status: TranslationRunStatus;
	readonly summary: string;
	readonly totals: TranslationRunTotals;
	readonly validation: TranslationValidationStats;
}
