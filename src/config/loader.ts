import {PolypotConfigSchema, type PolypotConfig} from './schema.js'

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

// Frozen so accidental mutation by callers is loud, not silent.
const DEFAULTS: PolypotConfig = Object.freeze(PolypotConfigSchema.parse({})) as PolypotConfig

export async function loadPolypotConfig(_args: LoadPolypotConfigArgs): Promise<PolypotConfig> {
  return DEFAULTS
}
