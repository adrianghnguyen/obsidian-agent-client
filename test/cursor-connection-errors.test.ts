import { describe, it, expect } from "vitest";
import {
	classifyCursorFailureKind,
	cursorFailureCopy,
	enrichCursorErrorInfo,
	isCursorAgent,
	resolveCursorEndpoint,
} from "../src/harnesses/cursor/connection-errors";
import { AcpErrorCode } from "../src/types/errors";

describe("cursor-connection-errors", () => {
	it("detects Cursor preset id", () => {
		expect(isCursorAgent("cursor")).toBe(true);
		expect(isCursorAgent("claude-code-acp")).toBe(false);
	});

	it("resolves endpoint from args and env", () => {
		expect(resolveCursorEndpoint(["acp"], {})).toBe("https://api2.cursor.sh");
		expect(
			resolveCursorEndpoint(["-e", "https://custom.example", "acp"], {}),
		).toBe("https://custom.example");
		expect(
			resolveCursorEndpoint(["acp"], { CURSOR_API_URL: "https://env.example" }),
		).toBe("https://env.example");
	});

	it("classifies missing auth", () => {
		expect(
			classifyCursorFailureKind({
				command: "agent",
				args: ["acp"],
				acpErrorCode: AcpErrorCode.AUTHENTICATION_REQUIRED,
			}),
		).toBe("auth_missing");
	});

	it("classifies CLI not found", () => {
		expect(
			classifyCursorFailureKind({
				command: "agent",
				args: ["acp"],
				errorCode: "ENOENT",
			}),
		).toBe("cli_not_found");
	});

	it("classifies unreachable endpoint with URL in copy", () => {
		const kind = classifyCursorFailureKind({
			command: "agent",
			args: ["-e", "https://bad.example", "acp"],
			errorCode: "ECONNREFUSED",
		});
		expect(kind).toBe("endpoint_unreachable");
		const copy = cursorFailureCopy(kind!, {
			command: "agent",
			args: ["-e", "https://bad.example", "acp"],
		});
		expect(copy.message).toContain("https://bad.example");
		expect(copy.title).not.toBe("Agent Error");
	});

	it("classifies process exit / timeout", () => {
		expect(
			classifyCursorFailureKind({
				command: "agent",
				args: ["acp"],
				exitCode: 1,
				errorMessage: "ACP connection closed",
			}),
		).toBe("timeout_or_exit");
	});

	it("enriches generic session errors for Cursor only", () => {
		const enriched = enrichCursorErrorInfo(
			"cursor",
			{ title: "Agent Error", message: "ENOENT agent" },
			{ command: "agent", args: ["acp"], errorCode: "ENOENT" },
		);
		expect(enriched.title).toBe("Cursor CLI Not Found");

		const unchanged = enrichCursorErrorInfo(
			"gemini-cli",
			{ title: "Agent Error", message: "ENOENT agent" },
			{ command: "agent", args: ["acp"], errorCode: "ENOENT" },
		);
		expect(unchanged.title).toBe("Agent Error");
	});
});
