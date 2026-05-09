import {Command, type Interfaces} from '@oclif/core'
import {loadPolypotConfig, type LoadPolypotConfigOptions} from './config/loader.js'
import type {PolypotConfig} from './config/schema.js'

export type BaseFlags<T extends typeof Command> = Interfaces.InferredFlags<T['flags']>
export type BaseArgs<T extends typeof Command> = Interfaces.InferredArgs<T['args']>

/**
 * Subset of parsed flags that BaseCommand consumes when configuring the loader.
 * Each field is optional because not every command declares the corresponding flag.
 */
interface ConfigDiscoveryFlags {
  readonly config?: string
  readonly 'no-config'?: boolean
  readonly 'no-env'?: boolean
}

/**
 * Project the relevant config-discovery values out of a parsed flags object.
 *
 * Only `translate` declares these flags (per D8). For `setup`/`init`, the
 * fields are absent — the loader handles all-undefined gracefully.
 */
function extractDiscoveryOptions(flags: ConfigDiscoveryFlags): LoadPolypotConfigOptions {
  return {
    ...(flags.config !== undefined && {configPath: flags.config}),
    ...(flags['no-config'] !== undefined && {noConfig: flags['no-config']}),
    ...(flags['no-env'] !== undefined && {noEnv: flags['no-env']}),
  }
}

/**
 * Shared base for every polypot command.
 *
 * Phase 1 responsibility:
 *   1. Parse the command's own flags via OCLIF's standard parse path.
 *   2. Call the (Phase 1 stub) loader and expose the result as `this.appConfig`.
 *
 * Phase 2 will extend this to overlay explicitly-set flag values onto the
 * loaded config so the documented flag-over-env-over-yaml-over-defaults
 * precedence holds end-to-end.
 *
 * Per D8 (document review), this base class declares NO `static baseFlags`.
 * The `--config` / `--no-config` / `--no-env` config-discovery flags live
 * only on `translate` (the read-mode command); the write-mode commands
 * (`setup`, `init`) have no use for them.
 */
export abstract class BaseCommand<T extends typeof Command> extends Command {
  protected flags!: BaseFlags<T>
  protected args!: BaseArgs<T>
  protected appConfig!: PolypotConfig

  public override async init(): Promise<void> {
    await super.init()

    const {args, flags} = await this.parse({
      args: this.ctor.args,
      enableJsonFlag: this.ctor.enableJsonFlag,
      flags: this.ctor.flags,
      strict: this.ctor.strict,
    })
    this.flags = flags as BaseFlags<T>
    this.args = args as BaseArgs<T>

    this.appConfig = await loadPolypotConfig({
      configDir: this.config.configDir,
      cwd: process.cwd(),
      options: extractDiscoveryOptions(flags as ConfigDiscoveryFlags),
    })
  }
}
