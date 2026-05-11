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

function isMissingFileError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error.code === "ENOENT" || error.code === "ENOTDIR")
	);
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await fs.access(path);
		return true;
	} catch (error) {
		if (isMissingFileError(error)) return false;
		throw error;
	}
}

async function readOptionalUtf8File(path: string): Promise<string | undefined> {
	try {
		return await fs.readFile(path, "utf8");
	} catch (error) {
		if (isMissingFileError(error)) return undefined;
		throw error;
	}
}

async function ensureConfigDir(configDir: string): Promise<void> {
	await fs.mkdir(configDir, { recursive: true, mode: DIRECTORY_MODE });
	await fs.chmod(configDir, DIRECTORY_MODE).catch(() => {});
}

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

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function parsePolypotConfig(raw: string): PolypotConfig {
	return PolypotConfigSchema.parse(YAML.parse(raw) ?? {});
}

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

export async function readGlobalConfig(
	options: ResolveConfigPathsOptions,
): Promise<PolypotConfig> {
	return (await readGlobalConfigStatus(options)).config;
}

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
