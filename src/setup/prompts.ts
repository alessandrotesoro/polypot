import {checkbox, confirm, input, password, select} from '@inquirer/prompts'
import type {PolypotConfig} from '../config/schema.js'
import type {PolypotSecrets} from '../config/secrets.js'
import {formatSetupLanguage, setupLanguageChoices, type SetupLanguageChoice} from './languages.js'

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
  readonly checkbox: (options: {
    readonly message: string
    readonly choices: readonly SetupLanguageChoice[]
    readonly pageSize?: number
    readonly required?: boolean
  }) => Promise<string[]>
  readonly input: (options: {
    readonly message: string
    readonly default?: string
    readonly validate?: (value: string) => boolean | string
  }) => Promise<string>
  readonly password: (options: {
    readonly message: string
    readonly validate?: (value: string) => boolean | string
  }) => Promise<string>
  readonly select: (options: {
    readonly message: string
    readonly choices: readonly SetupLanguageChoice[]
    readonly default?: string
    readonly pageSize?: number
  }) => Promise<string>
}

const defaultPromptAdapter: SetupPromptAdapter = {
  checkbox,
  confirm,
  input,
  password: (options) => password({mask: '*', ...options}),
  select,
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

function parseTemperature(value: string): number | undefined {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  if (parsed < 0 || parsed > 2) return undefined
  return parsed
}

function messageWithDefault(message: string, value: string): string {
  return `${message} (default: ${value})`
}

async function promptOpenAIApiKey(
  existingSecrets: PolypotSecrets,
  adapter: SetupPromptAdapter,
): Promise<string | undefined> {
  const shouldPromptForKey = existingSecrets.hasOpenaiApiKey ?
    !(await adapter.confirm({
      message: 'Keep existing OpenAI API key? (default: yes)',
      default: true,
    })) :
    await adapter.confirm({
      message: 'Store an OpenAI API key now? (default: yes)',
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
      message: 'Validate the OpenAI connection now? (default: yes)',
      default: true,
    })

  const model = await adapter.input({
    message: messageWithDefault('Default OpenAI model', existingConfig.provider.model),
    default: existingConfig.provider.model,
    validate: (value) => value.trim().length > 0 || 'Model cannot be empty.',
  })

  const temperatureAnswer = await adapter.input({
    message: messageWithDefault('Default temperature', String(existingConfig.provider.temperature)),
    default: String(existingConfig.provider.temperature),
    validate: (value) => parseTemperature(value) !== undefined || 'Enter a number from 0 to 2.',
  })

  const sourceLanguage = await adapter.select({
    choices: setupLanguageChoices({selected: [existingConfig.source.sourceLanguage]}),
    default: existingConfig.source.sourceLanguage,
    message: messageWithDefault('Default source language', formatSetupLanguage(existingConfig.source.sourceLanguage)),
    pageSize: 12,
  })

  const targetLanguages = await adapter.checkbox({
    choices: setupLanguageChoices({selected: existingConfig.source.targetLanguages}),
    message: messageWithDefault(
      'Default target languages',
      existingConfig.source.targetLanguages.length > 0 ?
        existingConfig.source.targetLanguages.map(formatSetupLanguage).join(', ') :
        'none',
    ),
    pageSize: 12,
    required: false,
  })

  return {
    ...(openaiApiKey !== undefined && {openaiApiKey: openaiApiKey.trim()}),
    validateConnection,
    provider: 'openai',
    model: model.trim(),
    temperature: parseTemperature(temperatureAnswer) ?? existingConfig.provider.temperature,
    sourceLanguage,
    targetLanguages,
  }
}

export async function confirmSetupUpdate(adapter: SetupPromptAdapter = currentPromptAdapter()): Promise<boolean> {
  return adapter.confirm({
    message: 'Update existing global Polypot setup? (default: no)',
    default: false,
  })
}
