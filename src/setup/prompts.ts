import {confirm, input, password} from '@inquirer/prompts'
import type {PolypotConfig} from '../config/schema.js'
import type {PolypotSecrets} from '../config/secrets.js'

export interface SetupAnswers {
  readonly openaiApiKey?: string
  readonly validateConnection: boolean
  readonly provider: 'openai'
  readonly model: string
  readonly temperature: number
  readonly sourceLanguage: string
  readonly targetLanguages: readonly string[]
}

export interface SetupPromptAdapter {
  readonly confirm: (options: {readonly message: string; readonly default?: boolean}) => Promise<boolean>
  readonly input: (options: {
    readonly message: string
    readonly default?: string
    readonly validate?: (value: string) => boolean | string
  }) => Promise<string>
  readonly password: (options: {
    readonly message: string
    readonly validate?: (value: string) => boolean | string
  }) => Promise<string>
}

const defaultPromptAdapter: SetupPromptAdapter = {
  confirm: (options) => confirm(options),
  input: (options) => input(options),
  password: (options) => password({mask: '*', ...options}),
}

const SETUP_PROMPT_ADAPTER = Symbol.for('polypot.setupPromptAdapter')

type SetupPromptGlobal = typeof globalThis & {
  [SETUP_PROMPT_ADAPTER]?: SetupPromptAdapter
}

function setupPromptGlobal(): SetupPromptGlobal {
  return globalThis as SetupPromptGlobal
}

export function setSetupPromptAdapterForTests(adapter: SetupPromptAdapter | undefined): void {
  const promptGlobal = setupPromptGlobal()
  if (adapter === undefined) {
    delete promptGlobal[SETUP_PROMPT_ADAPTER]
  } else {
    promptGlobal[SETUP_PROMPT_ADAPTER] = adapter
  }
}

function currentPromptAdapter(): SetupPromptAdapter {
  return setupPromptGlobal()[SETUP_PROMPT_ADAPTER] ?? defaultPromptAdapter
}

export function parseTargetLanguages(value: string): string[] {
  return value
    .split(',')
    .map((language) => language.trim())
    .filter((language) => language.length > 0)
}

function parseTemperature(value: string): number | undefined {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  if (parsed < 0 || parsed > 2) return undefined
  return parsed
}

async function promptOpenAIApiKey(
  existingSecrets: PolypotSecrets,
  adapter: SetupPromptAdapter,
): Promise<string | undefined> {
  const shouldPromptForKey = existingSecrets.hasOpenaiApiKey ?
    !(await adapter.confirm({
      message: 'Keep existing OpenAI API key?',
      default: true,
    })) :
    await adapter.confirm({
      message: 'Store an OpenAI API key now?',
      default: true,
    })

  if (!shouldPromptForKey) return undefined

  return adapter.password({
    message: 'OpenAI API key',
    validate: (value) => value.trim().length > 0 ||
      (existingSecrets.hasOpenaiApiKey ?
        'Enter an API key, or keep the existing key.' :
        'Enter an API key, or choose not to store one.'),
  })
}

export function buildSetupConfig(existingConfig: PolypotConfig, answers: SetupAnswers): PolypotConfig {
  return {
    ...existingConfig,
    provider: {
      ...existingConfig.provider,
      provider: answers.provider,
      model: answers.model,
      temperature: answers.temperature,
    },
    source: {
      ...existingConfig.source,
      sourceLanguage: answers.sourceLanguage,
      targetLanguages: [...answers.targetLanguages],
    },
  }
}

export async function collectSetupAnswers(
  existingConfig: PolypotConfig,
  existingSecrets: PolypotSecrets,
  adapter: SetupPromptAdapter = currentPromptAdapter(),
): Promise<SetupAnswers> {
  const openaiApiKey = await promptOpenAIApiKey(existingSecrets, adapter)

  const validateConnection = openaiApiKey === undefined ?
    false :
    await adapter.confirm({
      message: 'Validate the OpenAI connection now?',
      default: true,
    })

  const model = await adapter.input({
    message: 'Default OpenAI model',
    default: existingConfig.provider.model,
    validate: (value) => value.trim().length > 0 || 'Model cannot be empty.',
  })

  const temperatureAnswer = await adapter.input({
    message: 'Default temperature',
    default: String(existingConfig.provider.temperature),
    validate: (value) => parseTemperature(value) !== undefined || 'Enter a number from 0 to 2.',
  })

  const sourceLanguage = await adapter.input({
    message: 'Default source language',
    default: existingConfig.source.sourceLanguage,
    validate: (value) => value.trim().length > 0 || 'Source language cannot be empty.',
  })

  const targetLanguages = await adapter.input({
    message: 'Default target languages (comma-separated, optional)',
    default: existingConfig.source.targetLanguages.join(','),
  })

  return {
    ...(openaiApiKey !== undefined && {openaiApiKey: openaiApiKey.trim()}),
    validateConnection,
    provider: 'openai',
    model: model.trim(),
    temperature: parseTemperature(temperatureAnswer) ?? existingConfig.provider.temperature,
    sourceLanguage: sourceLanguage.trim(),
    targetLanguages: parseTargetLanguages(targetLanguages),
  }
}

export async function confirmSetupUpdate(adapter: SetupPromptAdapter = currentPromptAdapter()): Promise<boolean> {
  return adapter.confirm({
    message: 'Update existing global Polypot setup?',
    default: false,
  })
}
