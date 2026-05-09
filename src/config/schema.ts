// Polypot config schema (Phase 1: structural-only).
//
// This schema defines the SHAPE of polypot configuration and the default
// values for each field. It deliberately ships without value-range or enum
// constraints (.min, .max, .options) — those are behavioural validation and
// belong in Phase 2 alongside the consuming logic. Documented Potomatic
// ranges are kept as JSDoc only so Phase 2 has a single source.
//
// SECURITY BOUNDARY (Phase 2 obligation):
// API keys are deliberately NOT in this schema. They flow only through env
// vars, never through YAML, and Phase 2 must continue to keep them out of
// any config object that gets serialised to stdout/logs.
import {z} from 'zod'

const ProviderConfig = z.object({
  /** AI provider name (e.g. "openai", "gemini", "anthropic"). Phase 2 may add .enum() once supported providers are stable. */
  provider: z.string().default('openai'),
  /** Model id for the chosen provider (e.g. "gpt-4.1-mini"). */
  model: z.string().default('gpt-4.1-mini'),
  /** Sampling temperature. Potomatic range: 0.0–2.0. */
  temperature: z.number().default(0.7),
  /** Max completion tokens. Potomatic range: 1–32768. */
  maxTokens: z.number().int().optional(),
})

const SourceConfig = z.object({
  /** Source language code. */
  sourceLanguage: z.string().default('en'),
  /** Target language codes. */
  targetLanguages: z.array(z.string()).default([]),
  /** Path to the input .pot file. */
  potFilePath: z.string().optional(),
  /** Existing .po file to merge with. */
  inputPoPath: z.string().optional(),
})

const OutputConfig = z.object({
  /** Directory to write generated .po files. */
  outputDir: z.string().default('.'),
  /** Output format. Phase 2 will constrain to ["console", "json"] via .enum(). */
  outputFormat: z.string().default('console'),
  /** Path to write JSON output (when outputFormat=json). */
  outputFile: z.string().optional(),
  /** Prefix for generated .po filenames. */
  poFilePrefix: z.string().optional(),
  /** Filename locale format. Phase 2 will constrain to known formats via .enum(). */
  localeFormat: z.string().default('target_lang'),
})

const BehaviorConfig = z.object({
  /** Re-translate all strings, ignoring existing translations. */
  forceTranslate: z.boolean().default(false),
  /** Use the dictionary system. */
  useDictionary: z.boolean().default(false),
  /** Directory containing dictionary files. */
  dictionaryPath: z.string().default('./config/dictionaries'),
  /** Path to the prompt.md file. */
  promptFilePath: z.string().default('./config/prompt.md'),
  /** Path to the po-header.json template. */
  poHeaderTemplatePath: z.string().default('./config/po-header.json'),
})

const PerformanceConfig = z.object({
  /** Strings per translation batch. Potomatic range: 1–100. */
  batchSize: z.number().int().default(20),
  /** Max languages translated in parallel. Potomatic range: 1–10. */
  jobs: z.number().int().default(2),
  /** API request timeout in seconds. Potomatic range: 10–300. */
  timeout: z.number().int().default(60),
})

const LimitsConfig = z.object({
  /** Max strings per language. */
  maxStringsPerJob: z.number().int().optional(),
  /** Max strings across all languages. */
  maxTotalStrings: z.number().int().optional(),
  /** Max estimated cost in USD. */
  maxCost: z.number().optional(),
})

const RetriesConfig = z.object({
  /** Retry attempts per batch. Potomatic range: 0–10. */
  maxRetries: z.number().int().default(3),
  /** Delay between retries in ms. Potomatic range: 500–30000. */
  retryDelay: z.number().int().default(2000),
  /** Abort the entire run if any batch fails all retries. */
  abortOnFailure: z.boolean().default(false),
  /** Skip current language on failure and continue. */
  skipLanguageOnFailure: z.boolean().default(false),
})

const DebugConfig = z.object({
  /** Verbosity level. Potomatic range: 0–3. */
  verboseLevel: z.number().int().default(1),
  /** Simulate translation without making API calls. */
  dryRun: z.boolean().default(false),
  /** Save raw API request/response logs. */
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
