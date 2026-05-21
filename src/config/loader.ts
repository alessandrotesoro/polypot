import {
	type PolypotConfig,
	type PolypotConfigInput,
	PolypotConfigSchema,
} from "./schema.js";
import {
	createPolypotSecrets,
	EMPTY_SECRETS,
	type PolypotSecrets,
} from "./secrets.js";
import {
	readGlobalConfigInputStatus,
	readGlobalSecrets,
	readPolypotConfigFileInput,
	readProjectConfigInputStatus,
	readProjectSecrets,
} from "./store.js";

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
 * Check whether a value is a plain object.
 *
 * @param value Value to inspect.
 * @returns True when the value is mergeable.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge records without treating schema defaults as overrides.
 *
 * @param base Lower-precedence record.
 * @param override Higher-precedence record.
 * @returns Merged record.
 */
function mergeRecords(
	base: Record<string, unknown>,
	override: Record<string, unknown>,
): Record<string, unknown> {
	const next: Record<string, unknown> = { ...base };

	for (const [key, value] of Object.entries(override)) {
		const current = next[key];
		next[key] =
			isRecord(current) && isRecord(value)
				? mergeRecords(current, value)
				: value;
	}

	return next;
}

/**
 * Deep-merge config layers without treating schema defaults as overrides.
 *
 * @param layers Config layers from lowest to highest precedence.
 * @returns Merged config input.
 */
function mergeConfigInputs(
	...layers: readonly PolypotConfigInput[]
): PolypotConfigInput {
	return layers.reduce<PolypotConfigInput>((merged, layer) => {
		if (!isRecord(merged) || !isRecord(layer)) return layer;
		return mergeRecords(merged, layer) as PolypotConfigInput;
	}, {});
}

/**
 * Load config input from the selected source.
 *
 * @param args Config loading arguments.
 * @returns Config input from the selected source.
 */
async function loadConfigInputSource(
	args: LoadPolypotConfigArgs,
): Promise<PolypotConfigInput> {
	if (args.options?.noConfig === true) return {};
	if (args.options?.configPath !== undefined)
		return readPolypotConfigFileInput(args.options.configPath);

	const [globalConfig, projectConfig] = await Promise.all([
		readGlobalConfigInputStatus({
			configDir: args.configDir,
			cwd: args.cwd,
		}),
		readProjectConfigInputStatus({
			configDir: args.configDir,
			cwd: args.cwd,
		}),
	]);

	return mergeConfigInputs(globalConfig.config, projectConfig.config);
}

/**
 * Load secrets unless env loading is disabled.
 *
 * @param args Config loading arguments.
 * @returns Secrets from the selected source.
 */
async function loadSecretsSource(
	args: LoadPolypotConfigArgs,
): Promise<PolypotSecrets> {
	if (args.options?.noEnv === true) return EMPTY_SECRETS;

	const [globalSecrets, projectSecrets] = await Promise.all([
		readGlobalSecrets(args),
		readProjectSecrets(args),
	]);

	return createPolypotSecrets(
		projectSecrets.openaiApiKey ?? globalSecrets.openaiApiKey,
	);
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
	return PolypotConfigSchema.parse(await loadConfigInputSource(args));
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
	const [configInput, secrets] = await Promise.all([
		loadConfigInputSource(args),
		loadSecretsSource(args),
	]);

	return {
		config: PolypotConfigSchema.parse(configInput),
		secrets,
	};
}
