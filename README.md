# Polypot

AI-powered translation CLI for `.pot` files. A from-scratch reimagining of [Potomatic](https://github.com/GravityKit/Potomatic) built on [OCLIF](https://oclif.io).

> **Phase 1 status:** the CLI surface (commands, flags, config discovery) is complete. The translation engine, AI provider clients, and `.po` file writers ship in Phase 2.

## Install

```bash
git clone <repo-url> polypot
cd polypot
npm install
npm run build
```

## Quick start

```bash
# Configure global defaults (interactive wizard ships in Phase 2)
./bin/run.js setup

# Initialise per-project config in the current directory
./bin/run.js init

# Translate a .pot file (Phase 2 implements the actual translation)
./bin/run.js translate -l fr_FR,es_ES -p translations.pot
```

## Configuration

Polypot reads configuration from layered sources (highest precedence wins):

1. CLI flags
2. Project `.env` file (`<cwd>/.polypot/.env`) — gitignored, holds secrets
3. Global `.env` file (`<configDir>/.env`) — your machine's secrets
4. Project YAML (`<cwd>/.polypot/config.yaml`) — committed to your repo
5. Global YAML (`<configDir>/config.yaml`) — your machine's defaults
6. Built-in defaults

`<configDir>` resolves to `~/.config/polypot` on Linux/macOS and `%LOCALAPPDATA%\polypot` on Windows (XDG-aware).

## Commands

<!-- commands -->
* [`polypot init`](#polypot-init)
* [`polypot setup`](#polypot-setup)
* [`polypot translate`](#polypot-translate)

## `polypot init`

Initialise polypot configuration in the current project

```
USAGE
  $ polypot init [-f] [--cwd <value>] [--gitignore] [-y]

FLAGS
  -f, --force        [env: POLYPOT_FORCE] Overwrite existing .polypot/ files.
  -y, --yes          [env: POLYPOT_YES] Accept defaults non-interactively.
      --cwd=<value>  [env: POLYPOT_CWD] Target project directory (defaults to the current working directory).
  --[no-]gitignore   [env: POLYPOT_GITIGNORE] Append .polypot/.env to the project .gitignore (default: true). Use
                     --no-gitignore to skip.

DESCRIPTION
  Initialise polypot configuration in the current project


  Creates a per-project .polypot/ directory with config.yaml and .env, and
  appends .polypot/.env to the project's .gitignore so secrets are not
  committed.

  Phase 1 ships only the command surface — the actual filesystem writes
  land in Phase 2 alongside the wizard.


EXAMPLES
  $ polypot init

  $ polypot init --yes

  $ polypot init --no-gitignore

  $ polypot init --cwd /path/to/project
```

## `polypot setup`

Configure polypot defaults shared across all projects

```
USAGE
  $ polypot setup [-f] [--show] [--non-interactive]

FLAGS
  -f, --force            [env: POLYPOT_FORCE] Overwrite existing global config without prompting.
      --non-interactive  [env: POLYPOT_NON_INTERACTIVE] Skip prompts; useful for scripted setup. Errors out on
                         prompt-only flows.
      --show             [env: POLYPOT_SHOW] Print the resolved global config path (and contents in Phase 2) and exit.

DESCRIPTION
  Configure polypot defaults shared across all projects


  Manages the global polypot configuration stored in the OS-standard config
  directory (XDG_CONFIG_HOME on Linux/macOS, %APPDATA% on Windows).

  Phase 1 ships only the command surface — the interactive setup wizard
  (prompts for provider, default model, languages, API key, etc.) lands in
  Phase 2 alongside the config writer.


EXAMPLES
  $ polypot setup

  $ polypot setup --show

  $ polypot setup --force
```

## `polypot translate`

Translate a .pot file into one or more languages using AI

```
USAGE
  $ polypot translate [--json] [--provider <value>] [-k <value>] [-m <value>] [--temperature <value>]
    [--max-tokens <value>] [-s <value>] [-l <value>...] [-p <value>] [--input-po-path <value>] [-o <value>]
    [--output-format console|json] [--output-file <value>] [--po-file-prefix <value>] [--locale-format
    wp_locale|iso_639_1|iso_639_2|target_lang] [-F] [--use-dictionary] [--dictionary-path <value>] [--prompt-file-path
    <value>] [--po-header-template-path <value>] [-b <value>] [-j <value>] [--timeout <value>] [--max-strings-per-job
    <value>] [--max-total-strings <value>] [--max-cost <value>] [--max-retries <value>] [--retry-delay <value>]
    [--abort-on-failure] [--skip-language-on-failure] [-v <value>] [--dry-run] [--save-debug-info] [--config <value>]
    [--no-config] [--no-env]

BEHAVIOR FLAGS
  -F, --force-translate                  [env: POLYPOT_FORCE_TRANSLATE] Re-translate all strings, ignoring any existing
                                         translations.
      --dictionary-path=<value>          [env: POLYPOT_DICTIONARY_PATH] Directory containing dictionary files.
      --po-header-template-path=<value>  [env: POLYPOT_PO_HEADER_TEMPLATE_PATH] Path to the po-header.json file
                                         containing custom PO file headers.
      --prompt-file-path=<value>         [env: POLYPOT_PROMPT_FILE_PATH] Path to the prompt.md file containing
                                         translation instructions.
      --use-dictionary                   [env: POLYPOT_USE_DICTIONARY] Use the dictionary system for consistent
                                         translations.

PERFORMANCE FLAGS
  -b, --batch-size=<value>  [env: POLYPOT_BATCH_SIZE] Strings per translation batch (Potomatic range: 1–100; ranges
                            enforced in Phase 2).
  -j, --jobs=<value>        [env: POLYPOT_JOBS] Max languages translated in parallel (Potomatic range: 1–10).
      --timeout=<value>     [env: POLYPOT_TIMEOUT] API request timeout in seconds (Potomatic range: 10–300).

PROVIDER FLAGS
  -k, --api-key=<value>          Provider API key. Phase 2 wires the 5-tier env fallback (POLYPOT_OPENAI_API_KEY →
                                 OPENAI_API_KEY → POLYPOT_API_KEY → API_KEY).
  -m, --model=<value>            [env: POLYPOT_MODEL] AI model name (e.g. gpt-4.1-mini).
  -s, --source-language=<value>  [env: POLYPOT_SOURCE_LANGUAGE] Source language code (default: en).
      --max-tokens=<value>       [env: POLYPOT_MAX_TOKENS] Max completion tokens (1–32768, auto-calculated when
                                 omitted).
      --provider=<value>         [env: POLYPOT_PROVIDER] AI provider (e.g. openai, gemini, anthropic). Auto-detected
                                 from API key when omitted.
      --temperature=<value>      [env: POLYPOT_TEMPERATURE] Sampling temperature (0.0–2.0). Lower = more deterministic.

SOURCE FLAGS
  -l, --target-languages=<value>...  [env: POLYPOT_TARGET_LANGUAGES] Target language codes, comma-separated (e.g.
                                     fr_FR,es_ES,de_DE).
  -p, --pot-file-path=<value>        [env: POLYPOT_POT_FILE_PATH] Path to the input .pot file containing source strings.
      --input-po-path=<value>        [env: POLYPOT_INPUT_PO_PATH] Path to an existing .po file to use as a base for
                                     merging.

OUTPUT FLAGS
  -o, --output-dir=<value>      [env: POLYPOT_OUTPUT_DIR] Directory to save generated .po files for each language.
      --locale-format=<option>  [env: POLYPOT_LOCALE_FORMAT] Filename locale format (controls output filename only, not
                                input).
                                <options: wp_locale|iso_639_1|iso_639_2|target_lang>
      --output-file=<value>     [env: POLYPOT_OUTPUT_FILE] Path to save JSON output (stdout when omitted).
      --output-format=<option>  [env: POLYPOT_OUTPUT_FORMAT] Output format: console (default) or json.
                                <options: console|json>
      --po-file-prefix=<value>  [env: POLYPOT_PO_FILE_PREFIX] Prefix for each output .po file (e.g. "app-" →
                                "app-fr_FR.po").

DEBUG FLAGS
  -v, --verbose-level=<value>  [env: POLYPOT_VERBOSE_LEVEL] Verbosity level: 0=errors, 1=normal, 2=verbose, 3=debug.
      --dry-run                [env: POLYPOT_DRY_RUN] Simulate translation without making actual API calls.
      --save-debug-info        [env: POLYPOT_SAVE_DEBUG_INFO] Save detailed request/response logs to timestamped files.

RETRIES FLAGS
  --abort-on-failure          [env: POLYPOT_ABORT_ON_FAILURE] Abort the entire run if any batch fails all retry
                              attempts.
  --max-retries=<value>       [env: POLYPOT_MAX_RETRIES] Retry attempts per batch (Potomatic range: 0–10).
  --retry-delay=<value>       [env: POLYPOT_RETRY_DELAY] Delay between retries in milliseconds (Potomatic range:
                              500–30000).
  --skip-language-on-failure  [env: POLYPOT_SKIP_LANGUAGE_ON_FAILURE] Skip current language on failure and continue with
                              remaining languages.

CONFIG FLAGS
  --config=<value>  [env: POLYPOT_CONFIG] Use this YAML file as the only config source (bypasses discovery).
  --no-config       [env: POLYPOT_NO_CONFIG] Ignore both YAML config files entirely; flags + .env only.
  --no-env          [env: POLYPOT_NO_ENV] Ignore both .env files; flags + YAML only.

GLOBAL FLAGS
  --json  Format output as json.

LIMITS FLAGS
  --max-cost=<value>             [env: POLYPOT_MAX_COST] Limit total estimated translation cost in USD.
  --max-strings-per-job=<value>  [env: POLYPOT_MAX_STRINGS_PER_JOB] Limit the number of strings translated per language
                                 (testing aid).
  --max-total-strings=<value>    [env: POLYPOT_MAX_TOTAL_STRINGS] Limit total strings translated across all languages.

DESCRIPTION
  Translate a .pot file into one or more languages using AI


  Reads source strings from a .pot file and writes translated .po files for
  each target language. Settings can be supplied via CLI flags, environment
  variables (POLYPOT_*), per-project config (.polypot/config.yaml), or the
  global config — flags win, then project .env, then global .env, then
  project YAML, then global YAML, then defaults.

  Phase 1 ships only the command surface and the layered-config wiring.
  The actual translation pipeline (AI calls, batching, cost estimation,
  .po writing) lands in Phase 2.


EXAMPLES
  $ polypot translate -l fr_FR,es_ES -p translations.pot

  $ polypot translate -l fr_FR -p translations.pot --dry-run

  $ polypot translate -l fr_FR -p translations.pot -b 30 -j 3
```
<!-- commandsstop -->

## Development

```bash
npm run build       # compile TypeScript to dist/
npm test            # run the test suite
npm run readme      # regenerate the commands table in this file
npm run lint        # type-check without emitting
```

## License

MIT
