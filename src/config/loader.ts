import path from "node:path";
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
	readonly sources: PolypotRuntimeConfigSources;
	readonly secrets: PolypotSecrets;
}

export type ConfigPathKey =
	| "behavior.dictionaryPath"
	| "behavior.poHeaderTemplatePath"
	| "behavior.promptFilePath"
	| "output.outputDir"
	| "output.outputFile"
	| "source.inputPoPath"
	| "source.potFilePath";

export interface ConfigValueSource {
	readonly filePath: string;
	readonly kind: "explicit" | "global" | "project";
	readonly rootDir: string;
}

export interface PolypotRuntimeConfigSources {
	readonly paths: Partial<Record<ConfigPathKey, ConfigValueSource>>;
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

function explicitConfigProjectDirectory(configPath: string): string {
	const configDirectory = path.resolve(path.dirname(configPath));
	return path.basename(configDirectory) === ".polypot"
		? path.dirname(configDirectory)
		: configDirectory;
}

function hasPathValue(config: PolypotConfigInput, key: ConfigPathKey): boolean {
	if (!isRecord(config)) return false;
	const [section, field] = key.split(".") as [
		keyof PolypotConfigInput,
		string,
	];
	const sectionValue = config[section];
	return isRecord(sectionValue) && field in sectionValue;
}

function collectPathSources(
	layers: readonly {
		readonly config: PolypotConfigInput;
		readonly source: ConfigValueSource;
	}[],
): PolypotRuntimeConfigSources {
	const keys: readonly ConfigPathKey[] = [
		"behavior.dictionaryPath",
		"behavior.poHeaderTemplatePath",
		"behavior.promptFilePath",
		"output.outputDir",
		"output.outputFile",
		"source.inputPoPath",
		"source.potFilePath",
	];
	const paths: Partial<Record<ConfigPathKey, ConfigValueSource>> = {};

	for (const layer of layers) {
		for (const key of keys) {
			if (hasPathValue(layer.config, key)) paths[key] = layer.source;
		}
	}

	return { paths };
}

async function loadConfigInputWithSources(
	args: LoadPolypotConfigArgs,
): Promise<{
	readonly input: PolypotConfigInput;
	readonly sources: PolypotRuntimeConfigSources;
}> {
	if (args.options?.noConfig === true) {
		return { input: {}, sources: { paths: {} } };
	}

	if (args.options?.configPath !== undefined) {
		const input = await readPolypotConfigFileInput(args.options.configPath);
		return {
			input,
			sources: collectPathSources([
				{
					config: input,
					source: {
						filePath: args.options.configPath,
						kind: "explicit",
						rootDir: explicitConfigProjectDirectory(
							args.options.configPath,
						),
					},
				},
			]),
		};
	}

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
	const layers = [
		{
			config: globalConfig.config,
			source: {
				filePath: globalConfig.filePath,
				kind: "global" as const,
				rootDir: globalConfig.rootDir,
			},
		},
		{
			config: projectConfig.config,
			source: {
				filePath: projectConfig.filePath,
				kind: "project" as const,
				rootDir: projectConfig.rootDir,
			},
		},
	];

	return {
		input: mergeConfigInputs(globalConfig.config, projectConfig.config),
		sources: collectPathSources(layers),
	};
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
	return (await loadConfigInputWithSources(args)).input;
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
		loadConfigInputWithSources(args),
		loadSecretsSource(args),
	]);

	return {
		config: PolypotConfigSchema.parse(configInput.input),
		sources: configInput.sources,
		secrets,
	};
}
