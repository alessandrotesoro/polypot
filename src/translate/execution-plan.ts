import path from "node:path";
import type { PolypotSecrets } from "../config/secrets.js";
import {
	calculateOpenAICost,
	estimateCompletionTokens,
	type OpenAICost,
} from "../providers/openai/pricing.js";
import { buildTranslationBatchPlan } from "./batches.js";
import { knownTranslationEstimate } from "./cost.js";
import { getBaseLanguage } from "./locales.js";
import {
	type ExistingPoMergeSource,
	planExistingPoMergeSources,
	readExistingPoMergeSource,
} from "./merge-policy.js";
import {
	createPoOutputDocument,
	getEntriesWithTranslations,
	mergeExistingPoData,
} from "./po-writer.js";
import type { PotDocument } from "./pot.js";
import { readPotDocument } from "./pot.js";
import {
	buildTranslateOutputFile,
	buildTranslateWorkload,
	type LocaleFormat,
	type TranslatePreviewWorkload,
	type TranslationEstimate,
} from "./workload.js";

const ESTIMATED_CHARS_PER_TOKEN = 4;

export type { TranslationEstimate } from "./workload.js";

export interface TranslateUiPreviewOptions {
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

export interface TranslateConfigSnapshot {
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
		readonly debugOutputFile?: string;
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

export interface TranslateInputPlan {
	readonly config: TranslateConfigSnapshot;
	readonly preview: TranslateUiPreviewOptions;
	readonly secrets: PolypotSecrets;
	readonly settings: TranslateSettingsSnapshot;
}

export type TranslatePlanBlockerCode =
	| "cost_estimator_unavailable"
	| "duplicate_output_file"
	| "input_po_path_ambiguous"
	| "missing_pot_file_path"
	| "missing_target_languages"
	| "output_path_collision"
	| "pot_analysis_failed"
	| "unsupported_provider";

export interface TranslatePlanBlocker {
	readonly code: TranslatePlanBlockerCode;
	readonly collisions?: readonly TranslatePathCollision[];
	readonly message: string;
	readonly potFilePath?: string;
	readonly suppressOutputFile?: boolean;
}

export interface TranslatePathCollision {
	readonly path: string;
	readonly reservations: readonly string[];
}

export interface TranslateExecutionPlan extends TranslateInputPlan {
	readonly document: PotDocument;
	readonly mergeSources: ReadonlyMap<string, ExistingPoMergeSource>;
	readonly outputFiles: ReadonlyMap<string, string>;
	readonly workload: TranslatePreviewWorkload;
}

export type TranslateExecutionPlanResult =
	| { readonly ok: true; readonly plan: TranslateExecutionPlan }
	| {
			readonly blocker: TranslatePlanBlocker;
			readonly input: TranslateInputPlan;
			readonly ok: false;
	  };

interface WriteReservation {
	readonly id: string;
	readonly path: string;
}

function formatCollisionPath(filePath: string): string {
	return path.resolve(filePath);
}

function outputFileForLanguage(
	preview: TranslateUiPreviewOptions,
	language: string,
): string {
	return buildTranslateOutputFile(
		{
			localeFormat: preview.localeFormat,
			outputDir: preview.outputDir,
			...(preview.poFilePrefix !== undefined && {
				poFilePrefix: preview.poFilePrefix,
			}),
		},
		language,
	);
}

function buildOutputFiles(
	preview: TranslateUiPreviewOptions,
): ReadonlyMap<string, string> {
	return new Map(
		preview.languages.map((language) => [
			language,
			outputFileForLanguage(preview, language),
		]),
	);
}

function duplicatePoOutputBlocker(
	outputFiles: ReadonlyMap<string, string>,
): TranslatePlanBlocker | undefined {
	const languagesByFile = new Map<string, string[]>();

	for (const [language, outputFile] of outputFiles) {
		const normalized = formatCollisionPath(outputFile);
		languagesByFile.set(normalized, [
			...(languagesByFile.get(normalized) ?? []),
			language,
		]);
	}

	for (const [file, languages] of languagesByFile) {
		if (languages.length <= 1) continue;
		return {
			code: "duplicate_output_file",
			collisions: [
				{
					path: file,
					reservations: languages.map((language) => `po:${language}`),
				},
			],
			message: `Multiple target languages resolve to the same output file ${file}: ${languages.join(", ")}. Use a locale format that keeps them distinct.`,
		};
	}

	return undefined;
}

function findWriteCollisions(
	reservations: readonly WriteReservation[],
): readonly TranslatePathCollision[] {
	const reservationsByPath = new Map<string, string[]>();

	for (const reservation of reservations) {
		const normalized = formatCollisionPath(reservation.path);
		reservationsByPath.set(normalized, [
			...(reservationsByPath.get(normalized) ?? []),
			reservation.id,
		]);
	}

	return [...reservationsByPath]
		.filter(([, ids]) => ids.length > 1)
		.map(([filePath, ids]) => ({
			path: filePath,
			reservations: ids,
		}));
}

function findProtectedReadCollisions(options: {
	readonly protectedReads: readonly WriteReservation[];
	readonly writes: readonly WriteReservation[];
}): readonly TranslatePathCollision[] {
	const readsByPath = new Map(
		options.protectedReads.map((read) => [
			formatCollisionPath(read.path),
			read.id,
		]),
	);

	return options.writes.flatMap((write) => {
		const normalized = formatCollisionPath(write.path);
		const read = readsByPath.get(normalized);
		return read === undefined
			? []
			: [
					{
						path: normalized,
						reservations: [write.id, read],
					},
				];
	});
}

function outputFileIsColliding(options: {
	readonly collisions: readonly TranslatePathCollision[];
	readonly outputFile?: string;
}): boolean {
	if (options.outputFile === undefined) return false;
	const normalized = formatCollisionPath(options.outputFile);
	return options.collisions.some(
		(collision) => collision.path === normalized,
	);
}

function buildPathCollisionBlocker(options: {
	readonly collisions: readonly TranslatePathCollision[];
	readonly outputFile?: string;
}): TranslatePlanBlocker | undefined {
	if (options.collisions.length === 0) return undefined;

	return {
		code: "output_path_collision",
		collisions: options.collisions,
		message: `Translate output paths collide: ${options.collisions
			.map(
				(collision) =>
					`${collision.path} (${collision.reservations.join(", ")})`,
			)
			.join("; ")}.`,
		suppressOutputFile: outputFileIsColliding(options),
	};
}

function buildWriteReservations(options: {
	readonly outputFiles: ReadonlyMap<string, string>;
	readonly settings: TranslateSettingsSnapshot;
}): readonly WriteReservation[] {
	return [
		...[...options.outputFiles].map(([language, outputFile]) => ({
			id: `po:${language}`,
			path: outputFile,
		})),
		...(options.settings.output.outputFile === undefined
			? []
			: [
					{
						id: "json_output",
						path: options.settings.output.outputFile,
					},
				]),
		...(options.settings.debug.debugOutputFile === undefined
			? []
			: [
					{
						id: "debug_output",
						path: options.settings.debug.debugOutputFile,
					},
				]),
	];
}

function buildProtectedReads(
	settings: TranslateSettingsSnapshot,
): readonly WriteReservation[] {
	return [
		...(settings.source.potFilePath === undefined
			? []
			: [{ id: "pot_input", path: settings.source.potFilePath }]),
		...(settings.source.inputPoPath === undefined
			? []
			: [{ id: "input_po", path: settings.source.inputPoPath }]),
	];
}

function targetNeedsProvider(
	input: TranslateInputPlan,
	language: string,
): boolean {
	return (
		getBaseLanguage(input.preview.sourceLanguage) !==
		getBaseLanguage(language)
	);
}

async function buildMergedBatchPlan(options: {
	readonly document: PotDocument;
	readonly input: TranslateInputPlan;
	readonly language: string;
	readonly maxStrings?: number;
	readonly mergeSource: ExistingPoMergeSource;
}) {
	const outputDocument = await createPoOutputDocument({
		document: options.document,
		targetLanguage: options.language,
	});
	let output = outputDocument.data;

	try {
		const existing = await readExistingPoMergeSource(options.mergeSource);
		if (existing !== undefined) {
			output = mergeExistingPoData({
				entries: options.document.entries,
				existing: existing.data,
				output,
				pluralCount: outputDocument.pluralCount,
			}).output;
		}
	} catch {
		// Merge failures are language-level execution failures. Do not turn
		// them into provider preflight blockers.
		return undefined;
	}

	return buildTranslationBatchPlan(
		getEntriesWithTranslations(options.document.entries, output),
		{
			batchSize: options.input.preview.batchSize,
			forceTranslate: options.input.config.forceTranslate,
			...(options.maxStrings !== undefined && {
				maxStrings: options.maxStrings,
			}),
		},
	);
}

async function hasPlannedProviderWork(options: {
	readonly document: PotDocument;
	readonly input: TranslateInputPlan;
	readonly mergeSources: ReadonlyMap<string, ExistingPoMergeSource>;
}): Promise<boolean> {
	let remainingStrings =
		options.input.preview.maxTotalStrings ?? Number.POSITIVE_INFINITY;

	for (const language of options.input.preview.languages) {
		const maxStrings = Math.min(
			remainingStrings,
			options.input.preview.maxStringsPerJob ?? Number.POSITIVE_INFINITY,
		);
		const batchPlan = await buildMergedBatchPlan({
			document: options.document,
			input: options.input,
			language,
			mergeSource: options.mergeSources.get(language) ?? {
				kind: "none",
			},
			...(Number.isFinite(maxStrings) && {
				maxStrings: Math.trunc(maxStrings),
			}),
		});
		if (batchPlan === undefined) continue;
		if (
			targetNeedsProvider(options.input, language) &&
			batchPlan.plannedStrings > 0
		) {
			return true;
		}
		remainingStrings -= batchPlan.plannedStrings;
	}

	return false;
}

function buildOpenAIEstimator(model: string) {
	return (sourceCharacters: number): TranslationEstimate => {
		const inputTokens = Math.ceil(
			sourceCharacters / ESTIMATED_CHARS_PER_TOKEN,
		);
		const outputTokens = estimateCompletionTokens(inputTokens);
		const cost: OpenAICost = calculateOpenAICost({
			completionTokens: outputTokens,
			model,
			promptTokens: inputTokens,
		});

		return knownTranslationEstimate({
			cost: cost.totalCost,
			inputTokens,
			outputTokens,
		});
	};
}

async function readPlannedPotDocument(
	input: TranslateInputPlan,
): Promise<TranslateExecutionPlanResult | PotDocument> {
	if (input.config.potFilePath === undefined) {
		return {
			blocker: {
				code: "missing_pot_file_path",
				message:
					"No POT file path is configured. Add --pot-file-path or set source.potFilePath in Polypot config.",
			},
			input,
			ok: false,
		};
	}

	try {
		return await readPotDocument(input.config.potFilePath);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			blocker: {
				code: "pot_analysis_failed",
				message,
				potFilePath: input.config.potFilePath,
			},
			input,
			ok: false,
		};
	}
}

export async function buildTranslateExecutionPlan(
	input: TranslateInputPlan,
): Promise<TranslateExecutionPlanResult> {
	if (input.preview.languages.length === 0) {
		return {
			blocker: {
				code: "missing_target_languages",
				message:
					"No target languages are configured. Add --target-languages or set source.targetLanguages in Polypot config.",
			},
			input,
			ok: false,
		};
	}

	const outputFiles = buildOutputFiles(input.preview);
	const duplicateBlocker = duplicatePoOutputBlocker(outputFiles);
	if (duplicateBlocker !== undefined) {
		return { blocker: duplicateBlocker, input, ok: false };
	}

	const writes = buildWriteReservations({
		outputFiles,
		settings: input.settings,
	});
	const pathCollisionBlocker = buildPathCollisionBlocker({
		collisions: [
			...findWriteCollisions(writes),
			...findProtectedReadCollisions({
				protectedReads: buildProtectedReads(input.settings),
				writes,
			}),
		],
		...(input.settings.output.outputFile !== undefined && {
			outputFile: input.settings.output.outputFile,
		}),
	});
	if (pathCollisionBlocker !== undefined) {
		return { blocker: pathCollisionBlocker, input, ok: false };
	}

	const mergePlan = planExistingPoMergeSources({
		forceTranslate: input.config.forceTranslate,
		...(input.settings.source.inputPoPath !== undefined && {
			inputPoPath: input.settings.source.inputPoPath,
		}),
		outputFiles,
		targetLanguages: input.preview.languages,
	});
	if (!mergePlan.ok) {
		return {
			blocker: {
				code: "input_po_path_ambiguous",
				message: mergePlan.error,
			},
			input,
			ok: false,
		};
	}

	const document = await readPlannedPotDocument(input);
	if ("ok" in document) return document;
	const estimateCost =
		input.config.provider === "openai"
			? buildOpenAIEstimator(input.config.model)
			: undefined;
	const workload = buildTranslateWorkload(
		{
			...input.preview,
			...(estimateCost !== undefined && { estimateCost }),
		},
		document.analysis,
	);
	const mergeSources = new Map(
		mergePlan.sources.map((source) => [source.language, source.source]),
	);
	const providerWorkPlanned =
		input.config.provider !== "openai"
			? await hasPlannedProviderWork({
					document,
					input,
					mergeSources,
				})
			: false;
	if (
		input.config.provider !== "openai" &&
		input.preview.dryRun &&
		input.preview.maxCost !== undefined &&
		providerWorkPlanned
	) {
		return {
			blocker: {
				code: "cost_estimator_unavailable",
				message: `Provider ${input.config.provider} does not have a cost estimator, so --max-cost cannot be enforced for dry-run planning.`,
			},
			input,
			ok: false,
		};
	}
	if (
		input.config.provider !== "openai" &&
		!input.preview.dryRun &&
		providerWorkPlanned
	) {
		return {
			blocker: {
				code: "unsupported_provider",
				message: `Provider ${input.config.provider} is not supported by translate yet. Use --provider openai.`,
			},
			input,
			ok: false,
		};
	}

	return {
		ok: true,
		plan: {
			...input,
			document,
			mergeSources,
			outputFiles,
			workload,
		},
	};
}
