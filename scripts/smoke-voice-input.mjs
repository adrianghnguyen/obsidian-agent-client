#!/usr/bin/env node
/**
 * Live smoke wrapper — requires GEMINI_API_KEY.
 * Delegates to Vitest so TypeScript sources resolve.
 *
 *   GEMINI_API_KEY=... npm run smoke:voice
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!apiKey) {
	console.error("Set GEMINI_API_KEY (or GOOGLE_API_KEY) to run smoke:voice");
	process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
	process.platform === "win32" ? "npx.cmd" : "npx",
	["vitest", "run", "test/voice-input/smoke-voice-live.test.ts"],
	{
		cwd: root,
		stdio: "inherit",
		env: process.env,
		shell: process.platform === "win32",
	},
);

process.exit(result.status ?? 1);
