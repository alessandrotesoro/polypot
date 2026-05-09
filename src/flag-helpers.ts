export const STUB = '[stub]'

export const polypotEnv = (flagName: string): string =>
  `POLYPOT_${flagName.replaceAll('-', '_').toUpperCase()}`
