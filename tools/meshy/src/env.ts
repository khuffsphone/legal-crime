import { readFileSync } from "node:fs";

/**
 * Minimal, dependency-free .env loader. Parses KEY=VALUE lines and injects them
 * into process.env WITHOUT overriding values already set in the real
 * environment (so an exported MESHY_API_KEY always wins over the file).
 *
 * Deliberately tiny — we never want a third-party dotenv in the secret path.
 * Returns the set of keys that were applied (never their values).
 */
export function loadDotEnv(path: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return []; // no .env file is fine — env vars may be exported directly
  }
  const applied: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue; // real env wins
    let value = trimmed.slice(eq + 1).trim();
    // strip matching surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    applied.push(key);
  }
  return applied;
}
