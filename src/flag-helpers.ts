// Small helpers shared by command flag declarations.

/** "[stub]" prefix used by every Phase 1 command's stub `run()` body so a
 * single grep finds them all when Phase 2 ships and they need to go. */
export const STUB_PHASE2 = '[stub]'

/** Derive a `POLYPOT_<UPPER_SNAKE>` env-var name from a flag name. */
export const polypotEnv = (flagName: string): string =>
  `POLYPOT_${flagName.replaceAll('-', '_').toUpperCase()}`
