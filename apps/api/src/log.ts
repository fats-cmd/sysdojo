/** Tiny prefixed logger so API output is greppable and timestamped. */

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  info(...args: unknown[]): void {
    console.log(`[sysdojo ${stamp()}]`, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(`[sysdojo ${stamp()}] WARN`, ...args);
  },
  error(...args: unknown[]): void {
    console.error(`[sysdojo ${stamp()}] ERROR`, ...args);
  },
};
