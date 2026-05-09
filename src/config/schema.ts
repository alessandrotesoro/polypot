// Polypot config schema (Phase 1: structural-only).
//
// Defines the SHAPE of polypot configuration with default values. Ships
// without value-range or enum constraints (.min/.max/.options) — those are
// behavioural validation and belong in Phase 2 alongside the consuming logic.
// Documented Potomatic ranges are kept inline so Phase 2 has a single source.
//
// SECURITY BOUNDARY (Phase 2 obligation): API keys are deliberately NOT in
// this schema. They flow only through env vars, never through YAML, and
// Phase 2 must continue to keep them out of any config object that gets
// serialised to stdout/logs.
import {z} from 'zod'

const ProviderConfig = z.object({
  provider: z.string().default('openai'),
  model: z.string().default('gpt-4.1-mini'),
  /** Potomatic range: 0.0–2.0. */
  temperature: z.number().default(0.7),
  /** Potomatic range: 1–32768 (auto-calculated when omitted). */
  maxTokens: z.number().int().optional(),
})

const SourceConfig = z.object({
  sourceLanguage: z.string().default('en'),
  targetLanguages: z.array(z.string()).default([]),
  potFilePath: z.string().optional(),
  inputPoPath: z.string().optional(),
})

const OutputConfig = z.object({
  outputDir: z.string().default('.'),
  outputFormat: z.string().default('console'),
  outputFile: z.string().optional(),
  poFilePrefix: z.string().optional(),
  localeFormat: z.string().default('target_lang'),
})

const BehaviorConfig = z.object({
  forceTranslate: z.boolean().default(false),
  useDictionary: z.boolean().default(false),
  dictionaryPath: z.string().default('./config/dictionaries'),
  promptFilePath: z.string().default('./config/prompt.md'),
  poHeaderTemplatePath: z.string().default('./config/po-header.json'),
})

const PerformanceConfig = z.object({
  /** Potomatic range: 1–100. */
  batchSize: z.number().int().default(20),
  /** Potomatic range: 1–10. */
  jobs: z.number().int().default(2),
  /** Potomatic range: 10–300. */
  timeout: z.number().int().default(60),
})

const LimitsConfig = z.object({
  maxStringsPerJob: z.number().int().optional(),
  maxTotalStrings: z.number().int().optional(),
  maxCost: z.number().optional(),
})

const RetriesConfig = z.object({
  /** Potomatic range: 0–10. */
  maxRetries: z.number().int().default(3),
  /** Potomatic range: 500–30000. */
  retryDelay: z.number().int().default(2000),
  abortOnFailure: z.boolean().default(false),
  skipLanguageOnFailure: z.boolean().default(false),
})

const DebugConfig = z.object({
  /** Potomatic range: 0=errors, 1=normal, 2=verbose, 3=debug. */
  verboseLevel: z.number().int().default(1),
  dryRun: z.boolean().default(false),
  saveDebugInfo: z.boolean().default(false),
})

export const PolypotConfigSchema = z.object({
  provider: ProviderConfig.prefault({}),
  source: SourceConfig.prefault({}),
  output: OutputConfig.prefault({}),
  behavior: BehaviorConfig.prefault({}),
  performance: PerformanceConfig.prefault({}),
  limits: LimitsConfig.prefault({}),
  retries: RetriesConfig.prefault({}),
  debug: DebugConfig.prefault({}),
}).prefault({})

export type PolypotConfig = z.infer<typeof PolypotConfigSchema>
export type PolypotConfigInput = z.input<typeof PolypotConfigSchema>
