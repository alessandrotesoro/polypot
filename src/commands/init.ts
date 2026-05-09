import {Flags} from '@oclif/core'
import path from 'node:path'
import {BaseCommand} from '../base-command.js'
import {resolveConfigPaths} from '../config/paths.js'
import {polypotEnv, STUB_PHASE2} from '../flag-helpers.js'

export default class Init extends BaseCommand<typeof Init> {
  static override summary = 'Initialise polypot configuration in the current project'
  static override description = `
Creates a per-project .polypot/ directory with config.yaml and .env, and
appends .polypot/.env to the project's .gitignore so secrets are not
committed.
`
  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --yes',
    '<%= config.bin %> <%= command.id %> --no-gitignore',
    '<%= config.bin %> <%= command.id %> --cwd /path/to/project',
  ]

  static override flags = {
    force: Flags.boolean({
      char: 'f',
      summary: 'Overwrite existing .polypot/ files.',
      env: polypotEnv('force'),
    }),
    cwd: Flags.string({
      summary: 'Target project directory (defaults to the current working directory).',
      defaultHelp: 'process.cwd()',
      env: polypotEnv('cwd'),
    }),
    gitignore: Flags.boolean({
      default: true,
      allowNo: true,
      helpLabel: '--[no-]gitignore',
      summary: 'Append .polypot/.env to the project .gitignore (default: true). Use --no-gitignore to skip.',
      env: polypotEnv('gitignore'),
    }),
    yes: Flags.boolean({
      char: 'y',
      summary: 'Accept defaults non-interactively.',
      env: polypotEnv('yes'),
    }),
  }

  public async run(): Promise<void> {
    const targetCwd = this.flags.cwd ?? process.cwd()
    const paths = resolveConfigPaths({configDir: this.config.configDir, cwd: targetCwd})
    const gitignorePath = path.join(targetCwd, '.gitignore')

    this.log(`${STUB_PHASE2} init not implemented. Would create in ${targetCwd}:`)
    this.log(`  - ${paths.projectYaml}${this.flags.force ? ' (force overwrite)' : ''}`)
    this.log(`  - ${paths.projectEnv}${this.flags.force ? ' (force overwrite)' : ''}`)
    if (this.flags.gitignore) this.log(`  - append ".polypot/.env" to ${gitignorePath}`)
  }
}
