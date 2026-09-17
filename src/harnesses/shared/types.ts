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
}

export interface HealthReport {
	readonly ok: boolean;
	readonly message?: string;
}

export interface ConnectionErrorCard {
	readonly title: string;
	readonly body: string;
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
	) => ConnectionErrorCard | null;
	readonly updateRules?: readonly PackageUpdateRule[];
	readonly notices?: readonly AgentNotice[];
	readonly docs?: HarnessDocsManifest;
}
