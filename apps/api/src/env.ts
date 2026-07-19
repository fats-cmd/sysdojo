import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Load the nearest .env file (cwd, then up to the repo root) into
 * process.env using Node's built-in loader — no dotenv dependency.
 * Variables already set in the shell win. Returns the loaded path.
 */
export function loadDotEnv(): string | null {
  if (typeof process.loadEnvFile !== "function") return null; // Node < 20.12
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
