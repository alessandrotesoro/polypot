import {Flags} from '@oclif/core'
import {BaseCommand} from '../base-command.js'
import {resolveConfigPaths} from '../config/paths.js'
import {polypotEnv, STUB_PHASE2} from '../flag-helpers.js'

export default class Setup extends BaseCommand<typeof Setup> {
  static override summary = 'Configure polypot defaults shared across all projects'
  static override description = `
Manages the global polypot configuration stored in the OS-standard config
directory (XDG_CONFIG_HOME on Linux/macOS, %APPDATA% on Windows).

Phase 1 ships only the command surface — the interactive setup wizard
(prompts for provider, default model, languages, API key, etc.) lands in
Phase 2 alongside the config writer.
`
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --show',
    '<%= config.bin %> <%= command.id %> --force',
  ]

  static override flags = {
    force: Flags.boolean({
      char: 'f',
      summary: 'Overwrite existing global config without prompting.',
      env: polypotEnv('force'),
    }),
    show: Flags.boolean({
      summary: 'Print the resolved global config path (and contents in Phase 2) and exit.',
      env: polypotEnv('show'),
    }),
    'non-interactive': Flags.boolean({
      summary: 'Skip prompts; useful for scripted setup. Errors out on prompt-only flows.',
      env: polypotEnv('non-interactive'),
    }),
  }

  public async run(): Promise<void> {
    const paths = resolveConfigPaths({configDir: this.config.configDir, cwd: process.cwd()})

    if (this.flags.show) {
      this.log(`${STUB_PHASE2} global config path: ${paths.globalYaml}`)
      this.log(`${STUB_PHASE2} global secrets path: ${paths.globalEnv}`)
      this.log(`${STUB_PHASE2} reading and printing the config file body ships in Phase 2.`)
      return
    }

    this.log(`${STUB_PHASE2} interactive setup wizard ships in Phase 2.`)
    this.log(`Edit ${paths.globalYaml} directly, or rerun with --show to inspect the resolved path.`)
    if (this.flags.force) this.log(`${STUB_PHASE2} --force will overwrite without confirmation in Phase 2.`)
    if (this.flags['non-interactive']) {
      this.log(`${STUB_PHASE2} --non-interactive will skip prompts in Phase 2.`)
    }
  }
}
