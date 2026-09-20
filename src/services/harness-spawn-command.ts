/**
 * Resolve Cursor / Antigravity spawn commands on this machine.
 * Portable names and missing foreign paths probe locally instead of
 * spawning another computer's absolute path.
 */

import { stat } from "fs/promises";
import { isAbsolutePath } from "../utils/paths";
import {
	ANTIGRAVITY_PRESET_ID,
	getAntigravityBridgeFilename,
	resolveAntigravityBridgeForSpawn,
} from "../harnesses/antigravity/paths";
import { CURSOR_PRESET_ID } from "../harnesses/cursor/preset";
import { isPortableHarnessCommand } from "./harness-command-local-storage";

export async function resolveHarnessSpawnCommand(
	agentId: string,
	command: string,
): Promise<string> {
	const trimmed = command.trim();

	if (agentId === ANTIGRAVITY_PRESET_ID) {
		const configured = isPortableHarnessCommand("antigravity", trimmed)
			? ""
			: trimmed;
		return (
			(await resolveAntigravityBridgeForSpawn(configured)) ??
			(trimmed || getAntigravityBridgeFilename())
		);
	}

	if (agentId === CURSOR_PRESET_ID) {
		const name = trimmed || "agent";
		if (!isAbsolutePath(name)) {
			return name;
		}
		try {
			const st = await stat(name);
			if (st.isFile()) return name;
		} catch {
			/* missing on this device — fall back to PATH */
		}
		return "agent";
	}

	return trimmed;
}
