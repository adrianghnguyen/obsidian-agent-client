/**
 * Settings health-check for the Cursor CLI (`agent`, `agent acp`, auth).
 * Read-only shell probes — same pattern as path auto-detect.
 */

import { execFile, spawn } from "child_process";
import { Platform } from "obsidian";
import {
	buildWslShellWrapper,
	getEnhancedWindowsEnv,
	getLoginShell,
	prepareShellCommand,
} from "../../utils/platform";
import {
	resolveCommandPath,
	resolveCommandPathInWsl,
} from "../../utils/paths";
import {
	cursorFailureCopy,
	resolveCursorEndpoint,
	type CursorFailureKind,
} from "./connection-errors";

export interface CursorCliHealthCheck {
	id: "path" | "version" | "acp" | "auth";
	ok: boolean;
	message: string;
	kind?: CursorFailureKind;
}

export interface CursorCliHealthResult {
	state: "ok" | "warning" | "error";
	checks: CursorCliHealthCheck[];
	summary: string;
}

export interface CursorCliHealthOptions {
	command: string;
	args: string[];
	wslMode: boolean;
	wslDistribution?: string;
	env?: Record<string, string>;
}

const PROBE_TIMEOUT_MS = 8000;

function runLoginShell(command: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<{
	code: number | null;
	stdout: string;
	stderr: string;
}> {
	return new Promise((resolve) => {
		const shell = getLoginShell();
		const escaped = command.replace(/'/g, "'\\''");
		execFile(
			shell,
			["-l", "-c", escaped],
			{ timeout: timeoutMs, maxBuffer: 256 * 1024 },
			(err, stdout, stderr) => {
				const code =
					err && "code" in err && typeof err.code === "number"
						? err.code
						: stdout || !err
							? 0
							: 1;
				resolve({
					code,
					stdout: stdout ?? "",
					stderr: stderr ?? "",
				});
			},
		);
	});
}

function runWslShell(
	command: string,
	distribution: string | undefined,
	timeoutMs = PROBE_TIMEOUT_MS,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		const escaped = command.replace(/'/g, "'\\''");
		const args: string[] = [];
		if (distribution) {
			args.push("-d", distribution);
		}
		args.push("sh", "-c", buildWslShellWrapper(escaped));
		execFile(
			"C:\\Windows\\System32\\wsl.exe",
			args,
			{ timeout: timeoutMs, maxBuffer: 256 * 1024 },
			(err, stdout, stderr) => {
				const code =
					err && "code" in err && typeof err.code === "number"
						? err.code
						: stdout || !err
							? 0
							: 1;
				resolve({
					code,
					stdout: stdout ?? "",
					stderr: stderr ?? "",
				});
			},
		);
	});
}

async function runWindowsProbe(
	resolvedBin: string,
	probeArgs: string[],
	env: Record<string, string>,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	const prepared = prepareShellCommand(resolvedBin, probeArgs, process.cwd(), {
		wslMode: false,
		alwaysEscape: true,
	});
	const spawnEnv = getEnhancedWindowsEnv({
		...process.env,
		...env,
	});

	return new Promise((resolve) => {
		const child = spawn(prepared.command, prepared.args, {
			shell: prepared.needsShell,
			env: spawnEnv,
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill();
			resolve({
				code: null,
				stdout,
				stderr: stderr.trim() || "Probe timed out",
			});
		}, PROBE_TIMEOUT_MS);

		child.stdout?.on("data", (chunk: Buffer | string) => {
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString();
		});
		child.on("error", (err) => {
			clearTimeout(timer);
			resolve({ code: 1, stdout, stderr: err.message });
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ code, stdout, stderr });
		});
	});
}

async function runProbe(
	resolvedBin: string,
	probeArgs: string[],
	options: CursorCliHealthOptions,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	if (Platform.isWin && !options.wslMode) {
		return runWindowsProbe(resolvedBin, probeArgs, options.env ?? {});
	}

	const bin = shellQuote(resolvedBin);
	const argStr = probeArgs.map(shellQuote).join(" ");
	const shellCommand = `${bin}${argStr.length > 0 ? ` ${argStr}` : ""} 2>&1`;
	if (Platform.isWin && options.wslMode) {
		return runWslShell(shellCommand, options.wslDistribution);
	}
	return runLoginShell(shellCommand);
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}

