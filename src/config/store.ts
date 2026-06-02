import fs from "node:fs/promises";
import path from "node:path";
import { configDotenv } from "dotenv";
import YAML from "yaml";
import { isMissingFileError, readOptionalUtf8File } from "../files.js";
import { type ResolveConfigPathsOptions, resolveConfigPaths } from "./paths.js";
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

const DIRECTORY_MODE = 0o700;
const CONFIG_FILE_MODE = 0o600;
const PROJECT_DIRECTORY_MODE = 0o755;
const PROJECT_CONFIG_FILE_MODE = 0o644;
const ENV_FILE_MODE = 0o600;

interface StorePaths {
	readonly config: string;
	readonly configDirectory: string;
	readonly configFileMode: number;
	readonly directoryMode: number;
	readonly env: string;
	readonly label: string;
}

interface ConfigStatus {
	readonly config: PolypotConfig;
	readonly exists: boolean;
}

interface ConfigInputStatus {
	readonly config: PolypotConfigInput;
	readonly exists: boolean;
	readonly filePath: string;
	readonly rootDir: string;
}

/**
 * Resolve global store paths.
 *
 * @param options Options for the operation.
 * @returns Global store paths.
 */
function globalStorePaths(options: ResolveConfigPathsOptions): StorePaths {
	const paths = resolveConfigPaths(options);
	return {
		config: paths.globalYaml,
		configDirectory: options.configDir,
		configFileMode: CONFIG_FILE_MODE,
		directoryMode: DIRECTORY_MODE,
		env: paths.globalEnv,
		label: "global",
	};
}

/**
 * Resolve project store paths.
 *
 * @param options Options for the operation.
 * @returns Project store paths.
 */
function projectStorePaths(options: ResolveConfigPathsOptions): StorePaths {
	const paths = resolveConfigPaths(options);
	return {
		config: paths.projectYaml,
		configDirectory: path.dirname(paths.projectYaml),
		configFileMode: PROJECT_CONFIG_FILE_MODE,
		directoryMode: PROJECT_DIRECTORY_MODE,
		env: paths.projectEnv,
		label: "project",
	};
}

/**
 * Check whether a path can be accessed.
 *
 * @param path File path to check or write.
 * @returns True when the path is accessible.
 */
async function pathExists(path: string): Promise<boolean> {
	try {
		await fs.access(path);
		return true;
	} catch (error) {
		if (isMissingFileError(error)) return false;
		throw error;
	}
}

/**
 * Create the config directory.
 *
 * @param directory Directory that stores config files.
 * @param mode POSIX directory mode.
 */
async function ensureConfigDir(directory: string, mode: number): Promise<void> {
	await fs.mkdir(directory, { recursive: true, mode });
	const stat = await fs.lstat(directory);
	if (stat.isSymbolicLink()) {
		throw new Error(
			`Refusing to use symlinked config directory: ${directory}`,
		);
	}
	if (!stat.isDirectory()) {
		throw new Error(`Config path is not a directory: ${directory}`);
	}
	await fs.chmod(directory, mode).catch(() => {});
}

/**
 * Fail before writing through a symlink.
 *
 * @param filePath File path to inspect.
 */
async function assertWritableStorePath(filePath: string): Promise<void> {
	try {
		const stat = await fs.lstat(filePath);
		if (stat.isSymbolicLink()) {
			throw new Error(`Refusing to write through symlink: ${filePath}`);
		}
		if (!stat.isFile()) {
			throw new Error(`Store path is not a file: ${filePath}`);
		}
	} catch (error) {
		if (isMissingFileError(error)) return;
		throw error;
	}
}

/**
 * Write a config or secret file.
 *
 * @param directory Directory that stores config files.
 * @param filePath File path to check or write.
 * @param contents File contents to write.
 * @param mode POSIX file mode to apply.
 * @param directoryMode POSIX directory mode.
 */
async function writeStoreFile(
	directory: string,
	filePath: string,
	contents: string,
	mode: number,
	directoryMode: number,
): Promise<void> {
	await ensureConfigDir(directory, directoryMode);
	await assertWritableStorePath(filePath);

	const tempPath = path.join(
		directory,
		`.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
			.toString(16)
			.slice(2)}.tmp`,
	);

	try {
		await fs.writeFile(tempPath, contents, { flag: "wx", mode });
		await fs.chmod(tempPath, mode).catch(() => {});
		await fs.rename(tempPath, filePath);
	} catch (error) {
		await fs.rm(tempPath, { force: true }).catch(() => {});
		throw error;
	}
}

/**
 * Convert an unknown error to text.
 *
 * @param error Error to inspect.
 * @returns A readable error message.
 */
function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Parse YAML into config input without applying defaults.
 *
 * @param raw Raw YAML text.
 * @returns Parsed Polypot config input.
 */
