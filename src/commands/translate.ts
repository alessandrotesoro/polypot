import fs from "node:fs/promises";
import path from "node:path";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../base-command.js";
import { DEFAULT_OPENAI_MODEL } from "../config/schema.js";
import { polypotEnv } from "../flag-helpers.js";
import {
	isSafeLanguageValue,
	LANGUAGE_VALUE_ERROR,
} from "../language-values.js";
import { sanitizeTerminalText } from "../terminal.js";
import {
	runTranslateUiPreview,
	type TranslateSettingsSnapshot,
} from "../translate/ui.js";

function getExplicitConfigProjectDirectory(configPath: string): string {
	const configDirectory = path.resolve(path.dirname(configPath));
	return path.basename(configDirectory) === ".polypot"
		? path.dirname(configDirectory)
		: configDirectory;
}

export default class Translate extends BaseCommand<typeof Translate> {
	static override summary =
		"Translate a .pot file into one or more languages using AI";
	static override description = `
Reads source strings from a .pot file and writes translated .po files for
each target language.
`;
	static override examples = [
		"<%= config.bin %> <%= command.id %> -l fr_FR,es_ES -p translations.pot",
		"<%= config.bin %> <%= command.id %> -l fr_FR -p translations.pot --dry-run",
		"<%= config.bin %> <%= command.id %> -l fr_FR -p translations.pot -b 30 -j 3",
	];

	static override enableJsonFlag = true;

