import {
	readGlobalConfig,
	readGlobalSecrets,
	readPolypotConfigFile,
} from "./global-store.js";
import { type PolypotConfig, PolypotConfigSchema } from "./schema.js";
import { EMPTY_SECRETS, type PolypotSecrets } from "./secrets.js";

export interface LoadPolypotConfigOptions {
	readonly configPath?: string;
	readonly noConfig?: boolean;
	readonly noEnv?: boolean;
}

export interface LoadPolypotConfigArgs {
	readonly configDir: string;
	readonly cwd: string;
	readonly options?: LoadPolypotConfigOptions;
}

export interface PolypotRuntimeConfig {
	readonly config: PolypotConfig;
	readonly secrets: PolypotSecrets;
}

/**
 * Load config from the selected source.
 *
 * @param args Config loading arguments.
 * @returns Config from the selected source.
 */
function loadConfigSource(args: LoadPolypotConfigArgs): Promise<PolypotConfig> {
	if (args.options?.noConfig === true)
		return Promise.resolve(PolypotConfigSchema.parse({}));
	if (args.options?.configPath !== undefined)
		return readPolypotConfigFile(args.options.configPath);
	return readGlobalConfig({ configDir: args.configDir, cwd: args.cwd });
}

/**
 * Load secrets unless env loading is disabled.
 *
 * @param args Config loading arguments.
 * @returns Secrets from the selected source.
 */
function loadSecretsSource(
	args: LoadPolypotConfigArgs,
): Promise<PolypotSecrets> {
	if (args.options?.noEnv === true) return Promise.resolve(EMPTY_SECRETS);
	return readGlobalSecrets(args);
}

/**
 * Load app config for a command.
 *
 * @param args Config loading arguments.
 * @returns Loaded app config.
 */
export async function loadPolypotConfig(
	args: LoadPolypotConfigArgs,
): Promise<PolypotConfig> {
	return loadConfigSource(args);
}

/**
 * Load app config and secrets together.
 *
 * @param args Config loading arguments.
 * @returns Loaded config and secrets.
 */
export async function loadPolypotRuntimeConfig(
	args: LoadPolypotConfigArgs,
): Promise<PolypotRuntimeConfig> {
	const [config, secrets] = await Promise.all([
		loadConfigSource(args),
		loadSecretsSource(args),
	]);

	return {
		config,
		secrets,
	};
}
