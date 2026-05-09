import path from 'node:path'

export interface ConfigPaths {
  globalYaml: string
  globalEnv: string
  projectYaml: string
  projectEnv: string
}

export interface ResolveConfigPathsOptions {
  /** OCLIF's `this.config.configDir` (XDG-aware on Unix, %LOCALAPPDATA% on Windows). */
  configDir: string
  /** Project working directory — `.polypot/` is resolved underneath this. */
  cwd: string
}

/**
 * Resolve the four canonical config paths for a polypot invocation.
 *
 * Pure path math, no I/O. Phase 2's loader consumes this; Phase 1 ships it
 * so the API is locked in early.
 */
export function resolveConfigPaths({configDir, cwd}: ResolveConfigPathsOptions): ConfigPaths {
  return {
    globalYaml: path.join(configDir, 'config.yaml'),
    globalEnv: path.join(configDir, '.env'),
    projectYaml: path.join(cwd, '.polypot', 'config.yaml'),
    projectEnv: path.join(cwd, '.polypot', '.env'),
  }
}
