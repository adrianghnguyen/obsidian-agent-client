import type { ProcessError } from "../../types/errors";
import type { PresetAgentDefinition } from "./preset-types";

/** Optional vendor ACP extension registered at AcpClient init (future slot). */
export interface VendorAcpExtension {
	readonly id: string;
}

/** Extract display command from tool rawInput (future slot). */
export interface TraceCommandExtractor {
	readonly harnessId: string;
	extract(rawInput: unknown): string | null;
}

export interface HealthContext {
	readonly agentId: string;
	readonly command?: string;
	readonly args?: readonly string[];
	readonly wslMode?: boolean;
	readonly wslDistribution?: string;
	readonly env?: Record<string, string>;
}

export interface HealthCheckItem {
	readonly ok: boolean;
	readonly message: string;
}

export interface HealthReport {
	readonly ok: boolean;
	readonly message?: string;
	readonly summary?: string;
	readonly checks?: readonly HealthCheckItem[];
}

export interface ConnectionErrorContext {
	readonly command?: string;
	readonly args?: readonly string[];
	readonly env?: Record<string, string>;
	readonly stderr?: string;
}

export interface ConnectionErrorCard {
	readonly title: string;
	readonly body: string;
	readonly suggestion?: string;
	readonly link?: { text: string; url: string };
}

export interface PackageUpdateRule {
	readonly packageName: string;
}

export interface AgentNotice {
	readonly id: string;
	readonly message: string;
}

export interface HarnessDocsManifest {
	readonly page: string;
}

/**
 * One first-class harness module: preset row plus optional extension slots.
 * Shared chat/ACP/session code reads only what it needs; empty slots are no-ops.
 */
export interface HarnessDefinition {
	readonly preset: PresetAgentDefinition;
	readonly vendorAcp?: readonly VendorAcpExtension[];
	readonly traceAdapters?: readonly TraceCommandExtractor[];
	readonly healthCheck?: (ctx: HealthContext) => Promise<HealthReport>;
	readonly mapConnectionError?: (
		err: ProcessError,
		ctx?: ConnectionErrorContext,
	) => ConnectionErrorCard | null;
	/**
	 * ACP authenticate method id to call after initialize and before
	 * session/new. Absent = no extra authenticate (Cursor and other
	 * login-via-CLI harnesses).
	 */
	readonly authenticateBeforeNewSession?: string;
	readonly updateRules?: readonly PackageUpdateRule[];
	readonly notices?: readonly AgentNotice[];
	readonly docs?: HarnessDocsManifest;
}
