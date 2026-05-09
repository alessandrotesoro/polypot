import {Flags} from '@oclif/core'
import {BaseCommand} from '../base-command.js'
import {polypotEnv, STUB_PHASE2} from '../flag-helpers.js'

export default class Translate extends BaseCommand<typeof Translate> {
  static override summary = 'Translate a .pot file into one or more languages using AI'
  static override description = `
Reads source strings from a .pot file and writes translated .po files for
each target language. Settings can be supplied via CLI flags, environment
variables (POLYPOT_*), per-project config (.polypot/config.yaml), or the
global config — flags win, then project .env, then global .env, then
project YAML, then global YAML, then defaults.

Phase 1 ships only the command surface and the layered-config wiring.
The actual translation pipeline (AI calls, batching, cost estimation,
.po writing) lands in Phase 2.
`
  static override examples = [
    '<%= config.bin %> <%= command.id %> -l fr_FR,es_ES -p translations.pot',
    '<%= config.bin %> <%= command.id %> -l fr_FR -p translations.pot --dry-run',
    '<%= config.bin %> <%= command.id %> -l fr_FR -p translations.pot -b 30 -j 3',
  ]

  static override enableJsonFlag = true

  static override flags = {
    // Provider / model
    provider: Flags.string({
      summary: 'AI provider (e.g. openai, gemini, anthropic). Auto-detected from API key when omitted.',
      env: polypotEnv('provider'),
      helpGroup: 'PROVIDER',
    }),
    'api-key': Flags.string({
      char: 'k',
      summary: 'Provider API key. Phase 2 wires the 5-tier env fallback (POLYPOT_OPENAI_API_KEY → OPENAI_API_KEY → POLYPOT_API_KEY → API_KEY).',
      // Intentionally NO env: binding — Phase 2 loader handles the multi-source fallback.
      helpGroup: 'PROVIDER',
    }),
    model: Flags.string({
      char: 'm',
      summary: 'AI model name (e.g. gpt-4.1-mini).',
      env: polypotEnv('model'),
      helpGroup: 'PROVIDER',
    }),
    temperature: Flags.string({
      summary: 'Sampling temperature (0.0–2.0). Lower = more deterministic.',
      env: polypotEnv('temperature'),
      helpGroup: 'PROVIDER',
    }),
    'max-tokens': Flags.integer({
      summary: 'Max completion tokens (1–32768, auto-calculated when omitted).',
      env: polypotEnv('max-tokens'),
      helpGroup: 'PROVIDER',
    }),
    'source-language': Flags.string({
      char: 's',
      summary: 'Source language code (default: en).',
      env: polypotEnv('source-language'),
      helpGroup: 'PROVIDER',
    }),

    // Source / target
    'target-languages': Flags.string({
      char: 'l',
      summary: 'Target language codes, comma-separated (e.g. fr_FR,es_ES,de_DE).',
      multiple: true,
      delimiter: ',',
      env: polypotEnv('target-languages'),
      helpGroup: 'SOURCE',
    }),
    'pot-file-path': Flags.string({
      char: 'p',
      summary: 'Path to the input .pot file containing source strings.',
      env: polypotEnv('pot-file-path'),
      helpGroup: 'SOURCE',
    }),
    'input-po-path': Flags.string({
      summary: 'Path to an existing .po file to use as a base for merging.',
      env: polypotEnv('input-po-path'),
      helpGroup: 'SOURCE',
    }),

    // Output
    'output-dir': Flags.string({
      char: 'o',
      summary: 'Directory to save generated .po files for each language.',
      env: polypotEnv('output-dir'),
      helpGroup: 'OUTPUT',
    }),
    'output-format': Flags.option({
      options: ['console', 'json'] as const,
      summary: 'Output format: console (default) or json.',
      env: polypotEnv('output-format'),
      helpGroup: 'OUTPUT',
    })(),
    'output-file': Flags.string({
      summary: 'Path to save JSON output (stdout when omitted).',
      env: polypotEnv('output-file'),
      helpGroup: 'OUTPUT',
    }),
    'po-file-prefix': Flags.string({
      summary: 'Prefix for each output .po file (e.g. "app-" → "app-fr_FR.po").',
      env: polypotEnv('po-file-prefix'),
      helpGroup: 'OUTPUT',
    }),
    'locale-format': Flags.option({
      options: ['wp_locale', 'iso_639_1', 'iso_639_2', 'target_lang'] as const,
      summary: 'Filename locale format (controls output filename only, not input).',
      env: polypotEnv('locale-format'),
      helpGroup: 'OUTPUT',
    })(),

    // Translation behaviour
    'force-translate': Flags.boolean({
      char: 'F',
      summary: 'Re-translate all strings, ignoring any existing translations.',
      env: polypotEnv('force-translate'),
      helpGroup: 'BEHAVIOR',
    }),
    'use-dictionary': Flags.boolean({
      summary: 'Use the dictionary system for consistent translations.',
      env: polypotEnv('use-dictionary'),
      helpGroup: 'BEHAVIOR',
    }),
    'dictionary-path': Flags.string({
      summary: 'Directory containing dictionary files.',
      env: polypotEnv('dictionary-path'),
      helpGroup: 'BEHAVIOR',
    }),
    'prompt-file-path': Flags.string({
      summary: 'Path to the prompt.md file containing translation instructions.',
      env: polypotEnv('prompt-file-path'),
      helpGroup: 'BEHAVIOR',
    }),
    'po-header-template-path': Flags.string({
      summary: 'Path to the po-header.json file containing custom PO file headers.',
      env: polypotEnv('po-header-template-path'),
      helpGroup: 'BEHAVIOR',
    }),

    // Performance
    'batch-size': Flags.integer({
      char: 'b',
      summary: 'Strings per translation batch (Potomatic range: 1–100; ranges enforced in Phase 2).',
      env: polypotEnv('batch-size'),
      helpGroup: 'PERFORMANCE',
    }),
    jobs: Flags.integer({
      char: 'j',
      summary: 'Max languages translated in parallel (Potomatic range: 1–10).',
      env: polypotEnv('jobs'),
      helpGroup: 'PERFORMANCE',
    }),
    timeout: Flags.integer({
      summary: 'API request timeout in seconds (Potomatic range: 10–300).',
      env: polypotEnv('timeout'),
      helpGroup: 'PERFORMANCE',
    }),

    // Limits
    'max-strings-per-job': Flags.integer({
      summary: 'Limit the number of strings translated per language (testing aid).',
      env: polypotEnv('max-strings-per-job'),
      helpGroup: 'LIMITS',
    }),
    'max-total-strings': Flags.integer({
      summary: 'Limit total strings translated across all languages.',
      env: polypotEnv('max-total-strings'),
      helpGroup: 'LIMITS',
    }),
    'max-cost': Flags.string({
      summary: 'Limit total estimated translation cost in USD.',
      env: polypotEnv('max-cost'),
      helpGroup: 'LIMITS',
    }),

    // Retries / failure handling
    'max-retries': Flags.integer({
      summary: 'Retry attempts per batch (Potomatic range: 0–10).',
      env: polypotEnv('max-retries'),
      helpGroup: 'RETRIES',
    }),
    'retry-delay': Flags.integer({
      summary: 'Delay between retries in milliseconds (Potomatic range: 500–30000).',
      env: polypotEnv('retry-delay'),
      helpGroup: 'RETRIES',
    }),
    'abort-on-failure': Flags.boolean({
      summary: 'Abort the entire run if any batch fails all retry attempts.',
      env: polypotEnv('abort-on-failure'),
      helpGroup: 'RETRIES',
    }),
    'skip-language-on-failure': Flags.boolean({
      summary: 'Skip current language on failure and continue with remaining languages.',
      env: polypotEnv('skip-language-on-failure'),
      helpGroup: 'RETRIES',
    }),

    // Debugging
    'verbose-level': Flags.integer({
      char: 'v',
      summary: 'Verbosity level: 0=errors, 1=normal, 2=verbose, 3=debug.',
      env: polypotEnv('verbose-level'),
      helpGroup: 'DEBUG',
    }),
    'dry-run': Flags.boolean({
      summary: 'Simulate translation without making actual API calls.',
      env: polypotEnv('dry-run'),
      helpGroup: 'DEBUG',
    }),
    'save-debug-info': Flags.boolean({
      summary: 'Save detailed request/response logs to timestamped files.',
      env: polypotEnv('save-debug-info'),
      helpGroup: 'DEBUG',
    }),

    // Polypot config-discovery overrides (translate-only per D8)
    config: Flags.string({
      summary: 'Use this YAML file as the only config source (bypasses discovery).',
      env: polypotEnv('config'),
      helpGroup: 'CONFIG',
    }),
    'no-config': Flags.boolean({
      summary: 'Ignore both YAML config files entirely; flags + .env only.',
      env: polypotEnv('no-config'),
      helpGroup: 'CONFIG',
    }),
    'no-env': Flags.boolean({
      summary: 'Ignore both .env files; flags + YAML only.',
      env: polypotEnv('no-env'),
      helpGroup: 'CONFIG',
    }),
  }

  public async run(): Promise<unknown> {
    const result = {
      stub: `${STUB_PHASE2} translate logic ships in Phase 2`,
      flags: this.flags,
      appConfig: this.appConfig,
    }
    this.log(JSON.stringify(result, null, 2))
    return result
  }
}
