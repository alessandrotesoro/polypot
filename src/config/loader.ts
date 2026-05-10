import {readGlobalConfig, readGlobalSecrets, readPolypotConfigFile} from './global-store.js'
import {PolypotConfigSchema, type PolypotConfig} from './schema.js'
import {EMPTY_SECRETS, type PolypotSecrets} from './secrets.js'

export interface LoadPolypotConfigOptions {
  readonly configPath?: string
  readonly noConfig?: boolean
  readonly noEnv?: boolean
}

export interface LoadPolypotConfigArgs {
  readonly configDir: string
  readonly cwd: string
  readonly options?: LoadPolypotConfigOptions
}

export interface PolypotRuntimeConfig {
  readonly config: PolypotConfig
  readonly secrets: PolypotSecrets
}

function loadConfigSource(args: LoadPolypotConfigArgs): Promise<PolypotConfig> {
  if (args.options?.noConfig === true) return Promise.resolve(PolypotConfigSchema.parse({}))
  if (args.options?.configPath !== undefined) return readPolypotConfigFile(args.options.configPath)
  return readGlobalConfig({configDir: args.configDir, cwd: args.cwd})
}

function loadSecretsSource(args: LoadPolypotConfigArgs): Promise<PolypotSecrets> {
  if (args.options?.noEnv === true) return Promise.resolve(EMPTY_SECRETS)
  return readGlobalSecrets(args)
}

export async function loadPolypotConfig(args: LoadPolypotConfigArgs): Promise<PolypotConfig> {
  return loadConfigSource(args)
}

export async function loadPolypotRuntimeConfig(args: LoadPolypotConfigArgs): Promise<PolypotRuntimeConfig> {
  const [config, secrets] = await Promise.all([
    loadConfigSource(args),
    loadSecretsSource(args),
  ])

  return {
    config,
    secrets,
  }
}
