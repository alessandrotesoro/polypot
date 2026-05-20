import fs from "node:fs/promises";
import { Command, Flags } from "@oclif/core";
import {
	hasProjectStoreFiles,
	readProjectConfigInputStatus,
	readProjectSecrets,
	writeProjectConfig,
	writeProjectSecrets,
} from "../config/store.js";
import type { ResolveConfigPathsOptions } from "../config/paths.js";
import { resolveConfigPaths } from "../config/paths.js";
import type { PolypotConfig, PolypotConfigInput } from "../config/schema.js";
import { PolypotConfigSchema } from "../config/schema.js";
import { EMPTY_SECRETS } from "../config/secrets.js";
import { polypotEnv } from "../flag-helpers.js";
import { ensureProjectEnvGitignore } from "../init/gitignore.js";
import {
	buildInitConfig,
	collectInitAnswers,
	confirmInitUpdate,
	defaultInitAnswers,
	type InitAnswers,
} from "../init/prompts.js";

interface InitResult {
	readonly status: "cancelled" | "saved";
	readonly projectConfig: string;
	readonly projectSecrets: string;
	readonly openaiApiKey: "missing" | "present";
	readonly gitignore: "skipped" | ".polypot/.env";
}

interface ExistingProjectConfig {
	readonly config: PolypotConfig;
	readonly input: PolypotConfigInput;
}

const EMPTY_PROJECT_CONFIG: ExistingProjectConfig = {
	config: PolypotConfigSchema.parse({}),
	input: {},
};

function normalizeTargetLanguages(
	value: readonly string[] | string,
): readonly string[] {
	return typeof value === "string" ? value.split(",") : value;
}

/**
 * Initialize project-level Polypot config.
 */