function parsePolypotConfigInput(raw: string): PolypotConfigInput {
	return (YAML.parse(raw) ?? {}) as PolypotConfigInput;
}

/**
 * Read config input from an explicit path without applying defaults.
 *
 * @param configPath Config file path.
 * @returns Parsed config input from the file.
 */
export async function readPolypotConfigFileInput(
	configPath: string,
): Promise<PolypotConfigInput> {
	try {
		const config = parsePolypotConfigInput(
			await fs.readFile(configPath, "utf8"),
		);
		PolypotConfigSchema.parse(config);
		return config;
	} catch (error) {
		throw new Error(
			`Failed to read config at ${configPath}: ${formatError(error)}`,
		);
	}
}

/**
 * Read store config input and report whether the file exists.
 *
 * @param paths Store paths.
 * @returns Config input and existence state.
 */
async function readStoreConfigInputStatus(
	paths: StorePaths,
): Promise<ConfigInputStatus> {
	try {
		const raw = await readOptionalUtf8File(paths.config);
		if (raw === undefined)
			return {
				config: {},
				exists: false,
				filePath: paths.config,
				rootDir:
					paths.label === "project"
						? path.dirname(paths.configDirectory)
						: paths.configDirectory,
			};
		const config = parsePolypotConfigInput(raw);
		PolypotConfigSchema.parse(config);
		return {
			config,
			exists: true,
			filePath: paths.config,
			rootDir:
				paths.label === "project"
					? path.dirname(paths.configDirectory)
					: paths.configDirectory,
		};
	} catch (error) {
		throw new Error(
			`Failed to read ${paths.label} config at ${paths.config}: ${formatError(error)}`,
		);
	}
}

/**
 * Read store config and report whether the file exists.
 *
 * @param paths Store paths.
 * @returns Config and existence state.
 */
async function readStoreConfigStatus(paths: StorePaths): Promise<ConfigStatus> {
	const status = await readStoreConfigInputStatus(paths);
	return {
		config: PolypotConfigSchema.parse(status.config),
		exists: status.exists,
	};
}

/**
 * Read global config and report whether the file exists.
 *
 * @param options Options for the operation.
 * @returns Global config and existence state.
 */
export async function readGlobalConfigStatus(
	options: ResolveConfigPathsOptions,
): Promise<ConfigStatus> {
	return readStoreConfigStatus(globalStorePaths(options));
}

/**
 * Read global config, using defaults when it is missing.
 *
 * @param options Options for the operation.
 * @returns Global config with defaults applied.
 */
export async function readGlobalConfig(
	options: ResolveConfigPathsOptions,
): Promise<PolypotConfig> {
	return (await readGlobalConfigStatus(options)).config;
}

/**
 * Read global config input without applying defaults.
 *
 * @param options Options for the operation.
 * @returns Global config input and existence state.
 */
export async function readGlobalConfigInputStatus(
	options: ResolveConfigPathsOptions,
): Promise<ConfigInputStatus> {
	return readStoreConfigInputStatus(globalStorePaths(options));
}

/**
 * Read project config and report whether the file exists.
 *
 * @param options Options for the operation.
 * @returns Project config and existence state.
 */
export async function readProjectConfigStatus(
	options: ResolveConfigPathsOptions,
): Promise<ConfigStatus> {
	return readStoreConfigStatus(projectStorePaths(options));
}

/**
 * Read project config, using defaults when it is missing.
 *
 * @param options Options for the operation.
 * @returns Project config with defaults applied.
 */
export async function readProjectConfig(
	options: ResolveConfigPathsOptions,
): Promise<PolypotConfig> {
	return (await readProjectConfigStatus(options)).config;
}

/**
 * Read project config input without applying defaults.
 *
 * @param options Options for the operation.
 * @returns Project config input and existence state.
 */
export async function readProjectConfigInputStatus(
	options: ResolveConfigPathsOptions,
): Promise<ConfigInputStatus> {
	return readStoreConfigInputStatus(projectStorePaths(options));
}

/**
 * Check whether any global config files exist.
 *
 * @param options Options for the operation.
 * @returns True when a global config or env file exists.
 */
export async function hasGlobalStoreFiles(
	options: ResolveConfigPathsOptions,
): Promise<boolean> {
	return hasStoreFiles(globalStorePaths(options));
}

async function hasStoreFiles(paths: StorePaths): Promise<boolean> {
	const [hasConfig, hasSecrets] = await Promise.all([
		pathExists(paths.config),
		pathExists(paths.env),
	]);
	return hasConfig || hasSecrets;
}

/**
 * Check whether any project config files exist.
 *
 * @param options Options for the operation.
 * @returns True when a project config or env file exists.
 */
