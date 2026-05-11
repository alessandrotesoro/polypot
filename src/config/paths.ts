import path from "node:path";

export interface ConfigPaths {
	readonly globalYaml: string;
	readonly globalEnv: string;
	readonly projectYaml: string;
	readonly projectEnv: string;
}

export interface ResolveConfigPathsOptions {
	readonly configDir: string;
	readonly cwd: string;
}

/**
 * Build global and project config paths.
 *
 * @param options Options for the operation.
 * @returns Resolved config paths.
 */
export function resolveConfigPaths({
	configDir,
	cwd,
}: ResolveConfigPathsOptions): ConfigPaths {
	return {
		globalYaml: path.join(configDir, "config.yaml"),
		globalEnv: path.join(configDir, ".env"),
		projectYaml: path.join(cwd, ".polypot", "config.yaml"),
		projectEnv: path.join(cwd, ".polypot", ".env"),
	};
}