export async function checkCursorCliHealth(
	options: CursorCliHealthOptions,
): Promise<CursorCliHealthResult> {
	const command = options.command.trim() || "agent";
	const args = options.args.length > 0 ? [...options.args] : ["acp"];
	const env = options.env ?? {};
	const endpoint = resolveCursorEndpoint(args, env);
	const checks: CursorCliHealthCheck[] = [];

	const resolved = Platform.isWin && options.wslMode
		? await resolveCommandPathInWsl(command, options.wslDistribution)
		: await resolveCommandPath(command);

	if (!resolved) {
		const copy = cursorFailureCopy("cli_not_found", {
			command,
			args,
			endpoint,
		});
		checks.push({
			id: "path",
			ok: false,
			message: copy.message,
			kind: "cli_not_found",
		});
		return finalize(checks);
	}

	checks.push({
		id: "path",
		ok: true,
		message: `Found \`${command}\` at ${resolved}`,
	});

	const versionProbe = await runProbe(resolved, ["--version"], options);
	const versionLine = versionProbe.stdout.split("\n")[0].trim();
	if (versionProbe.code !== 0 || !versionLine) {
		checks.push({
			id: "version",
			ok: false,
			message:
				versionProbe.stderr.trim() ||
				"Could not read Cursor CLI version (`agent --version`).",
			kind: "cli_not_found",
		});
		return finalize(checks);
	}

	checks.push({
		id: "version",
		ok: true,
		message: `Cursor CLI ${versionLine}`,
	});

	const acpProbe = await runProbe(resolved, ["acp", "--help"], options);
	const acpText = `${acpProbe.stdout}\n${acpProbe.stderr}`.toLowerCase();
	if (
		acpProbe.code !== 0 &&
		!acpText.includes("agent client protocol") &&
		!acpText.includes("acp")
	) {
		const copy = cursorFailureCopy("acp_unavailable", {
			command,
			args,
			endpoint,
			stderr: acpProbe.stderr,
		});
		checks.push({
			id: "acp",
			ok: false,
			message: copy.message,
			kind: "acp_unavailable",
		});
		return finalize(checks);
	}

	checks.push({
		id: "acp",
		ok: true,
		message: "`agent acp` is available for ACP sessions.",
	});

	const signedIn = await isCursorCliSignedIn(options, resolved);

	if (hasCursorApiKey(env)) {
		checks.push({
			id: "auth",
			ok: true,
			message: "Authenticated via CURSOR_API_KEY.",
		});
		return finalize(checks);
	}

	if (!signedIn) {
		const statusProbe = await runProbe(resolved, ["status"], options);
		const copy = cursorFailureCopy("auth_missing", {
			command,
			args,
			endpoint,
			stderr: statusProbe.stderr || statusProbe.stdout,
		});
		checks.push({
			id: "auth",
			ok: false,
			message: copy.message,
			kind: "auth_missing",
		});
		return finalize(checks);
	}

	checks.push({
		id: "auth",
		ok: true,
		message: "Signed in (`agent status` OK).",
	});

	return finalize(checks);
}

export type CursorCliSignInProbeOptions = Pick<
	CursorCliHealthOptions,
	"command" | "args" | "wslMode" | "wslDistribution" | "env"
>;

/**
 * True when CURSOR_API_KEY is configured or `agent status` reports a login.
 * When `resolvedBin` is omitted, resolves `command` on this machine first.
 */
export async function isCursorCliSignedIn(
	options: CursorCliSignInProbeOptions,
	resolvedBin?: string,
): Promise<boolean> {
	const env = options.env ?? {};
	if (hasCursorApiKey(env)) {
		return true;
	}

	const command = options.command.trim() || "agent";
	const probeOptions: CursorCliHealthOptions = {
		command,
		args:
			options.args && options.args.length > 0
				? [...options.args]
				: ["acp"],
		wslMode: options.wslMode ?? false,
		wslDistribution: options.wslDistribution,
		env,
	};

	const resolved =
		resolvedBin ??
		(Platform.isWin && probeOptions.wslMode
			? await resolveCommandPathInWsl(
					command,
					probeOptions.wslDistribution,
				)
			: await resolveCommandPath(command));

	if (!resolved) {
		return false;
	}

	const statusProbe = await runProbe(resolved, ["status"], probeOptions);
	const statusText = `${statusProbe.stdout}\n${statusProbe.stderr}`;
	return (
		statusProbe.code === 0 && isCursorStatusAuthenticated(statusText)
	);
}

/** True when Cursor CLI status output shows a real login (not API-key mode). */
export function isCursorStatusAuthenticated(statusText: string): boolean {
	const text = statusText.toLowerCase();
	if (!text.trim()) return false;
	if (/\bnot logged in\b/.test(text)) return false;
	if (/\bunauthenticated\b/.test(text)) return false;
	return true;
}

export function hasCursorApiKey(
	env: Record<string, string> | undefined,
): boolean {
	return Boolean(
		env?.CURSOR_API_KEY?.trim() || process.env.CURSOR_API_KEY?.trim(),
	);
}

function finalize(checks: CursorCliHealthCheck[]): CursorCliHealthResult {
	const failed = checks.filter((c) => !c.ok);
	if (failed.length === 0) {
		return {
			state: "ok",
			checks,
			summary: "Cursor CLI, ACP, and authentication look good.",
		};
	}
	const first = failed[0];
	const copy = first.kind
		? cursorFailureCopy(first.kind, { command: "agent", args: ["acp"] })
		: null;
	return {
		state: "error",
		checks,
		summary: copy?.suggestion ?? first.message,
	};
}