	static override flags = {
		provider: Flags.string({
			summary: "AI provider (e.g. openai, gemini, anthropic).",
			env: polypotEnv("provider"),
			helpGroup: "PROVIDER",
		}),
		"api-key": Flags.string({
			char: "k",
			summary: "Provider API key.",
			helpGroup: "PROVIDER",
		}),
		model: Flags.string({
			char: "m",
			summary: `AI model name (e.g. ${DEFAULT_OPENAI_MODEL}).`,
			env: polypotEnv("model"),
			helpGroup: "PROVIDER",
		}),
		temperature: Flags.string({
			summary:
				"Sampling temperature (0.0–2.0). Lower = more deterministic.",
			env: polypotEnv("temperature"),
			helpGroup: "PROVIDER",
		}),
		"max-tokens": Flags.integer({
			summary: "Max completion tokens (1–32768).",
			env: polypotEnv("max-tokens"),
			helpGroup: "PROVIDER",
		}),
		"source-language": Flags.string({
			char: "s",
			summary: "Source language code.",
			env: polypotEnv("source-language"),
			helpGroup: "PROVIDER",
		}),

		"target-languages": Flags.string({
			char: "l",
			summary:
				"Target language codes, comma-separated (e.g. fr_FR,es_ES,de_DE).",
			multiple: true,
			delimiter: ",",
			env: polypotEnv("target-languages"),
			helpGroup: "SOURCE",
		}),
		"pot-file-path": Flags.string({
			char: "p",
			summary: "Path to the input .pot file containing source strings.",
			env: polypotEnv("pot-file-path"),
			helpGroup: "SOURCE",
		}),
		"input-po-path": Flags.string({
			summary:
				"Path to an existing .po file to use as a base for merging.",
			env: polypotEnv("input-po-path"),
			helpGroup: "SOURCE",
		}),

		"output-dir": Flags.string({
			char: "o",
			summary: "Directory to save generated .po files for each language.",
			env: polypotEnv("output-dir"),
			helpGroup: "OUTPUT",
		}),
		"output-format": Flags.option({
			options: ["console", "json"] as const,
			summary: "Output format.",
			env: polypotEnv("output-format"),
			helpGroup: "OUTPUT",
		})(),
		"output-file": Flags.string({
			summary: "Path to save JSON output (stdout when omitted).",
			env: polypotEnv("output-file"),
			helpGroup: "OUTPUT",
		}),
		"po-file-prefix": Flags.string({
			summary:
				'Prefix for each output .po file (e.g. "app-" → "app-fr_FR.po").',
			env: polypotEnv("po-file-prefix"),
			helpGroup: "OUTPUT",
		}),
		"locale-format": Flags.option({
			options: [
				"wp_locale",
				"iso_639_1",
				"iso_639_2",
				"target_lang",
			] as const,
			summary:
				"Filename locale format (controls output filename only, not input).",
			env: polypotEnv("locale-format"),
			helpGroup: "OUTPUT",
		})(),

		"force-translate": Flags.boolean({
			char: "F",
			summary:
				"Re-translate all strings, ignoring any existing translations.",
			env: polypotEnv("force-translate"),
			helpGroup: "BEHAVIOR",
		}),
		"use-dictionary": Flags.boolean({
			summary: "Use the dictionary system for consistent translations.",
			env: polypotEnv("use-dictionary"),
			helpGroup: "BEHAVIOR",
		}),
		"dictionary-path": Flags.string({
			summary: "Directory containing dictionary files.",
			env: polypotEnv("dictionary-path"),
			helpGroup: "BEHAVIOR",
		}),
		"prompt-file-path": Flags.string({
			summary:
				"Path to the prompt.md file containing translation instructions.",
			env: polypotEnv("prompt-file-path"),
			helpGroup: "BEHAVIOR",
		}),
		"po-header-template-path": Flags.string({
			summary:
				"Path to the po-header.json file containing custom PO file headers.",
			env: polypotEnv("po-header-template-path"),
			helpGroup: "BEHAVIOR",
		}),

		"batch-size": Flags.integer({
			char: "b",
			summary: "Strings per translation batch (1–100).",
			env: polypotEnv("batch-size"),
			helpGroup: "PERFORMANCE",
		}),
		jobs: Flags.integer({
			char: "j",
			summary: "Max languages translated in parallel (1–10).",
			env: polypotEnv("jobs"),
			helpGroup: "PERFORMANCE",
		}),
		timeout: Flags.integer({
			summary: "API request timeout in seconds (10–300).",
			env: polypotEnv("timeout"),
			helpGroup: "PERFORMANCE",
		}),

		"max-strings-per-job": Flags.integer({
			summary:
				"Limit the number of strings translated per language (testing aid).",
			env: polypotEnv("max-strings-per-job"),
			helpGroup: "LIMITS",
		}),
		"max-total-strings": Flags.integer({
			summary: "Limit total strings translated across all languages.",
			env: polypotEnv("max-total-strings"),
			helpGroup: "LIMITS",
		}),
		"max-cost": Flags.string({
			summary: "Limit total estimated translation cost in USD.",
			env: polypotEnv("max-cost"),
			helpGroup: "LIMITS",
		}),

		"max-retries": Flags.integer({
			summary: "Retry attempts per batch (0–10).",
			env: polypotEnv("max-retries"),
			helpGroup: "RETRIES",
		}),
		"retry-delay": Flags.integer({
			summary: "Delay between retries in milliseconds (500–30000).",
			env: polypotEnv("retry-delay"),
			helpGroup: "RETRIES",
		}),
		"abort-on-failure": Flags.boolean({
			summary:
				"Abort the entire run if any batch fails all retry attempts.",
			env: polypotEnv("abort-on-failure"),
			helpGroup: "RETRIES",
		}),
		"skip-language-on-failure": Flags.boolean({
			summary:
				"Skip current language on failure and continue with remaining languages.",
			env: polypotEnv("skip-language-on-failure"),
			helpGroup: "RETRIES",
		}),

		"verbose-level": Flags.integer({
			char: "v",
			summary: "Verbosity level: 0=errors, 1=normal, 2=verbose, 3=debug.",
			env: polypotEnv("verbose-level"),
			helpGroup: "DEBUG",
		}),
		"dry-run": Flags.boolean({
			summary: "Simulate translation without making actual API calls.",
			env: polypotEnv("dry-run"),
			helpGroup: "DEBUG",
		}),
		"save-debug-info": Flags.boolean({
			summary:
				"Save detailed request/response logs to timestamped files.",
			env: polypotEnv("save-debug-info"),
			helpGroup: "DEBUG",
		}),

		config: Flags.string({
			summary:
				"Use this YAML file as the only config source (bypasses discovery).",
			env: polypotEnv("config"),
			helpGroup: "CONFIG",
		}),
		"no-config": Flags.boolean({
			summary:
				"Ignore both YAML config files entirely; flags + .env only.",
			env: polypotEnv("no-config"),
			helpGroup: "CONFIG",
		}),
		"no-env": Flags.boolean({
			summary: "Ignore both .env files; flags + YAML only.",
			env: polypotEnv("no-env"),
			helpGroup: "CONFIG",
		}),
	};