export async function hasProjectStoreFiles(
	options: ResolveConfigPathsOptions,
): Promise<boolean> {
	return hasStoreFiles(projectStorePaths(options));
}

/**
 * Write validated global config to YAML.
 *
 * @param options Options for the operation.
 */
export async function writeGlobalConfig(
	options: ResolveConfigPathsOptions & {
		readonly config: PolypotConfigInput;
	},
): Promise<void> {
	const paths = globalStorePaths(options);
	const config = PolypotConfigSchema.parse(options.config);
	const yaml = YAML.stringify(config);

	try {
		await writeStoreFile(
			paths.configDirectory,
			paths.config,
			yaml,
			paths.configFileMode,
			paths.directoryMode,
		);
	} catch (error) {
		throw new Error(
			`Failed to write global config at ${paths.config}: ${formatError(error)}`,
		);
	}
}

/**
 * Write validated project config to YAML.
 *
 * @param options Options for the operation.
 */
export async function writeProjectConfig(
	options: ResolveConfigPathsOptions & {
		readonly config: PolypotConfigInput;
	},
): Promise<void> {
	const paths = projectStorePaths(options);
	PolypotConfigSchema.parse(options.config);
	const yaml = YAML.stringify(options.config);

	try {
		await writeStoreFile(
			paths.configDirectory,
			paths.config,
			yaml,
			paths.configFileMode,
			paths.directoryMode,
		);
	} catch (error) {
		throw new Error(
			`Failed to write project config at ${paths.config}: ${formatError(error)}`,
		);
	}
}

/**
 * Read secrets from the global env file.
 *
 * @param options Options for the operation.
 * @returns Secrets loaded from the global env file.
 */
export async function readGlobalSecrets(
	options: ResolveConfigPathsOptions,
): Promise<PolypotSecrets> {
	return readStoreSecrets(globalStorePaths(options));
}

/**
 * Read secrets from a store env file.
 *
 * @param paths Store paths.
 * @returns Secrets loaded from the env file.
 */
async function readStoreSecrets(paths: StorePaths): Promise<PolypotSecrets> {
	try {
		const env: Record<string, string | undefined> = {};
		const result = configDotenv({
			path: paths.env,
			processEnv: env,
			quiet: true,
		});
		if (result.error !== undefined) {
			if (isMissingFileError(result.error)) return EMPTY_SECRETS;
			throw result.error;
		}
		return createPolypotSecrets(env["OPENAI_API_KEY"]);
	} catch (error) {
		throw new Error(
			`Failed to read ${paths.label} secrets at ${paths.env}: ${formatError(error)}`,
		);
	}
}

/**
 * Read secrets from the project env file.
 *
 * @param options Options for the operation.
 * @returns Secrets loaded from the project env file.
 */
export async function readProjectSecrets(
	options: ResolveConfigPathsOptions,
): Promise<PolypotSecrets> {
	return readStoreSecrets(projectStorePaths(options));
}

/**
 * Write the OpenAI API key to the global env file.
 *
 * @param options Options for the operation.
 */
export async function writeGlobalSecrets(
	options: ResolveConfigPathsOptions & {
		readonly secrets: Pick<PolypotSecrets, "openaiApiKey">;
	},
): Promise<void> {
	return writeStoreSecrets(globalStorePaths(options), options.secrets);
}

/**
 * Write the OpenAI API key to the project env file.
 *
 * @param options Options for the operation.
 */
export async function writeProjectSecrets(
	options: ResolveConfigPathsOptions & {
		readonly secrets: Pick<PolypotSecrets, "openaiApiKey">;
	},
): Promise<void> {
	return writeStoreSecrets(projectStorePaths(options), options.secrets);
}

/**
 * Write the OpenAI API key to a store env file.
 *
 * @param paths Store paths.
 * @param secrets Secret values to write.
 */
async function writeStoreSecrets(
	paths: StorePaths,
	secrets: Pick<PolypotSecrets, "openaiApiKey">,
): Promise<void> {
	const apiKey = secrets.openaiApiKey?.trim();
	if (apiKey === undefined || apiKey.length === 0) return;

	try {
		const existing = (await readOptionalUtf8File(paths.env)) ?? "";
		const lines = existing
			.split(/\r?\n/)
			.filter(
				(line) =>
					line.trim().length > 0 &&
					!line.trimStart().startsWith("OPENAI_API_KEY="),
			);
		lines.push(`OPENAI_API_KEY=${apiKey.replaceAll(/\r|\n/g, "")}`);
		await writeStoreFile(
			paths.configDirectory,
			paths.env,
			`${lines.join("\n")}\n`,
			ENV_FILE_MODE,
			paths.directoryMode,
		);
	} catch (error) {
		throw new Error(
			`Failed to write ${paths.label} secrets at ${paths.env}: ${formatError(error)}`,
		);
	}
}
