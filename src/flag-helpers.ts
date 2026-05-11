export const STUB = "[stub]";

/**
 * Build the environment variable name for a flag.
 *
 * @param flagName Flag name to convert.
 * @returns The environment variable name.
 */
export const polypotEnv = (flagName: string): string =>
	`POLYPOT_${flagName.replaceAll("-", "_").toUpperCase()}`;
