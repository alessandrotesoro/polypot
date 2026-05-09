import {Command, type Interfaces} from '@oclif/core'
import {loadPolypotConfig, type LoadPolypotConfigOptions} from './config/loader.js'
import type {PolypotConfig} from './config/schema.js'

export type BaseFlags<T extends typeof Command> = Interfaces.InferredFlags<T['flags']>
export type BaseArgs<T extends typeof Command> = Interfaces.InferredArgs<T['args']>

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

  public async init(): Promise<void> {
    await super.init()

    const {args, flags} = await this.parse({
      args: this.ctor.args,
      enableJsonFlag: this.ctor.enableJsonFlag,
      flags: this.ctor.flags,
      strict: this.ctor.strict,
    })
    this.flags = flags as BaseFlags<T>
    this.args = args as BaseArgs<T>

    // Pull config-discovery options from the parsed flags when present.
    // Only `translate` declares these; for `setup`/`init` they're undefined,
    // which the loader handles correctly.
    const options: LoadPolypotConfigOptions = {
      configPath: (flags as Record<string, unknown>).config as string | undefined,
      noConfig: (flags as Record<string, unknown>)['no-config'] as boolean | undefined,
      noEnv: (flags as Record<string, unknown>)['no-env'] as boolean | undefined,
    }

    this.appConfig = await loadPolypotConfig({
      configDir: this.config.configDir,
      cwd: process.cwd(),
      options,
    })
  }
}
