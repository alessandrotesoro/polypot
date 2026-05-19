import { Command, type Interfaces } from "@oclif/core";
import {
	type LoadPolypotConfigOptions,
	loadPolypotRuntimeConfig,
} from "./config/loader.js";
import type { PolypotConfig } from "./config/schema.js";
import type { PolypotSecrets } from "./config/secrets.js";

export type BaseFlags<T extends typeof Command> = Interfaces.InferredFlags<
	T["flags"]
>;
export type BaseArgs<T extends typeof Command> = Interfaces.InferredArgs<
	T["args"]
>;

interface ConfigDiscoveryFlags {
	readonly config?: string;
	readonly "no-config"?: boolean;
	readonly "no-env"?: boolean;
}

/**
 * Build config lookup options from parsed flags.
 *
 * @param flags Parsed command flags.
 * @returns Config lookup options.
 */
function extractDiscoveryOptions(
	flags: ConfigDiscoveryFlags,
): LoadPolypotConfigOptions {
	return {
		...(flags.config !== undefined && { configPath: flags.config }),
		...(flags["no-config"] !== undefined && {
			noConfig: flags["no-config"],
		}),
		...(flags["no-env"] !== undefined && { noEnv: flags["no-env"] }),
	};
}

/**
 * Command base class that loads Polypot config first.
 */
export abstract class BaseCommand<T extends typeof Command> extends Command {
	protected flags!: BaseFlags<T>;
	protected args!: BaseArgs<T>;
	protected appConfig!: PolypotConfig;
	protected runtimeSecrets!: PolypotSecrets;

	/**
	 * Parse command input and load runtime config.
	 */
	public override async init(): Promise<void> {
		await super.init();

		const { args, flags } = await this.parse({
			args: this.ctor.args,
			enableJsonFlag: this.ctor.enableJsonFlag,
			flags: this.ctor.flags,
			strict: this.ctor.strict,
		});
		this.flags = flags as BaseFlags<T>;
		this.args = args as BaseArgs<T>;

		const runtimeConfig = await loadPolypotRuntimeConfig({
			configDir: this.config.configDir,
			cwd: process.cwd(),
			options: extractDiscoveryOptions(flags as ConfigDiscoveryFlags),
		});
		this.appConfig = runtimeConfig.config;
		this.runtimeSecrets = runtimeConfig.secrets;
	}
}
