import { describe, it, expect } from "vitest";
import {
	mapAntigravityAcpError,
	mapAntigravityProcessError,
	mapAntigravityMessageError,
	isAntigravityAgent,
} from "../src/harnesses/antigravity/errors";
import { AcpErrorCode } from "../src/types/errors";

const endpoint = "/Users/test/Library/agy-acp-server/agy_acp_server.par";

describe("antigravity-errors", () => {
	it("detects antigravity agent id", () => {
		expect(isAntigravityAgent("antigravity")).toBe(true);
		expect(isAntigravityAgent("cursor")).toBe(false);
	});

	it("maps missing bridge spawn errors", () => {
		const info = mapAntigravityProcessError(
			{
				type: "command_not_found",
				agentId: "antigravity",
				title: "Command Not Found",
				message: "missing",
			},
			endpoint,
		);
		expect(info.title).toContain("bridge not found");
		expect(info.message).toContain(endpoint);
		expect(info.suggestion).toMatch(/Auto-detect/i);
		expect(info.link?.url).toContain("antigravity");
	});

	it("maps auth ACP errors", () => {
		const info = mapAntigravityAcpError(
			AcpErrorCode.AUTHENTICATION_REQUIRED,
			"login required",
			endpoint,
		);
		expect(info.title).toContain("authentication");
		expect(info.message).toContain(endpoint);
	});

	it("maps timeout message errors", () => {
		const info = mapAntigravityMessageError(
			"connection timed out waiting for initialize",
			endpoint,
		);
		expect(info?.title).toContain("timed out");
	});

	it("maps unexpected process exit", () => {
		const info = mapAntigravityProcessError(
			{
				type: "agent_exited",
				agentId: "antigravity",
				exitCode: 1,
				title: "Agent Exited Unexpectedly",
				message: "exited",
			},
			endpoint,
		);
		expect(info.title).toContain("exited");
		expect(info.suggestion).toMatch(/Terminal/i);
	});
});
