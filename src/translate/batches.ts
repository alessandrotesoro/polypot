import { entryNeedsTranslation, type PotEntry } from "./pot.js";

export interface TranslationBatch {
	readonly entries: readonly PotEntry[];
	readonly number: number;
}

export interface TranslationBatchPlan {
	readonly batches: readonly TranslationBatch[];
	readonly plannedCharacters: number;
	readonly plannedStrings: number;
	readonly skippedByExisting: number;
	readonly skippedByLimit: number;
	readonly sourceStrings: number;
}

export interface BuildTranslationBatchPlanOptions {
	readonly batchSize: number;
	readonly forceTranslate?: boolean;
	readonly maxStrings?: number;
}

function sumCharacters(entries: readonly PotEntry[]): number {
	return entries.reduce((total, entry) => total + entry.characters, 0);
}

function selectEntries(
	entries: readonly PotEntry[],
	options: BuildTranslationBatchPlanOptions,
): {
	readonly selected: readonly PotEntry[];
	readonly skippedByExisting: number;
	readonly skippedByLimit: number;
} {
	const eligible =
		options.forceTranslate === true
			? entries
			: entries.filter(entryNeedsTranslation);
	const limit = options.maxStrings ?? eligible.length;
	const selected = eligible.slice(0, limit);

	return {
		selected,
		skippedByExisting: entries.length - eligible.length,
		skippedByLimit: eligible.length - selected.length,
	};
}

function buildBatches(
	entries: readonly PotEntry[],
	batchSize: number,
): readonly TranslationBatch[] {
	const batches: TranslationBatch[] = [];

	for (let index = 0; index < entries.length; index += batchSize) {
		batches.push({
			entries: entries.slice(index, index + batchSize),
			number: batches.length + 1,
		});
	}

	return batches;
}

export function buildTranslationBatchPlan(
	entries: readonly PotEntry[],
	options: BuildTranslationBatchPlanOptions,
): TranslationBatchPlan {
	const { selected, skippedByExisting, skippedByLimit } = selectEntries(
		entries,
		options,
	);

	return {
		batches: buildBatches(selected, options.batchSize),
		plannedCharacters: sumCharacters(selected),
		plannedStrings: selected.length,
		skippedByExisting,
		skippedByLimit,
		sourceStrings: entries.length,
	};
}