	/**
	 * Run the translate command.
	 *
	 * @returns A promise for the result.
	 */
	public async run(): Promise<unknown> {
		const outputFormat =
			this.flags["output-format"] ?? this.appConfig.output.outputFormat;
		const outputFile =
			this.flags["output-file"] ?? this.appConfig.output.outputFile;
		const usesJsonStdout =
			this.jsonEnabled() ||
			(outputFormat === "json" && outputFile === undefined);
		const batchSize = this.resolveBoundedInteger(
			this.flags["batch-size"] ?? this.appConfig.performance.batchSize,
			"--batch-size",
			{ max: 100, min: 1 },
		);
		const jobs = this.resolveBoundedInteger(
			this.flags.jobs ?? this.appConfig.performance.jobs,
			"--jobs",
			{ max: 10, min: 1 },
		);
		const maxCost = this.resolveMaxCost();
		const maxStringsPerJob = this.resolveOptionalBoundedInteger(
			this.flags["max-strings-per-job"] ??
				this.appConfig.limits.maxStringsPerJob,
			"--max-strings-per-job",
			{ min: 1 },
		);
		const maxTotalStrings = this.resolveOptionalBoundedInteger(
			this.flags["max-total-strings"] ??
				this.appConfig.limits.maxTotalStrings,
			"--max-total-strings",
			{ min: 1 },
		);
		const poFilePrefix =
			this.flags["po-file-prefix"] ?? this.appConfig.output.poFilePrefix;
		const potFilePath = this.resolvePotFilePath();
		const verboseLevel =
			this.flags["verbose-level"] ?? this.appConfig.debug.verboseLevel;
		const languages = this.resolveTargetLanguages();
		const settings = this.buildSettingsSnapshot({
			batchSize,
			jobs,
			languages,
			outputFormat,
			...(maxCost !== undefined && { maxCost }),
			...(maxStringsPerJob !== undefined && { maxStringsPerJob }),
			...(maxTotalStrings !== undefined && { maxTotalStrings }),
			...(outputFile !== undefined && { outputFile }),
			...(poFilePrefix !== undefined && { poFilePrefix }),
			...(potFilePath !== undefined && { potFilePath }),
		});
		const result = await runTranslateUiPreview({
			config: {
				forceTranslate:
					this.flags["force-translate"] ??
					this.appConfig.behavior.forceTranslate,
				model: this.flags.model ?? this.appConfig.provider.model,
				...(potFilePath !== undefined && { potFilePath }),
				provider:
					this.flags.provider ?? this.appConfig.provider.provider,
			},
			settings,
			preview: {
				batchSize,
				dryRun: this.flags["dry-run"] ?? this.appConfig.debug.dryRun,
				jobs,
				languages,
				...(maxCost !== undefined && { maxCost }),
				...(maxStringsPerJob !== undefined && { maxStringsPerJob }),
				...(maxTotalStrings !== undefined && { maxTotalStrings }),
				outputDir:
					this.flags["output-dir"] ?? this.appConfig.output.outputDir,
				outputFormat: usesJsonStdout ? "json" : outputFormat,
				...(poFilePrefix !== undefined && { poFilePrefix }),
				sourceLanguage:
					this.flags["source-language"] ??
					this.appConfig.source.sourceLanguage,
				verboseLevel,
			},
		});

		const debugOutputFile = this.getDebugOutputFileIfRequested();
		const finalResult =
			debugOutputFile === undefined
				? result
				: { ...result, debugOutputFile };

		if (outputFile !== undefined) {
			await this.writeJsonOutput(outputFile, finalResult);
		}

		if (debugOutputFile !== undefined) {
			await this.writeJsonOutput(debugOutputFile, result);
		}

		if (!this.jsonEnabled()) {
			if (outputFormat === "json" && outputFile === undefined) {
				this.log(JSON.stringify(finalResult, null, 2));
			} else if (verboseLevel > 0) {
				this.log(result.summary);
				if (debugOutputFile !== undefined) {
					this.log(
						`Debug preview written to: ${sanitizeTerminalText(debugOutputFile)}`,
					);
				}
				if (outputFile !== undefined) {
					this.log(
						`JSON preview written to: ${sanitizeTerminalText(outputFile)}`,
					);
				}
			}
		}

		return finalResult;
	}

