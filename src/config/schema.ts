/**
 * API keys stay out of this schema. They flow through env vars, not YAML,
 * so serialized config cannot contain them.
 */
import { z } from "zod";
import {
	isSafeLanguageValue,
	LANGUAGE_VALUE_ERROR,
} from "../language-values.js";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
export const DEFAULT_SOURCE_LANGUAGE = "en_US";

const ProviderConfig = z.object({
	provider: z.string().default("openai"),
	model: z.string().default(DEFAULT_OPENAI_MODEL),
	temperature: z.number().default(0.7),
	maxTokens: z.number().int().optional(),
});

const SourceConfig = z.object({
	sourceLanguage: z.string().default(DEFAULT_SOURCE_LANGUAGE),
	targetLanguages: z
		.array(z.string().refine(isSafeLanguageValue, LANGUAGE_VALUE_ERROR))
		.refine(
			(values) => new Set(values).size === values.length,
			"Target languages cannot contain duplicate values.",
		)
		.default([]),
	potFilePath: z.string().optional(),
	inputPoPath: z.string().optional(),
});

const OutputConfig = z.object({
	outputDir: z.string().default("."),
	outputFormat: z.string().default("console"),
	outputFile: z.string().optional(),
	poFilePrefix: z.string().optional(),
	localeFormat: z
		.enum(["wp_locale", "iso_639_1", "iso_639_2", "target_lang"])
		.default("target_lang"),
});

const BehaviorConfig = z.object({
	forceTranslate: z.boolean().default(false),
	useDictionary: z.boolean().default(false),
	dictionaryPath: z.string().default("./config/dictionaries"),
	promptFilePath: z.string().default("./config/prompt.md"),
	poHeaderTemplatePath: z.string().default("./config/po-header.json"),
});

const PerformanceConfig = z.object({
	batchSize: z.number().int().min(1).max(100).default(20),
	jobs: z.number().int().min(1).max(10).default(2),
	timeout: z.number().int().min(10).max(300).default(60),
});

const LimitsConfig = z.object({
	maxStringsPerJob: z.number().int().min(1).optional(),
	maxTotalStrings: z.number().int().min(1).optional(),
	maxCost: z.number().min(0).optional(),
});

const RetriesConfig = z.object({
	maxRetries: z.number().int().min(0).max(10).default(3),
	retryDelay: z.number().int().min(500).max(30000).default(2000),
	abortOnFailure: z.boolean().default(false),
	skipLanguageOnFailure: z.boolean().default(false),
});

const DebugConfig = z.object({
	verboseLevel: z.number().int().default(1),
	dryRun: z.boolean().default(false),
	saveDebugInfo: z.boolean().default(false),
});

export const PolypotConfigSchema = z
	.object({
		provider: ProviderConfig.prefault({}),
		source: SourceConfig.prefault({}),
		output: OutputConfig.prefault({}),
		behavior: BehaviorConfig.prefault({}),
		performance: PerformanceConfig.prefault({}),
		limits: LimitsConfig.prefault({}),
		retries: RetriesConfig.prefault({}),
		debug: DebugConfig.prefault({}),
	})
	.prefault({});

export type PolypotConfig = z.infer<typeof PolypotConfigSchema>;
export type PolypotConfigInput = z.input<typeof PolypotConfigSchema>;
