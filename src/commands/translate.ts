import {Flags} from '@oclif/core'
import {BaseCommand} from '../base-command.js'

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
    // ────────────────────────────────────────────────────────────────────
    // Provider / model
    // ────────────────────────────────────────────────────────────────────
    provider: Flags.string({
      summary: 'AI provider (e.g. openai, gemini, anthropic). Auto-detected from API key when omitted.',
      env: 'POLYPOT_PROVIDER',
      helpGroup: 'PROVIDER',
    }),
    'api-key': Flags.string({
      char: 'k',
      summary: 'Provider API key. Phase 2 wires the 5-tier env fallback (POLYPOT_OPENAI_API_KEY → OPENAI_API_KEY → POLYPOT_API_KEY → API_KEY).',
      // Intentionally NO env: binding here — Phase 2 loader handles the multi-source fallback.
      helpGroup: 'PROVIDER',
    }),
    model: Flags.string({
      char: 'm',
      summary: 'AI model name (e.g. gpt-4.1-mini).',
      env: 'POLYPOT_MODEL',
      helpGroup: 'PROVIDER',
    }),
    temperature: Flags.string({
      summary: 'Sampling temperature (0.0–2.0). Lower = more deterministic.',
      env: 'POLYPOT_TEMPERATURE',
      helpGroup: 'PROVIDER',
    }),
    'max-tokens': Flags.integer({
      summary: 'Max completion tokens (1–32768, auto-calculated when omitted).',
      env: 'POLYPOT_MAX_TOKENS',
      helpGroup: 'PROVIDER',
    }),
    'source-language': Flags.string({
      char: 's',
      summary: 'Source language code (default: en).',
      env: 'POLYPOT_SOURCE_LANGUAGE',
      helpGroup: 'PROVIDER',
    }),

    // ────────────────────────────────────────────────────────────────────
    // Source / target
    // ────────────────────────────────────────────────────────────────────
    'target-languages': Flags.string({
      char: 'l',
      summary: 'Target language codes, comma-separated (e.g. fr_FR,es_ES,de_DE).',
      multiple: true,
      delimiter: ',',
      env: 'POLYPOT_TARGET_LANGUAGES',
      helpGroup: 'SOURCE',
    }),
    'pot-file-path': Flags.string({
      char: 'p',
      summary: 'Path to the input .pot file containing source strings.',
      env: 'POLYPOT_POT_FILE_PATH',
      helpGroup: 'SOURCE',
    }),
    'input-po-path': Flags.string({
      summary: 'Path to an existing .po file to use as a base for merging.',
      env: 'POLYPOT_INPUT_PO_PATH',
      helpGroup: 'SOURCE',
    }),

    // ────────────────────────────────────────────────────────────────────
    // Output
    // ────────────────────────────────────────────────────────────────────
    'output-dir': Flags.string({
      char: 'o',
      summary: 'Directory to save generated .po files for each language.',
      env: 'POLYPOT_OUTPUT_DIR',
      helpGroup: 'OUTPUT',
    }),
    'output-format': Flags.option({
      options: ['console', 'json'] as const,
      summary: 'Output format: console (default) or json.',
      env: 'POLYPOT_OUTPUT_FORMAT',
      helpGroup: 'OUTPUT',
    })(),
    'output-file': Flags.string({
      summary: 'Path to save JSON output (stdout when omitted).',
      env: 'POLYPOT_OUTPUT_FILE',
      helpGroup: 'OUTPUT',
    }),
    'po-file-prefix': Flags.string({
      summary: 'Prefix for each output .po file (e.g. "app-" → "app-fr_FR.po").',
      env: 'POLYPOT_PO_FILE_PREFIX',
      helpGroup: 'OUTPUT',
    }),
    'locale-format': Flags.option({
      options: ['wp_locale', 'iso_639_1', 'iso_639_2', 'target_lang'] as const,
      summary: 'Filename locale format (controls output filename only, not input).',
      env: 'POLYPOT_LOCALE_FORMAT',
      helpGroup: 'OUTPUT',
    })(),

    // ────────────────────────────────────────────────────────────────────
    // Translation behaviour
    // ────────────────────────────────────────────────────────────────────
    'force-translate': Flags.boolean({
      char: 'F',
      summary: 'Re-translate all strings, ignoring any existing translations.',
      env: 'POLYPOT_FORCE_TRANSLATE',
      helpGroup: 'BEHAVIOR',
    }),
    'use-dictionary': Flags.boolean({
      summary: 'Use the dictionary system for consistent translations.',
      env: 'POLYPOT_USE_DICTIONARY',
      helpGroup: 'BEHAVIOR',
    }),
    'dictionary-path': Flags.string({
      summary: 'Directory containing dictionary files.',
      env: 'POLYPOT_DICTIONARY_PATH',
      helpGroup: 'BEHAVIOR',
    }),
    'prompt-file-path': Flags.string({
      summary: 'Path to the prompt.md file containing translation instructions.',
      env: 'POLYPOT_PROMPT_FILE_PATH',
      helpGroup: 'BEHAVIOR',
    }),
    'po-header-template-path': Flags.string({
      summary: 'Path to the po-header.json file containing custom PO file headers.',
      env: 'POLYPOT_PO_HEADER_TEMPLATE_PATH',
      helpGroup: 'BEHAVIOR',
    }),

    // ────────────────────────────────────────────────────────────────────
    // Performance
    // ────────────────────────────────────────────────────────────────────
    'batch-size': Flags.integer({
      char: 'b',
      summary: 'Strings per translation batch (Potomatic range: 1–100; ranges enforced in Phase 2).',
      env: 'POLYPOT_BATCH_SIZE',
      helpGroup: 'PERFORMANCE',
    }),
    jobs: Flags.integer({
      char: 'j',
      summary: 'Max languages translated in parallel (Potomatic range: 1–10).',
      env: 'POLYPOT_JOBS',
      helpGroup: 'PERFORMANCE',
    }),
    timeout: Flags.integer({
      summary: 'API request timeout in seconds (Potomatic range: 10–300).',
      env: 'POLYPOT_TIMEOUT',
      helpGroup: 'PERFORMANCE',
    }),

    // ────────────────────────────────────────────────────────────────────
    // Limits
    // ────────────────────────────────────────────────────────────────────
    'max-strings-per-job': Flags.integer({
      summary: 'Limit the number of strings translated per language (testing aid).',
      env: 'POLYPOT_MAX_STRINGS_PER_JOB',
      helpGroup: 'LIMITS',
    }),
    'max-total-strings': Flags.integer({
      summary: 'Limit total strings translated across all languages.',
      env: 'POLYPOT_MAX_TOTAL_STRINGS',
      helpGroup: 'LIMITS',
    }),
    'max-cost': Flags.string({
      summary: 'Limit total estimated translation cost in USD.',
      env: 'POLYPOT_MAX_COST',
      helpGroup: 'LIMITS',
    }),

    // ────────────────────────────────────────────────────────────────────
    // Retries / failure handling
    // ────────────────────────────────────────────────────────────────────
    'max-retries': Flags.integer({
      summary: 'Retry attempts per batch (Potomatic range: 0–10).',
      env: 'POLYPOT_MAX_RETRIES',
      helpGroup: 'RETRIES',
    }),
    'retry-delay': Flags.integer({
      summary: 'Delay between retries in milliseconds (Potomatic range: 500–30000).',
      env: 'POLYPOT_RETRY_DELAY',
      helpGroup: 'RETRIES',
    }),
    'abort-on-failure': Flags.boolean({
      summary: 'Abort the entire run if any batch fails all retry attempts.',
      env: 'POLYPOT_ABORT_ON_FAILURE',
      helpGroup: 'RETRIES',
    }),
    'skip-language-on-failure': Flags.boolean({
      summary: 'Skip current language on failure and continue with remaining languages.',
      env: 'POLYPOT_SKIP_LANGUAGE_ON_FAILURE',
      helpGroup: 'RETRIES',
    }),

    // ────────────────────────────────────────────────────────────────────
    // Debugging
    // ────────────────────────────────────────────────────────────────────
    'verbose-level': Flags.integer({
      char: 'v',
      summary: 'Verbosity level: 0=errors, 1=normal, 2=verbose, 3=debug.',
      env: 'POLYPOT_VERBOSE_LEVEL',
      helpGroup: 'DEBUG',
    }),
    'dry-run': Flags.boolean({
      summary: 'Simulate translation without making actual API calls.',
      env: 'POLYPOT_DRY_RUN',
      helpGroup: 'DEBUG',
    }),
    'save-debug-info': Flags.boolean({
      summary: 'Save detailed request/response logs to timestamped files.',
      env: 'POLYPOT_SAVE_DEBUG_INFO',
      helpGroup: 'DEBUG',
    }),

    // ────────────────────────────────────────────────────────────────────
    // Polypot config-discovery overrides (translate-only per D8)
    // ────────────────────────────────────────────────────────────────────
    config: Flags.string({
      summary: 'Use this YAML file as the only config source (bypasses discovery).',
      env: 'POLYPOT_CONFIG',
      helpGroup: 'CONFIG',
    }),
    'no-config': Flags.boolean({
      summary: 'Ignore both YAML config files entirely; flags + .env only.',
      env: 'POLYPOT_NO_CONFIG',
      helpGroup: 'CONFIG',
    }),
    'no-env': Flags.boolean({
      summary: 'Ignore both .env files; flags + YAML only.',
      env: 'POLYPOT_NO_ENV',
      helpGroup: 'CONFIG',
    }),
  }

  public async run(): Promise<unknown> {
    const result = {
      stub: '[stub] translate logic ships in Phase 2',
      flags: this.flags,
      appConfig: this.appConfig,
    }
    this.log(JSON.stringify(result, null, 2))
    return result
  }
}