export default class Init extends Command {
	static override summary =
		"Initialise polypot configuration in the current project";
	static override description = `
Creates a .polypot directory in the target project with commit-ready
config.yaml defaults and an optional local .env file for project secrets.

Project config overrides global setup values at runtime. Project .env files
are added to .gitignore by default.
`;
	static override examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --yes",
		"<%= config.bin %> <%= command.id %> --yes --source-language en_US --target-languages fr_FR,es_ES",
		"<%= config.bin %> <%= command.id %> --no-gitignore",
		"<%= config.bin %> <%= command.id %> --cwd /path/to/project",
	];

	static override enableJsonFlag = true;

	static override flags = {
		force: Flags.boolean({
			char: "f",
			summary: "Overwrite existing .polypot/ files.",
			env: polypotEnv("force"),
		}),
		cwd: Flags.string({
			summary:
				"Target project directory (defaults to the current working directory).",
			defaultHelp: "process.cwd()",
			env: polypotEnv("cwd"),
		}),
		gitignore: Flags.boolean({
			default: true,
			allowNo: true,
			helpLabel: "--[no-]gitignore",
			summary:
				"Append .polypot/.env to the project .gitignore (default).",
			env: polypotEnv("gitignore"),
		}),
		"api-key": Flags.string({
			char: "k",
			summary: "Project OpenAI API key to store in .polypot/.env.",
			env: polypotEnv("api-key"),
		}),
		"output-dir": Flags.string({
			char: "o",
			summary: "Default output directory for this project.",
			env: polypotEnv("output-dir"),
		}),
		"pot-file-path": Flags.string({
			char: "p",
			summary: "Default .pot file path for this project.",
			env: polypotEnv("pot-file-path"),
		}),
		"source-language": Flags.string({
			char: "s",
			summary: "Default source language code for this project.",
			env: polypotEnv("source-language"),
		}),
		"target-languages": Flags.string({
			char: "l",
			delimiter: ",",
			multiple: true,
			summary: "Default target language codes for this project.",
			env: polypotEnv("target-languages"),
		}),
		yes: Flags.boolean({
			char: "y",
			summary: "Accept defaults non-interactively.",
			env: polypotEnv("yes"),
		}),
	};

	/**
	 * Run the init command.
	 */
	public async run(): Promise<InitResult> {
		const { flags } = await this.parse(Init);
		const targetCwd = flags.cwd ?? process.cwd();
		await this.assertTargetDirectory(targetCwd);

		const storeOptions = {
			configDir: this.config.configDir,
			cwd: targetCwd,
		};
		const paths = resolveConfigPaths(storeOptions);

		const hasExistingFiles = await hasProjectStoreFiles(storeOptions);
		if (hasExistingFiles && !flags.force) {
			if (flags.yes || !(await confirmInitUpdate())) {
				const result = this.buildResult({
					gitignore: flags.gitignore,
					hasApiKey: (await readProjectSecrets(storeOptions))
						.hasOpenaiApiKey,
					paths,
					status: "cancelled",
				});
				this.logResult(
					result,
					"Init cancelled. Existing project config was not changed.",
				);
				return result;
			}
		}

		const [existingConfig, existingSecrets] = hasExistingFiles
			? await Promise.all([
					this.readExistingProjectConfig(flags.force, storeOptions),
					readProjectSecrets(storeOptions),
				])
			: [EMPTY_PROJECT_CONFIG, EMPTY_SECRETS];
		const baseAnswers = flags.yes
			? defaultInitAnswers(existingConfig.config)
			: await collectInitAnswers(existingConfig.config, existingSecrets);
		const answers = this.applyFlagAnswers(baseAnswers, flags);

		if (flags.gitignore) await ensureProjectEnvGitignore(targetCwd);

		await writeProjectConfig({
			...storeOptions,
			config: buildInitConfig(existingConfig.input, answers),
		});
		if (answers.openaiApiKey !== undefined) {
			await writeProjectSecrets({
				...storeOptions,
				secrets: { openaiApiKey: answers.openaiApiKey },
			});
		}
		const hasApiKey =
			answers.openaiApiKey !== undefined ||
			existingSecrets.hasOpenaiApiKey;
		const result = this.buildResult({
			gitignore: flags.gitignore,
			hasApiKey,
			paths,
			status: "saved",
		});
		this.logResult(result, "Project Polypot config saved.");
		return result;
	}

	private applyFlagAnswers(
		answers: InitAnswers,
		flags: {
			readonly "api-key"?: string | undefined;
			readonly "output-dir"?: string | undefined;
			readonly "pot-file-path"?: string | undefined;
			readonly "source-language"?: string | undefined;
			readonly "target-languages"?:
				| readonly string[]
				| string
				| undefined;
		},
	): InitAnswers {
		return {
			...answers,
			...(flags["api-key"] !== undefined && {
				openaiApiKey: flags["api-key"],
			}),
			...(flags["output-dir"] !== undefined && {
				outputDir: flags["output-dir"],
			}),
			...(flags["pot-file-path"] !== undefined && {
				potFilePath: flags["pot-file-path"],
			}),
			...(flags["source-language"] !== undefined && {
				sourceLanguage: flags["source-language"],
			}),
			...(flags["target-languages"] !== undefined && {
				targetLanguages: normalizeTargetLanguages(
					flags["target-languages"],
				),
			}),
		};
	}

	private buildResult(options: {
		readonly gitignore: boolean;
		readonly hasApiKey: boolean;
		readonly paths: ReturnType<typeof resolveConfigPaths>;
		readonly status: InitResult["status"];
	}): InitResult {
		return {
			gitignore: options.gitignore ? ".polypot/.env" : "skipped",
			openaiApiKey: options.hasApiKey ? "present" : "missing",
			projectConfig: options.paths.projectYaml,
			projectSecrets: options.paths.projectEnv,
			status: options.status,
		};
	}

	private logResult(result: InitResult, message: string): void {
		if (this.jsonEnabled()) return;
		this.log(message);
		this.log(`project config: ${result.projectConfig}`);
		this.log(`project secrets: ${result.projectSecrets}`);
		this.log(`OPENAI_API_KEY: ${result.openaiApiKey}`);
		if (result.gitignore !== "skipped")
			this.log(`gitignore: ${result.gitignore}`);
	}

	/**
	 * Ensure the target path is an existing directory.
	 *
	 * @param targetCwd Target project directory.
	 */
	private async assertTargetDirectory(targetCwd: string): Promise<void> {
		let stat: Awaited<ReturnType<typeof fs.stat>>;
		try {
			stat = await fs.stat(targetCwd);
		} catch (error) {
			this.error(
				`Cannot initialize Polypot in ${targetCwd}: ${error instanceof Error ? error.message : String(error)}`,
				{ exit: 1 },
			);
		}
		if (!stat.isDirectory()) {
			this.error(`Target path is not a directory: ${targetCwd}`, {
				exit: 1,
			});
		}
	}

	/**
	 * Read project config, falling back when force allows it.
	 *
	 * @param force Whether malformed config may be ignored.
	 * @param storeOptions Config path options.
	 * @returns A promise for the result.
	 */
	private async readExistingProjectConfig(
		force: boolean,
		storeOptions: ResolveConfigPathsOptions,
	): Promise<ExistingProjectConfig> {
		try {
			const input = (await readProjectConfigInputStatus(storeOptions))
				.config;
			return {
				config: PolypotConfigSchema.parse(input),
				input,
			};
		} catch (error) {
			if (!force) throw error;
			this.warn(
				`${error instanceof Error ? error.message : String(error)}. Continuing with defaults because --force was provided.`,
			);
			return {
				config: PolypotConfigSchema.parse({}),
				input: {},
			};
		}
	}
}
