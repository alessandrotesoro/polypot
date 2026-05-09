import {Flags} from '@oclif/core'
import {BaseCommand} from '../base-command.js'
import {resolveConfigPaths} from '../config/paths.js'
import {polypotEnv, STUB} from '../flag-helpers.js'

export default class Setup extends BaseCommand<typeof Setup> {
  static override summary = 'Configure polypot defaults shared across all projects'
  static override description = `
Manages the global polypot configuration stored in the OS-standard config
directory (XDG_CONFIG_HOME on Linux/macOS, %APPDATA% on Windows).
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
      summary: 'Print the resolved global config paths and exit.',
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
      this.log(`global config: ${paths.globalYaml}`)
      this.log(`global secrets: ${paths.globalEnv}`)
      return
    }

    this.log(`${STUB} setup wizard not implemented`)
    this.log(`Edit ${paths.globalYaml} directly, or rerun with --show to inspect the resolved path.`)
  }
}
