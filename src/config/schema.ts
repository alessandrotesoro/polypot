// API keys are intentionally absent from this schema. They flow only through
// env vars, never through YAML, so they can never appear in a serialised
// config object.
import {z} from 'zod'

const ProviderConfig = z.object({
  provider: z.string().default('openai'),
  model: z.string().default('gpt-4.1-mini'),
  temperature: z.number().default(0.7),
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
  batchSize: z.number().int().default(20),
  jobs: z.number().int().default(2),
  timeout: z.number().int().default(60),
})

const LimitsConfig = z.object({
  maxStringsPerJob: z.number().int().optional(),
  maxTotalStrings: z.number().int().optional(),
  maxCost: z.number().optional(),
})

const RetriesConfig = z.object({
  maxRetries: z.number().int().default(3),
  retryDelay: z.number().int().default(2000),
  abortOnFailure: z.boolean().default(false),
  skipLanguageOnFailure: z.boolean().default(false),
})

const DebugConfig = z.object({
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
