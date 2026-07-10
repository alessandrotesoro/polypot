# Polypot

_AI-assisted gettext translation for WordPress projects_

[![CI](https://github.com/alessandrotesoro/polypot/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/alessandrotesoro/polypot/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40sematico%2Fpolypot?style=flat-square)](https://www.npmjs.com/package/@sematico/polypot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

Polypot turns WordPress `.pot` templates into ready-to-review `.po` files. It is built for plugin and theme localization workflows where you want AI translation, repeatable configuration, existing PO reuse, and enough validation to avoid shipping broken placeholders or malformed plural strings.

[Why Polypot](#why-polypot) | [Install](#install) | [Quick Start](#quick-start) | [Configuration](#configuration) | [Commands](#commands) | [Development](#development)

> [!IMPORTANT]
> Polypot `0.1.0` supports OpenAI for live translation. Dry runs, source-language copies, and fully reused existing translations can complete without provider calls.

## Why Polypot

- **Made for gettext files**: reads `.pot` sources, writes one `.po` file per target locale, and preserves gettext metadata that WordPress expects.
- **Careful before it writes**: plans output paths, detects collisions, avoids overwriting inputs, and validates placeholders and plural forms.
- **Reuses what you already have**: complete, non-fuzzy entries from existing PO files are merged before new translation work is planned.
- **Project-aware by default**: stores reusable prompt and YAML settings in `.polypot/`, while keeping secrets in ignored `.env` files.
- **Automation-friendly**: supports dry runs, JSON output, debug captures, batch sizing, parallel jobs, and translation limits.

## Install

```bash
npm install --global @sematico/polypot
polypot --version
```

### Requirements

- [Node.js](https://nodejs.org/) `>=22.13.0`
- npm
- An OpenAI API key when running live translations

## Quick Start

Configure the machine once:

```bash
polypot setup
```

Then initialize each WordPress project that has a POT file:

```bash
cd path/to/wp-content/plugins/example-plugin
polypot init
```

Preview the translation plan before spending tokens:

```bash
polypot translate \
  --pot-file-path languages/example-plugin.pot \
  --target-languages fr_FR,es_ES \
  --output-dir languages \
  --dry-run
```

Run the translation:

```bash
polypot translate \
  --pot-file-path languages/example-plugin.pot \
  --target-languages fr_FR,es_ES \
  --output-dir languages
```

## Configuration

Polypot resolves configuration from machine defaults, project defaults, environment files, environment variables, and command flags.

| Scope | Command | Files | Use it for |
| --- | --- | --- | --- |
| Machine | `polypot setup` | `<configDir>/config.yaml`, `<configDir>/.env` | Shared provider defaults and `OPENAI_API_KEY` |
| Project | `polypot init` | `.polypot/config.yaml`, `.polypot/prompt.md`, `.polypot/.env` | POT path, target locales, output rules, project prompt, optional local secret |

`<configDir>` resolves to `~/.config/polypot` on macOS/Linux and `%LOCALAPPDATA%\polypot` on Windows. Project values override machine values, and command flags override both.

> [!NOTE]
> `polypot init` adds `.polypot/.env` to `.gitignore` by default. Commit `.polypot/config.yaml` and `.polypot/prompt.md`; keep API keys out of git.

### Translation Behavior

`polypot translate` builds a plan before writing PO files. During that planning step it:

1. Reads the configured POT file.
2. Resolves target locales and output paths.
3. Loads existing PO files when available.
4. Reuses complete, non-fuzzy translations unless `--force-translate` is set.
5. Validates generated strings for gettext placeholders, shortcodes, plural forms, and response shape.
6. Writes target-specific `Language`, `PO-Revision-Date`, and `Plural-Forms` headers.

Same-base-language targets, such as `en_US` to `en_GB`, are copied locally because no translation provider is needed.

### Prompt And Dictionaries

Every project can carry its own translation style guide in `.polypot/prompt.md`. Edit that file to define tone, brand terminology, formatting rules, or WordPress-specific wording. Dictionary files can also be configured for consistent product and domain terminology across runs.

## Commands

<!-- commands -->
* [`polypot init`](#polypot-init)
* [`polypot setup`](#polypot-setup)
* [`polypot translate`](#polypot-translate)

## `polypot init`

Initialise polypot configuration in the current project

```
USAGE
  $ polypot init [--json] [-f] [--cwd <value>] [--gitignore] [-k <value>] [-o <value>] [-p <value>] [-s
    <value>] [-l <value>...] [-y]

FLAGS
  -f, --force                        [env: POLYPOT_FORCE] Overwrite existing .polypot/ files.
  -k, --api-key=<value>              [env: POLYPOT_API_KEY] Project OpenAI API key to store in .polypot/.env.
  -l, --target-languages=<value>...  [env: POLYPOT_TARGET_LANGUAGES] Default target language codes for this project.
  -o, --output-dir=<value>           [env: POLYPOT_OUTPUT_DIR] Default output directory for this project.
  -p, --pot-file-path=<value>        [env: POLYPOT_POT_FILE_PATH] Default .pot file path for this project.
  -s, --source-language=<value>      [env: POLYPOT_SOURCE_LANGUAGE] Default source language code for this project.
  -y, --yes                          [env: POLYPOT_YES] Accept defaults non-interactively.
      --cwd=<value>                  [env: POLYPOT_CWD] Target project directory (defaults to the current working
                                     directory).
  --[no-]gitignore                   [env: POLYPOT_GITIGNORE] Append .polypot/.env to the project .gitignore (default).

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Initialise polypot configuration in the current project


  Creates a .polypot directory in the target project with commit-ready
  config.yaml defaults and an optional local .env file for project secrets.

  Project config overrides global setup values at runtime. Project .env files
  are added to .gitignore by default.


EXAMPLES
  $ polypot init

  $ polypot init --yes

  $ polypot init --yes --source-language en_US --target-languages fr_FR,es_ES

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
      --show             [env: POLYPOT_SHOW] Print the resolved global config paths, non-secret config, and secret
                         presence.

DESCRIPTION
  Configure polypot defaults shared across all projects


  Manages the global polypot configuration stored in the OS-standard config
  directory (XDG_CONFIG_HOME on Linux/macOS, %APPDATA% on Windows).

  The wizard stores OpenAI credentials in the global .env file and writes
  non-secret defaults to the global YAML config.


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
    <value>] [-b <value>] [-j <value>] [--timeout <value>] [--max-strings-per-job <value>] [--max-total-strings <value>]
    [--max-retries <value>] [--retry-delay <value>] [--abort-on-failure] [--skip-language-on-failure] [-v <value>]
    [--dry-run] [--save-debug-info] [--config <value>] [--no-config] [--no-env]

BEHAVIOR FLAGS
  -F, --force-translate           [env: POLYPOT_FORCE_TRANSLATE] Re-translate all strings, ignoring any existing
                                  translations.
      --dictionary-path=<value>   [env: POLYPOT_DICTIONARY_PATH] Directory containing dictionary files.
      --prompt-file-path=<value>  [env: POLYPOT_PROMPT_FILE_PATH] Path to the prompt.md file containing translation
                                  instructions.
      --use-dictionary            [env: POLYPOT_USE_DICTIONARY] Use the dictionary system for consistent translations.

PERFORMANCE FLAGS
  -b, --batch-size=<value>  [env: POLYPOT_BATCH_SIZE] Strings per translation batch (1–100).
  -j, --jobs=<value>        [env: POLYPOT_JOBS] Max languages translated in parallel (1–10).
      --timeout=<value>     [env: POLYPOT_TIMEOUT] API request timeout in seconds (10–300).

PROVIDER FLAGS
  -k, --api-key=<value>          Provider API key.
  -m, --model=<value>            [env: POLYPOT_MODEL] AI model name (e.g. gpt-5.4-mini).
  -s, --source-language=<value>  [env: POLYPOT_SOURCE_LANGUAGE] Source language code.
      --max-tokens=<value>       [env: POLYPOT_MAX_TOKENS] Max completion tokens (1–32768).
      --provider=<value>         [env: POLYPOT_PROVIDER] AI provider (e.g. openai, gemini, anthropic).
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
      --output-format=<option>  [env: POLYPOT_OUTPUT_FORMAT] Output format.
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
  --max-retries=<value>       [env: POLYPOT_MAX_RETRIES] Retry attempts per batch (0–10).
  --retry-delay=<value>       [env: POLYPOT_RETRY_DELAY] Delay between retries in milliseconds (500–30000).
  --skip-language-on-failure  [env: POLYPOT_SKIP_LANGUAGE_ON_FAILURE] Skip current language on failure and continue with
                              remaining languages.

CONFIG FLAGS
  --config=<value>  [env: POLYPOT_CONFIG] Use this YAML file as the only config source (bypasses discovery).
  --no-config       [env: POLYPOT_NO_CONFIG] Ignore both YAML config files entirely; flags + .env only.
  --no-env          [env: POLYPOT_NO_ENV] Ignore both .env files; flags + YAML only.

GLOBAL FLAGS
  --json  Format output as json.

LIMITS FLAGS
  --max-strings-per-job=<value>  [env: POLYPOT_MAX_STRINGS_PER_JOB] Limit the number of strings translated per language
                                 (testing aid).
  --max-total-strings=<value>    [env: POLYPOT_MAX_TOTAL_STRINGS] Limit total strings translated across all languages.

DESCRIPTION
  Translate a .pot file into one or more languages using AI


  Reads source strings from a .pot file and writes translated .po files for
  each target language.


EXAMPLES
  $ polypot translate -l fr_FR,es_ES -p translations.pot

  $ polypot translate -l fr_FR -p translations.pot --dry-run

  $ polypot translate -l fr_FR -p translations.pot -b 30 -j 3
```
<!-- commandsstop -->

## Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/alessandrotesoro/polypot.git
cd polypot
npm install
```

Useful scripts:

```bash
npm run build      # compile TypeScript into dist/
npm test           # run the Mocha test suite
npm run check      # run Biome checks and TypeScript type checking
npm run readme     # refresh the generated command reference
```

During development, run the CLI with `./bin/run.js`:

```bash
./bin/run.js translate --help
```

The command reference above is generated by oclif. When command flags, descriptions, or examples change, run `npm run readme` and keep manual edits outside the generated command reference.

MIT licensed. See [LICENSE](LICENSE).

## Remarks

A from-scratch reimagining of [Potomatic](https://github.com/GravityKit/Potomatic) built on [OCLIF](https://oclif.io).