	private buildSettingsSnapshot(resolved: {
		readonly batchSize: number;
		readonly jobs: number;
		readonly languages: readonly string[];
		readonly maxCost?: number;
		readonly maxStringsPerJob?: number;
		readonly maxTotalStrings?: number;
		readonly outputFile?: string;
		readonly outputFormat: string;
		readonly poFilePrefix?: string;
		readonly potFilePath?: string;
	}): TranslateSettingsSnapshot {
		const inputPoPath =
			this.flags["input-po-path"] ?? this.appConfig.source.inputPoPath;
		const maxTokens =
			this.flags["max-tokens"] ?? this.appConfig.provider.maxTokens;
		return {
			behavior: {
				dictionaryPath:
					this.flags["dictionary-path"] ??
					this.appConfig.behavior.dictionaryPath,
				forceTranslate:
					this.flags["force-translate"] ??
					this.appConfig.behavior.forceTranslate,
				poHeaderTemplatePath:
					this.flags["po-header-template-path"] ??
					this.appConfig.behavior.poHeaderTemplatePath,
				promptFilePath:
					this.flags["prompt-file-path"] ??
					this.appConfig.behavior.promptFilePath,
				useDictionary:
					this.flags["use-dictionary"] ??
					this.appConfig.behavior.useDictionary,
			},
			debug: {
				dryRun: this.flags["dry-run"] ?? this.appConfig.debug.dryRun,
				saveDebugInfo:
					this.flags["save-debug-info"] ??
					this.appConfig.debug.saveDebugInfo,
				verboseLevel:
					this.flags["verbose-level"] ??
					this.appConfig.debug.verboseLevel,
			},
			limits: {
				...(resolved.maxCost !== undefined && {
					maxCost: resolved.maxCost,
				}),
				...(resolved.maxStringsPerJob !== undefined && {
					maxStringsPerJob: resolved.maxStringsPerJob,
				}),
				...(resolved.maxTotalStrings !== undefined && {
					maxTotalStrings: resolved.maxTotalStrings,
				}),
			},
			output: {
				localeFormat:
					this.flags["locale-format"] ??
					this.appConfig.output.localeFormat,
				outputDir:
					this.flags["output-dir"] ?? this.appConfig.output.outputDir,
				...(resolved.outputFile !== undefined && {
					outputFile: resolved.outputFile,
				}),
				outputFormat: resolved.outputFormat,
				...(resolved.poFilePrefix !== undefined && {
					poFilePrefix: resolved.poFilePrefix,
				}),
			},
			performance: {
				batchSize: resolved.batchSize,
				jobs: resolved.jobs,
				timeout:
					this.flags.timeout ?? this.appConfig.performance.timeout,
			},
			provider: {
				...(maxTokens !== undefined && { maxTokens }),
				model: this.flags.model ?? this.appConfig.provider.model,
				provider:
					this.flags.provider ?? this.appConfig.provider.provider,
				temperature:
					this.flags.temperature ??
					this.appConfig.provider.temperature,
			},
			retries: {
				abortOnFailure:
					this.flags["abort-on-failure"] ??
					this.appConfig.retries.abortOnFailure,
				maxRetries:
					this.flags["max-retries"] ??
					this.appConfig.retries.maxRetries,
				retryDelay:
					this.flags["retry-delay"] ??
					this.appConfig.retries.retryDelay,
				skipLanguageOnFailure:
					this.flags["skip-language-on-failure"] ??
					this.appConfig.retries.skipLanguageOnFailure,
			},
			source: {
				...(inputPoPath !== undefined && { inputPoPath }),
				...(resolved.potFilePath !== undefined && {
					potFilePath: resolved.potFilePath,
				}),
				sourceLanguage:
					this.flags["source-language"] ??
					this.appConfig.source.sourceLanguage,
				targetLanguages: resolved.languages,
			},
		};
	}

