// Phase 1 config loader stub.
//
// The Phase 1 body returns schema defaults regardless of inputs. The full
// layered-merge pipeline (cosmiconfig + dotenv + defu + 5-tier env fallback +
// zod re-validation) ships in Phase 2 alongside the consuming logic.
//
// The function signature, options shape, and return type are LOCKED IN now
// so Phase 2 can fill in the body without touching any caller.
import {PolypotConfigSchema, type PolypotConfig} from './schema.js'
import {resolveConfigPaths} from './paths.js'

export interface LoadPolypotConfigOptions {
  /** Read from this YAML path instead of running discovery. */
  configPath?: string
  /** Skip both YAML reads (global and project). */
  noConfig?: boolean
  /** Skip both .env reads (global and project). */
  noEnv?: boolean
}

export interface LoadPolypotConfigArgs {
  /** OCLIF's `this.config.configDir`. */
  configDir: string
  /** Project working directory. */
  cwd: string
  /** User-controlled discovery toggles parsed from the active command's flags. */
  options?: LoadPolypotConfigOptions
}

/**
 * Load the effective polypot config for the current invocation.
 *
 * Phase 1: returns schema defaults regardless of inputs.
 * Phase 2: implement the full pipeline below.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function loadPolypotConfig(args: LoadPolypotConfigArgs): Promise<PolypotConfig> {
  // Phase 2: resolve config paths from args (paths.ts is already implemented).
  // const paths = resolveConfigPaths({configDir: args.configDir, cwd: args.cwd})

  // Phase 2: read YAML layers (global + project) via yaml.parse(fs.readFileSync(...)).
  //          Honour args.options.noConfig (skip both) and args.options.configPath (use this single file).

  // Phase 2: read .env layers (global + project) via dotenv.parse — never mutate process.env.
  //          Honour args.options.noEnv (skip both).

  // Phase 2: apply 5-tier env fallback (POLYPOT_OPENAI_API_KEY → OPENAI_API_KEY → POLYPOT_API_KEY → API_KEY).
  //          See Open Questions in the Phase 1 plan: drop the unprefixed API_KEY tier or warn at -v 2+.

  // Phase 2: defu-merge layers in precedence order (project .env > global .env > project YAML > global YAML > defaults).

  // Phase 2: re-validate the merged result with PolypotConfigSchema.parse().

  // Phase 1: just hand back defaults so command stubs have a valid PolypotConfig to work with.
  return PolypotConfigSchema.parse({})
}

// Keep the import live so Phase 2 doesn't have to re-add it. paths.ts is fully
// implemented in Phase 1 even though the loader stub doesn't yet call it.
export {resolveConfigPaths}
