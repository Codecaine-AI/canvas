// Shared Codecaine environment: one private KEY=value file every Codecaine service reads.
// Background services do not inherit the user's shell, so keys live here instead of in .zshrc.
// The same file is copied into canvas-mcp and prompt-kit-mcp; keep the copies identical.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** CODECAINE_ENV_FILE overrides the location, for tests and isolated services. */
export const codecaineEnvPath = () => process.env.CODECAINE_ENV_FILE || join(homedir(), '.config', 'codecaine', 'env');

/** Parse KEY=value lines. Comments, blank lines, malformed lines, and empty values are skipped. */
export function parseCodecaineEnv(text: string): Record<string, string> {
 const out: Record<string, string> = {};
 for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if (!match) continue;
  let value = match[2]!.trim();
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) value = value.slice(1, -1);
  if (value) out[match[1]!] = value;
 }
 return out;
}

/** The file's variables. A missing or unreadable file reads as empty. */
export function readCodecaineEnv(path = codecaineEnvPath()): Record<string, string> {
 try { return parseCodecaineEnv(readFileSync(path, 'utf8')); } catch { return {}; }
}

/** One variable, read at call time so a newly added key works without a restart. The process environment wins. */
export function codecaineEnv(name: string): string | undefined {
 return process.env[name] || readCodecaineEnv()[name];
}

/** Copy the file's variables into process.env at startup. Variables already set are kept. */
export function loadCodecaineEnv(path = codecaineEnvPath()): string[] {
 const loaded: string[] = [];
 for (const [name, value] of Object.entries(readCodecaineEnv(path))) {
  if (process.env[name]) continue;
  process.env[name] = value;
  loaded.push(name);
 }
 return loaded;
}
