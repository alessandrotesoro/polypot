# Polypot

*AI-powered translation for WordPress `.pot` files*

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.13-3c873a?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-blue?style=flat-square&logo=typescript&logoColor=white)
![oclif](https://img.shields.io/badge/CLI-oclif-7c3aed?style=flat-square)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

Polypot is a TypeScript CLI that turns gettext `.pot` templates into target `.po` files with AI-assisted translations. It is built for WordPress localization workflows where repeatability matters: configure once, initialize each project, then translate with preflight checks, existing translation reuse, and safe output planning.

[Features](#features) • [Getting Started](#getting-started) • [Configuration](#configuration) • [Commands](#commands) • [Development](#development)

> [!NOTE]
> Polypot currently supports OpenAI as the live translation provider. Same-base-language targets, such as `en_US` to `en_GB`, are copied locally without calling a provider.

## Features

- **POT to PO translation** - read source strings from `.pot` files and write one `.po` file per target language.
- **Existing translation reuse** - merge complete, non-fuzzy translations from existing PO files before planning new work.
- **Safe preflight planning** - block duplicate output paths, JSON/debug collisions, and writes that would overwrite input files.
- **WordPress-friendly locales** - normalize common names and aliases like `French`, `fr`, `fra`, and `fr-FR` to canonical locale values like `fr_FR`.
- **Prompt and dictionary controls** - customize project translation prompts and optionally load dictionary files for consistent terminology.
- **Dry runs and machine output** - inspect planned work without network calls and emit JSON for automation.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) `>=22.13.0`
- npm
- An OpenAI API key for live translation work

### Install From Source

```bash
git clone https://github.com/alessandrotesoro/polypot.git
cd polypot
npm install
npm run build
```

During local development, run the CLI through `./bin/run.js`. Once packaged or linked, use the `polypot` binary.

### Quick Start

```bash
# Store global OpenAI defaults on this machine
./bin/run.js setup

# Create project-local Polypot config
./bin/run.js init

# Preview work without calling the provider
./bin/run.js translate -l fr_FR,es_ES -p languages/plugin.pot --dry-run

# Translate and write target PO files
./bin/run.js translate -l fr_FR,es_ES -p languages/plugin.pot -o languages
```

## How It Works

`polypot translate` builds an execution plan before writing files. The plan reads the POT document, resolves config-sourced paths, checks output collisions, decides which existing translations can be reused, and determines whether provider work is actually required.

Existing PO files are reused by default. Complete, non-fuzzy entries are merged into the output; incomplete plurals, fuzzy entries, and previous dry-run placeholders are translated again. Use `--force-translate` when you want to ignore existing translations and regenerate everything.

Generated PO files preserve non-dynamic source headers and always write target-specific `Language`, `PO-Revision-Date`, and `Plural-Forms` headers. Polypot intentionally does not load custom PO header templates.

## Configuration

Polypot has two setup layers:

| Scope | Command | Files | Purpose |
| --- | --- | --- | --- |
| Machine | `polypot setup` | `<configDir>/config.yaml`, `<configDir>/.env` | Shared provider defaults and `OPENAI_API_KEY` |
| Project | `polypot init` | `.polypot/config.yaml`, `.polypot/prompt.md`, `.polypot/.env` | Project defaults, prompt, and optional project-local secret |

`<configDir>` resolves to `~/.config/polypot` on Linux/macOS and `%LOCALAPPDATA%\polypot` on Windows. Project YAML overrides global YAML at runtime, project `.env` overrides global `.env`, and `.polypot/.env` is added to `.gitignore` by default.

> [!TIP]
> Edit `.polypot/prompt.md` to tune translation style for a project, or point `behavior.promptFilePath` at another prompt file.

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

```bash
npm run build      # compile TypeScript to dist/
npm test           # run the test suite
npm run check      # run Biome checks and TypeScript type-checking
npm run readme     # regenerate the oclif command block
```

The command reference above is generated by oclif. When command flags, descriptions, or examples change, run `npm run readme` and keep manual README edits outside the generated command block.

Released under the [MIT License](LICENSE).
