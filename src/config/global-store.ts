import fs from "node:fs/promises";
import { configDotenv } from "dotenv";
import YAML from "yaml";
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
const ENV_FILE_MODE = 0o600;

/**
 * Check whether an error means a path is missing.
 *
 * @param error Error to inspect.
 * @returns True when the error is a missing path error.
 */
function isMissingFileError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error.code === "ENOENT" || error.code === "ENOTDIR")
	);
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
 * Read a UTF-8 file when it exists.
 *
 * @param path File path to check or write.
 * @returns File contents, or undefined when the path is missing.
 */
async function readOptionalUtf8File(path: string): Promise<string | undefined> {
	try {
		return await fs.readFile(path, "utf8");
	} catch (error) {
		if (isMissingFileError(error)) return undefined;
		throw error;
	}
}

/**
 * Create the config directory with private permissions.
 *
 * @param configDir Directory that stores config files.
 */
async function ensureConfigDir(configDir: string): Promise<void> {
	await fs.mkdir(configDir, { recursive: true, mode: DIRECTORY_MODE });
	await fs.chmod(configDir, DIRECTORY_MODE).catch(() => {});
}

/**
 * Write a private config or secret file.
 *
 * @param configDir Directory that stores config files.
 * @param path File path to check or write.
 * @param contents File contents to write.
 * @param mode POSIX file mode to apply.
 */
async function writeRestrictedFile(
	configDir: string,
	path: string,
	contents: string,
	mode: number,
): Promise<void> {
	await ensureConfigDir(configDir);
	await fs.writeFile(path, contents, { mode });
	await fs.chmod(path, mode).catch(() => {});
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
 * Parse YAML into Polypot config.
 *
 * @param raw Raw YAML text.
 * @returns Parsed Polypot config.
 */
function parsePolypotConfig(raw: string): PolypotConfig {
	return PolypotConfigSchema.parse(YAML.parse(raw) ?? {});
}

/**
 * Read config from an explicit path.
 *
 * @param configPath Config file path.
 * @returns Parsed config from the file.
 */
export async function readPolypotConfigFile(
	configPath: string,
): Promise<PolypotConfig> {
	try {
		return parsePolypotConfig(await fs.readFile(configPath, "utf8"));
	} catch (error) {
		throw new Error(
			`Failed to read config at ${configPath}: ${formatError(error)}`,
		);
	}
}

/**
 * Read global config and report whether the file exists.
 *
 * @param options Options for the operation.
 * @returns Global config and existence state.
 */
export async function readGlobalConfigStatus(
	options: ResolveConfigPathsOptions,
): Promise<{ readonly config: PolypotConfig; readonly exists: boolean }> {
	const paths = resolveConfigPaths(options);

	try {
		const raw = await readOptionalUtf8File(paths.globalYaml);
		return raw === undefined
			? { config: PolypotConfigSchema.parse({}), exists: false }
			: { config: parsePolypotConfig(raw), exists: true };
	} catch (error) {
		throw new Error(
			`Failed to read global config at ${paths.globalYaml}: ${formatError(error)}`,
		);
	}
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
 * Check whether any global config files exist.
 *
 * @param options Options for the operation.
 * @returns True when a global config or env file exists.
 */
export async function hasGlobalStoreFiles(
	options: ResolveConfigPathsOptions,
): Promise<boolean> {
	const paths = resolveConfigPaths(options);
	const [hasConfig, hasSecrets] = await Promise.all([
		pathExists(paths.globalYaml),
		pathExists(paths.globalEnv),
	]);
	return hasConfig || hasSecrets;
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
	const paths = resolveConfigPaths(options);
	const config = PolypotConfigSchema.parse(options.config);
	const yaml = YAML.stringify(config);

	try {
		await writeRestrictedFile(
			options.configDir,
			paths.globalYaml,
			yaml,
			CONFIG_FILE_MODE,
		);
	} catch (error) {
		throw new Error(
			`Failed to write global config at ${paths.globalYaml}: ${formatError(error)}`,
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
	const paths = resolveConfigPaths(options);

	try {
		const env: Record<string, string | undefined> = {};
		const result = configDotenv({
			path: paths.globalEnv,
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
			`Failed to read global secrets at ${paths.globalEnv}: ${formatError(error)}`,
		);
	}
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
	const paths = resolveConfigPaths(options);
	const apiKey = options.secrets.openaiApiKey?.trim();
	if (apiKey === undefined || apiKey.length === 0) return;

	try {
		const existing = (await readOptionalUtf8File(paths.globalEnv)) ?? "";
		const lines = existing
			.split(/\r?\n/)
			.filter(
				(line) =>
					line.trim().length > 0 &&
					!line.trimStart().startsWith("OPENAI_API_KEY="),
			);
		lines.push(`OPENAI_API_KEY=${apiKey.replaceAll(/\r|\n/g, "")}`);
		await writeRestrictedFile(
			options.configDir,
			paths.globalEnv,
			`${lines.join("\n")}\n`,
			ENV_FILE_MODE,
		);
	} catch (error) {
		throw new Error(
			`Failed to write global secrets at ${paths.globalEnv}: ${formatError(error)}`,
		);
	}
}
