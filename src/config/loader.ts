// Phase 1 config loader stub. Returns schema defaults regardless of inputs;
// the full layered-merge pipeline ships in Phase 2 (see the plan document).
// Function signature, options shape, and return type are locked in so Phase 2
// can fill in the body without touching any caller.
import {PolypotConfigSchema, type PolypotConfig} from './schema.js'

export interface LoadPolypotConfigOptions {
  /** Read from this YAML path instead of running discovery. */
  readonly configPath?: string
  /** Skip both YAML reads (global and project). */
  readonly noConfig?: boolean
  /** Skip both .env reads (global and project). */
  readonly noEnv?: boolean
}

export interface LoadPolypotConfigArgs {
  /** OCLIF's `this.config.configDir`. */
  readonly configDir: string
  /** Project working directory. */
  readonly cwd: string
  /** User-controlled discovery toggles parsed from the active command's flags. */
  readonly options?: LoadPolypotConfigOptions
}

// Frozen so accidental mutation by callers is loud, not silent.
const DEFAULTS: PolypotConfig = Object.freeze(PolypotConfigSchema.parse({})) as PolypotConfig

export async function loadPolypotConfig(_args: LoadPolypotConfigArgs): Promise<PolypotConfig> {
  return DEFAULTS
}