	private async writeJsonOutput(
		outputFile: string,
		result: unknown,
	): Promise<void> {
		const outputDirectory = path.dirname(outputFile);
		if (outputDirectory !== ".") {
			await fs.mkdir(outputDirectory, { recursive: true });
		}

		await fs.writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`);
	}

	private getDebugOutputFileIfRequested(): string | undefined {
		const saveDebugInfo =
			this.flags["save-debug-info"] ?? this.appConfig.debug.saveDebugInfo;
		if (!saveDebugInfo) return undefined;

		const debugDirectory = path.join(process.cwd(), ".polypot", "debug");
		return path.join(
			debugDirectory,
			`translate-preview-${new Date().toISOString().replaceAll(":", "-")}.json`,
		);
	}

	private resolveTargetLanguages(): readonly string[] {
		const languages =
			this.flags["target-languages"] ??
			this.appConfig.source.targetLanguages;
		const seenLanguages = new Set<string>();
		const unsafeLanguage = languages.find(
			(language) => !isSafeLanguageValue(language),
		);

		if (unsafeLanguage !== undefined) {
			this.error(
				`--target-languages includes unsafe value ${JSON.stringify(
					unsafeLanguage,
				)}. ${LANGUAGE_VALUE_ERROR}`,
				{ exit: 1 },
			);
		}

		const duplicateLanguage = languages.find((language) => {
			if (seenLanguages.has(language)) return true;
			seenLanguages.add(language);

			return false;
		});

		if (duplicateLanguage !== undefined) {
			this.error(
				`--target-languages includes duplicate value ${JSON.stringify(
					duplicateLanguage,
				)}.`,
				{ exit: 1 },
			);
		}

		return languages;
	}

	private resolvePotFilePath(): string | undefined {
		if (this.flags["pot-file-path"] !== undefined)
			return this.flags["pot-file-path"];

		const configuredPath = this.appConfig.source.potFilePath;
		if (configuredPath === undefined) return undefined;
		if (
			this.flags.config === undefined ||
			path.isAbsolute(configuredPath)
		) {
			return configuredPath;
		}

		return path.join(
			getExplicitConfigProjectDirectory(this.flags.config),
			configuredPath,
		);
	}

	private resolveBoundedInteger(
		value: number,
		flagName: string,
		bounds: { readonly max?: number; readonly min: number },
	): number {
		if (
			!Number.isInteger(value) ||
			value < bounds.min ||
			(bounds.max !== undefined && value > bounds.max)
		) {
			const rangeText =
				bounds.max === undefined
					? `greater than or equal to ${bounds.min}`
					: `between ${bounds.min} and ${bounds.max}`;
			this.error(`${flagName} must be an integer ${rangeText}.`, {
				exit: 1,
			});
		}

		return value;
	}

	private resolveOptionalBoundedInteger(
		value: number | undefined,
		flagName: string,
		bounds: { readonly max?: number; readonly min: number },
	): number | undefined {
		if (value === undefined) return undefined;

		return this.resolveBoundedInteger(value, flagName, bounds);
	}

	private resolveMaxCost(): number | undefined {
		if (this.flags["max-cost"] === undefined)
			return this.appConfig.limits.maxCost;

		const maxCostInput = this.flags["max-cost"].trim();
		const maxCost = Number(maxCostInput);
		if (!Number.isFinite(maxCost) || maxCost < 0) {
			this.error("--max-cost must be a non-negative number.", {
				exit: 1,
			});
		}

		return maxCost;
	}
}
