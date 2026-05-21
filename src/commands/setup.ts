import { Command, Flags } from "@oclif/core";
import YAML from "yaml";
import type { ResolveConfigPathsOptions } from "../config/paths.js";
import { resolveConfigPaths } from "../config/paths.js";
import type { PolypotConfig } from "../config/schema.js";
import { PolypotConfigSchema } from "../config/schema.js";
import {
	hasGlobalStoreFiles,
	readGlobalConfig,
	readGlobalConfigStatus,
	readGlobalSecrets,
	writeGlobalConfig,
	writeGlobalSecrets,
} from "../config/store.js";
import { polypotEnv } from "../flag-helpers.js";
import { validateOpenAIConnection } from "../providers/openai/connection.js";
import {
	buildSetupConfig,
	collectSetupAnswers,
	confirmSetupUpdate,
} from "../setup/prompts.js";

/**
 * Run global setup and config display flows.
 */
export default class Setup extends Command {
	static override summary =
		"Configure polypot defaults shared across all projects";
	static override description = `
Manages the global polypot configuration stored in the OS-standard config
directory (XDG_CONFIG_HOME on Linux/macOS, %APPDATA% on Windows).

The wizard stores OpenAI credentials in the global .env file and writes
non-secret defaults to the global YAML config.
`;
	static override examples = [
		"<%= config.bin %> <%= command.id %>",
		"<%= config.bin %> <%= command.id %> --show",
		"<%= config.bin %> <%= command.id %> --force",
	];

	static override flags = {
		force: Flags.boolean({
			char: "f",
			summary: "Overwrite existing global config without prompting.",
			env: polypotEnv("force"),
		}),
		show: Flags.boolean({
			summary:
				"Print the resolved global config paths, non-secret config, and secret presence.",
			env: polypotEnv("show"),
		}),
		"non-interactive": Flags.boolean({
			summary:
				"Skip prompts; useful for scripted setup. Errors out on prompt-only flows.",
			env: polypotEnv("non-interactive"),
		}),
	};

	/**
	 * Run the setup command.
	 */
	public async run(): Promise<void> {
		const { flags } = await this.parse(Setup);
		const storeOptions = {
			configDir: this.config.configDir,
			cwd: process.cwd(),
		};
		const paths = resolveConfigPaths(storeOptions);

		if (flags.show) {
			const [{ config, exists: hasGlobalConfig }, secrets] =
				await Promise.all([
					readGlobalConfigStatus(storeOptions),
					readGlobalSecrets(storeOptions),
				]);
			this.log(`global config: ${paths.globalYaml}`);
			this.log(`global secrets: ${paths.globalEnv}`);
			this.log(
				`OPENAI_API_KEY: ${secrets.hasOpenaiApiKey ? "present" : "missing"}`,
			);
			if (hasGlobalConfig) {
				this.log("global config contents:");
				this.log(YAML.stringify(config).trimEnd());
			}
			return;
		}

		if (flags["non-interactive"]) {
			this.error(
				"polypot setup is interactive. Remove --non-interactive or edit the global config files directly.",
				{
					exit: 1,
				},
			);
		}

		const hasExistingFiles = await hasGlobalStoreFiles(storeOptions);
		if (hasExistingFiles && !flags.force && !(await confirmSetupUpdate())) {
			this.log(
				"Setup cancelled. Existing global config was not changed.",
			);
			return;
		}

		const [existingConfig, existingSecrets] = await Promise.all([
			this.readExistingConfig(flags.force, storeOptions),
			readGlobalSecrets(storeOptions),
		]);
		const answers = await collectSetupAnswers(
			existingConfig,
			existingSecrets,
		);

		if (answers.validateConnection && answers.openaiApiKey !== undefined) {
			const validation = await validateOpenAIConnection(
				answers.openaiApiKey,
			);
			if (!validation.ok) this.error(validation.message, { exit: 1 });
		}

		const nextConfig = buildSetupConfig(existingConfig, answers);
		await writeGlobalConfig({ ...storeOptions, config: nextConfig });
		if (answers.openaiApiKey !== undefined) {
			await writeGlobalSecrets({
				...storeOptions,
				secrets: { openaiApiKey: answers.openaiApiKey },
			});
		}

		this.log("Global Polypot setup saved.");
		this.log(`global config: ${paths.globalYaml}`);
		this.log(`global secrets: ${paths.globalEnv}`);
		this.log(
			`OPENAI_API_KEY: ${answers.openaiApiKey === undefined && !existingSecrets.hasOpenaiApiKey ? "missing" : "present"}`,
		);
	}

	/**
	 * Read global config, falling back when force allows it.
	 *
	 * @param force Whether malformed config may be ignored.
	 * @param storeOptions Config path options.
	 * @returns A promise for the result.
	 */
	private async readExistingConfig(
		force: boolean,
		storeOptions: ResolveConfigPathsOptions,
	): Promise<PolypotConfig> {
		try {
			return await readGlobalConfig(storeOptions);
		} catch (error) {
			if (!force) throw error;
			this.warn(
				`${error instanceof Error ? error.message : String(error)}. Continuing with defaults because --force was provided.`,
			);
			return PolypotConfigSchema.parse({});
		}
	}
}
