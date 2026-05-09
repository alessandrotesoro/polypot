/** Marker prefix for stub command output; grep target for cleanup. */
export const STUB_PHASE2 = '[stub]'

export const polypotEnv = (flagName: string): string =>
  `POLYPOT_${flagName.replaceAll('-', '_').toUpperCase()}`
